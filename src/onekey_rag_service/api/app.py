from __future__ import annotations

import asyncio
import logging
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from onekey_rag_service.config import Settings, get_settings
from onekey_rag_service.crawler.pipeline import crawl_and_store_pages
from onekey_rag_service.db import create_db_engine, create_session_factory, ensure_indexes, ensure_pgvector_extension
from onekey_rag_service.indexing.pipeline import index_pages_to_chunks
from onekey_rag_service.logging import configure_logging
from onekey_rag_service.models import Base, Feedback, Job
from onekey_rag_service.rag.chat_provider import build_chat_provider, now_unix
from onekey_rag_service.rag.embeddings import build_embeddings_provider
from onekey_rag_service.rag.pipeline import answer_with_rag, prepare_rag
from onekey_rag_service.rag.reranker import build_reranker
from onekey_rag_service.schemas import (
    AdminCrawlRequest,
    AdminIndexRequest,
    AdminJobResponse,
    AdminJobStatusResponse,
    FeedbackRequest,
    FeedbackResponse,
    HealthResponse,
    OpenAIChatCompletionsRequest,
    OpenAIChatCompletionsResponse,
    OpenAIChatCompletionsResponseChoice,
    OpenAIChatCompletionsResponseChoiceMessage,
    OpenAIUsage,
)

logger = logging.getLogger(__name__)

app = FastAPI(title="OneKey RAG Service", version="0.1.0")

# 前端 Widget（/widget/widget.js + /widget/）
_WIDGET_DIR = Path(__file__).resolve().parents[1] / "static" / "widget"
app.mount("/widget", StaticFiles(directory=str(_WIDGET_DIR), html=True, check_dir=False), name="widget")


@app.middleware("http")
async def _widget_headers(request: Request, call_next):
    resp = await call_next(request)
    if request.url.path.startswith("/widget"):
        settings: Settings = getattr(request.app.state, "settings", get_settings())
        if settings.widget_frame_ancestors:
            resp.headers["Content-Security-Policy"] = f"frame-ancestors {settings.widget_frame_ancestors}"
    return resp


@app.exception_handler(HTTPException)
async def _openai_http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "message": exc.detail if isinstance(exc.detail, str) else str(exc.detail),
                "type": "invalid_request_error",
                "param": None,
                "code": None,
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def _openai_validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=400,
        content={
            "error": {
                "message": "请求参数校验失败",
                "type": "invalid_request_error",
                "param": None,
                "code": None,
                "details": exc.errors(),
            }
        },
    )


@app.exception_handler(Exception)
async def _openai_unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("未处理异常 path=%s err=%s", request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "message": "服务内部错误",
                "type": "internal_error",
                "param": None,
                "code": None,
            }
        },
    )


def get_db(request: Request) -> Session:
    session_factory = request.app.state.SessionLocal
    db = session_factory()
    try:
        yield db
    finally:
        db.close()


@app.on_event("startup")
def _startup() -> None:
    settings: Settings = get_settings()
    configure_logging(settings.log_level)

    engine = create_db_engine(settings)
    ensure_pgvector_extension(engine)
    Base.metadata.create_all(engine)
    ensure_indexes(engine, settings)

    app.state.settings = settings
    app.state.engine = engine
    app.state.SessionLocal = create_session_factory(engine)

    embeddings, embedding_model_name = build_embeddings_provider(settings)
    app.state.embeddings = embeddings
    app.state.embedding_model_name = embedding_model_name
    app.state.chat = build_chat_provider(settings)
    app.state.reranker = build_reranker(settings)
    app.state.chat_model_map = settings.chat_model_map()
    app.state.chat_semaphore = asyncio.Semaphore(max(1, int(settings.max_concurrent_chat_requests or 1)))

    logger.info("启动完成 env=%s", settings.app_env)


@app.get("/healthz", response_model=HealthResponse)
def healthz(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(status="ok", dependencies={"postgres": "ok", "pgvector": "ok"})


@app.get("/v1/models")
def openai_list_models():
    settings: Settings = app.state.settings
    model_map: dict[str, str] = app.state.chat_model_map

    exposed = model_map or {"onekey-docs": settings.chat_model}
    return {
        "object": "list",
        "data": [
            {
                "id": model_id,
                "object": "model",
                "created": now_unix(),
                "owned_by": "onekey",
                "root": model_id,
                "parent": None,
                "meta": {"upstream_model": upstream_model, "base_url": str(settings.chat_base_url)},
            }
            for model_id, upstream_model in exposed.items()
        ],
    }


@app.post("/admin/crawl", response_model=AdminJobResponse)
async def admin_crawl(
    req: AdminCrawlRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
) -> AdminJobResponse:
    settings: Settings = app.state.settings
    jobs_backend = (settings.jobs_backend or "worker").lower()
    job_id = f"crawl_{uuid.uuid4().hex[:12]}"
    job = Job(id=job_id, type="crawl", status=("queued" if jobs_backend == "worker" else "running"), payload=req.model_dump(), progress={})
    db.add(job)
    db.commit()

    if jobs_backend == "worker":
        return AdminJobResponse(job_id=job_id)

    async def _run() -> None:
        session_factory = app.state.SessionLocal
        with session_factory() as session:
            job_row = session.get(Job, job_id)
            if not job_row:
                return
            try:
                result = await crawl_and_store_pages(
                    session,
                    base_url=str(settings.crawl_base_url),
                    sitemap_url=req.sitemap_url or str(settings.crawl_sitemap_url),
                    max_pages=req.max_pages or settings.crawl_max_pages,
                    seed_urls=req.seed_urls,
                    include_patterns=req.include_patterns,
                    exclude_patterns=req.exclude_patterns,
                    mode=req.mode,
                )
                job_row.status = "succeeded"
                job_row.progress = result.__dict__
            except Exception as e:
                logger.exception("crawl 任务失败 job_id=%s err=%s", job_id, e)
                job_row.status = "failed"
                job_row.error = str(e)
            finally:
                session.commit()

    background.add_task(_run)
    return AdminJobResponse(job_id=job_id)


@app.get("/admin/crawl/{job_id}", response_model=AdminJobStatusResponse)
def admin_crawl_status(job_id: str, db: Session = Depends(get_db)) -> AdminJobStatusResponse:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return AdminJobStatusResponse(job_id=job.id, status=job.status, progress=job.progress, error=job.error)


@app.post("/admin/index", response_model=AdminJobResponse)
def admin_index(
    req: AdminIndexRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
) -> AdminJobResponse:
    settings: Settings = app.state.settings
    jobs_backend = (settings.jobs_backend or "worker").lower()
    job_id = f"index_{uuid.uuid4().hex[:12]}"
    job = Job(id=job_id, type="index", status=("queued" if jobs_backend == "worker" else "running"), payload=req.model_dump(), progress={})
    db.add(job)
    db.commit()

    if jobs_backend == "worker":
        return AdminJobResponse(job_id=job_id)

    def _run() -> None:
        session_factory = app.state.SessionLocal
        embeddings = app.state.embeddings
        embedding_model_name = app.state.embedding_model_name
        with session_factory() as session:
            job_row = session.get(Job, job_id)
            if not job_row:
                return
            try:
                progress = index_pages_to_chunks(
                    session,
                    embeddings=embeddings,
                    embedding_model_name=embedding_model_name,
                    chunk_max_chars=settings.chunk_max_chars,
                    chunk_overlap_chars=settings.chunk_overlap_chars,
                    mode=req.mode,
                )
                job_row.status = "succeeded"
                job_row.progress = progress
            except Exception as e:
                logger.exception("index 任务失败 job_id=%s err=%s", job_id, e)
                job_row.status = "failed"
                job_row.error = str(e)
            finally:
                session.commit()

    background.add_task(_run)
    return AdminJobResponse(job_id=job_id)


@app.get("/admin/index/{job_id}", response_model=AdminJobStatusResponse)
def admin_index_status(job_id: str, db: Session = Depends(get_db)) -> AdminJobStatusResponse:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return AdminJobStatusResponse(job_id=job.id, status=job.status, progress=job.progress, error=job.error)


@app.post("/v1/chat/completions")
async def openai_chat_completions(
    req: OpenAIChatCompletionsRequest,
    db: Session = Depends(get_db),
):
    request_messages = [{"role": m.role, "content": m.content} for m in req.messages]
    question = ""
    for m in reversed(req.messages):
        if m.role == "user":
            question = m.content
            break
    if not question:
        raise HTTPException(status_code=400, detail="messages 中缺少 user 内容")

    settings: Settings = app.state.settings
    embeddings = app.state.embeddings
    chat = app.state.chat
    reranker = app.state.reranker
    model_map: dict[str, str] = app.state.chat_model_map

    if req.model in model_map:
        upstream_model = model_map[req.model]
    elif settings.chat_model_passthrough:
        upstream_model = req.model
    else:
        upstream_model = settings.chat_model

    temperature = req.temperature if req.temperature is not None else settings.chat_default_temperature
    top_p = req.top_p if req.top_p is not None else settings.chat_default_top_p
    max_tokens = req.max_tokens if req.max_tokens is not None else settings.chat_default_max_tokens

    chat_id = f"chatcmpl_{uuid.uuid4().hex}"
    created = now_unix()
    sem = getattr(app.state, "chat_semaphore", None)

    if not req.stream:
        if sem:
            await sem.acquire()
        try:
            rag = await asyncio.wait_for(
                answer_with_rag(
                    db,
                    settings=settings,
                    embeddings=embeddings,
                    chat=chat,
                    reranker=reranker,
                    chat_model=upstream_model,
                    request_messages=request_messages,
                    question=question,
                    temperature=temperature,
                    top_p=top_p,
                    max_tokens=max_tokens,
                    debug=req.debug,
                ),
                timeout=settings.rag_total_timeout_s,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=504, detail="请求超时，请稍后重试或缩短问题/上下文")
        finally:
            if sem:
                sem.release()

        resp = OpenAIChatCompletionsResponse(
            id=chat_id,
            created=created,
            model=req.model,
            choices=[
                OpenAIChatCompletionsResponseChoice(
                    index=0,
                    message=OpenAIChatCompletionsResponseChoiceMessage(role="assistant", content=rag.answer),
                    finish_reason="stop",
                )
            ],
            usage=OpenAIUsage(**(rag.usage or {})),
            sources=rag.sources,  # type: ignore[arg-type]
            debug=rag.debug,
        )
        return JSONResponse(resp.model_dump())

    async def event_stream():
        if sem:
            await sem.acquire()
        try:
        # 首包声明 assistant 角色（部分 OpenAI 客户端依赖）
            yield f"data: {json_dumps({'id': chat_id,'object':'chat.completion.chunk','created': created,'model': req.model,'choices':[{'index':0,'delta':{'role':'assistant'},'finish_reason':None}]})}\n\n"

            prepared = None
            try:
                prepared = await asyncio.wait_for(
                    prepare_rag(
                        db,
                        settings=settings,
                        embeddings=embeddings,
                        chat=chat,
                        reranker=reranker,
                        chat_model=upstream_model,
                        request_messages=request_messages,
                        question=question,
                        debug=req.debug,
                    ),
                    timeout=settings.rag_prepare_timeout_s,
                )
            except asyncio.TimeoutError:
                err_text = "\n\n[错误] 检索/上下文准备超时：请缩短问题或稍后重试"
                for part in _chunk_text(err_text, chunk_size=80):
                    data = {
                        "id": chat_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": req.model,
                        "choices": [{"index": 0, "delta": {"content": part}, "finish_reason": None}],
                    }
                    yield f"data: {json_dumps(data)}\n\n"
            except Exception as e:
                err_text = f"\n\n[错误] 检索/上下文准备失败：{str(e)}"
                for part in _chunk_text(err_text, chunk_size=80):
                    data = {
                        "id": chat_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": req.model,
                        "choices": [{"index": 0, "delta": {"content": part}, "finish_reason": None}],
                    }
                    yield f"data: {json_dumps(data)}\n\n"

            sources = (prepared.sources if prepared else []) or []

            # 可选：把 sources 以“参考/来源”形式附在最终文本里（便于只认 content 的客户端）
            sources_tail = ""
            if sources and settings.answer_append_sources:
                if settings.inline_citations_enabled:
                    lines = ["\n\n参考："]
                    for i, s in enumerate(sources, start=1):
                        ref = int(s.get("ref") or i)
                        title = (s.get("title") or "").strip()
                        url = (s.get("url") or "").strip()
                        if title:
                            lines.append(f"[{ref}] {title} - {url}")
                        else:
                            lines.append(f"[{ref}] {url}")
                    sources_tail = "\n".join(lines).rstrip()
                else:
                    sources_tail = "\n\n来源：\n" + "\n".join([f"- {s['url']}" for s in sources if s.get("url")])

            no_chat_text = ""
            if (not chat) and prepared and prepared.direct_answer is None and sources:
                no_chat_text = (
                    "当前服务未配置上游 ChatModel（CHAT_API_KEY），因此无法生成高质量自然语言回答。\n\n"
                    "下面是检索到的相关文档片段（请优先查看来源链接）：\n"
                    + "\n".join([f"- {s.get('title') or s.get('url')}（{s.get('url')}）" for s in sources[:5]])
                )

            if (not prepared) or prepared.direct_answer is not None or not prepared.messages or not chat:
                base_text = (prepared.direct_answer if prepared else "") or no_chat_text or ""
                tail = sources_tail if (prepared and prepared.direct_answer is not None) else ""
                for part in _chunk_text(base_text + tail, chunk_size=60):
                    data = {
                        "id": chat_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": req.model,
                        "choices": [{"index": 0, "delta": {"content": part}, "finish_reason": None}],
                    }
                    yield f"data: {json_dumps(data)}\n\n"
            else:
                try:
                    async for part in chat.stream(
                        model=upstream_model,
                        messages=prepared.messages,
                        temperature=temperature,
                        top_p=top_p,
                        max_tokens=max_tokens,
                    ):
                        if not part:
                            continue
                        data = {
                            "id": chat_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": req.model,
                            "choices": [{"index": 0, "delta": {"content": part}, "finish_reason": None}],
                        }
                        yield f"data: {json_dumps(data)}\n\n"

                    if sources_tail:
                        data = {
                            "id": chat_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": req.model,
                            "choices": [{"index": 0, "delta": {"content": sources_tail}, "finish_reason": None}],
                        }
                        yield f"data: {json_dumps(data)}\n\n"
                except Exception as e:
                    # 流式过程中无法再改 HTTP 状态码，采用“内容内报错 + 结束事件”兜底
                    err_text = f"\n\n[错误] 上游模型流式输出失败：{str(e)}"
                    for part in _chunk_text(err_text, chunk_size=80):
                        data = {
                            "id": chat_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": req.model,
                            "choices": [{"index": 0, "delta": {"content": part}, "finish_reason": None}],
                        }
                        yield f"data: {json_dumps(data)}\n\n"

            # 正常结束 chunk（OpenAI 习惯在最后给 finish_reason）
            yield f"data: {json_dumps({'id': chat_id,'object':'chat.completion.chunk','created': created,'model': req.model,'choices':[{'index':0,'delta':{},'finish_reason':'stop'}]})}\n\n"

            sources_event = {"id": chat_id, "object": "chat.completion.sources", "sources": sources}
            yield f"data: {json_dumps(sources_event)}\n\n"
            yield "data: [DONE]\n\n"
        finally:
            if sem:
                sem.release()

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/v1/feedback", response_model=FeedbackResponse)
def feedback(req: FeedbackRequest, db: Session = Depends(get_db)) -> FeedbackResponse:
    fb = Feedback(
        conversation_id=req.conversation_id,
        message_id=req.message_id,
        rating=req.rating,
        reason=req.reason or "",
        comment=req.comment or "",
        sources={"urls": req.sources or []},
    )
    db.add(fb)
    db.commit()
    return FeedbackResponse()


def _chunk_text(text: str, *, chunk_size: int) -> list[str]:
    if chunk_size <= 0:
        return [text]
    return [text[i : i + chunk_size] for i in range(0, len(text), chunk_size)]


def json_dumps(obj) -> str:
    import json

    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
