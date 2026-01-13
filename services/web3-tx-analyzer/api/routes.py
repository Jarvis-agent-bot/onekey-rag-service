from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from analyzer import TxParser
from analyzer.schemas import TxParseResult, ExplanationResult as AnalyzerExplanation
from clients import RAGClient
from config import Settings, get_settings
from app_logging import Tracer, get_logger, bind_context, clear_context
from storage import RedisCache, get_db_context, ParseLog

from .schemas import (
    TxAnalyzeRequest,
    TxAnalyzeResponse,
    TxParseRequest,
    TxParseResponse,
    ExplanationResult,
    ChainInfo,
    HealthResponse,
)

logger = get_logger(__name__)
router = APIRouter()


def get_parser(request: Request) -> TxParser:
    """获取解析器实例"""
    return request.app.state.parser


def get_rag_client(request: Request) -> RAGClient:
    """获取 RAG 客户端实例"""
    return request.app.state.rag_client


def get_cache(request: Request) -> RedisCache | None:
    """获取缓存实例"""
    return getattr(request.app.state, "cache", None)


@router.get("/healthz", response_model=HealthResponse)
async def health_check(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> HealthResponse:
    """健康检查"""
    dependencies: dict[str, str] = {}

    # 检查 RAG 服务
    rag_client = get_rag_client(request)
    if rag_client:
        try:
            rag_ok = await rag_client.health_check()
            dependencies["rag"] = "ok" if rag_ok else "unhealthy"
        except Exception:
            dependencies["rag"] = "unhealthy"
    else:
        dependencies["rag"] = "not_configured"

    # 检查 Redis
    cache = get_cache(request)
    if cache:
        try:
            await cache.set("health_check", {"status": "ok"}, 10)
            dependencies["redis"] = "ok"
        except Exception:
            dependencies["redis"] = "unhealthy"
    else:
        dependencies["redis"] = "not_configured"

    # 确定整体状态
    status = "ok"
    if any(v == "unhealthy" for v in dependencies.values()):
        status = "degraded"

    return HealthResponse(
        status=status,
        version="1.0.0",
        dependencies=dependencies,
    )


@router.get("/v1/chains", response_model=list[ChainInfo])
async def list_chains(settings: Settings = Depends(get_settings)) -> list[ChainInfo]:
    """获取支持的链列表"""
    chain_configs = settings.get_chain_configs()
    return [
        ChainInfo(
            chain_id=config.chain_id,
            name=config.name,
            native_token=config.native_token,
            explorer_url=config.explorer_base_url.replace("/api", ""),
        )
        for config in chain_configs.values()
    ]


@router.post("/v1/tx/parse", response_model=TxParseResponse)
async def parse_transaction(
    req: TxParseRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> TxParseResponse:
    """解析交易（不调用 RAG）"""
    tracer = Tracer(chain_id=req.chain_id, tx_hash=req.tx_hash)
    bind_context(trace_id=tracer.trace_id, chain_id=req.chain_id, tx_hash=req.tx_hash)

    try:
        parser = get_parser(request)
        parse_result = await parser.parse(
            chain_id=req.chain_id,
            tx_hash=req.tx_hash,
            tracer=tracer,
        )

        return TxParseResponse(
            trace_id=tracer.trace_id,
            status="success",
            parse_result=parse_result.to_dict(),
            timings=tracer.get_timings(),
        )

    except ValueError as e:
        logger.warning("parse_error", error=str(e))
        return TxParseResponse(
            trace_id=tracer.trace_id,
            status="failed",
            error=str(e),
            timings=tracer.get_timings(),
        )
    except Exception as e:
        logger.exception("parse_exception", error=str(e))
        return TxParseResponse(
            trace_id=tracer.trace_id,
            status="failed",
            error=f"Internal error: {str(e)}",
            timings=tracer.get_timings(),
        )
    finally:
        clear_context()


@router.post("/v1/tx/analyze", response_model=TxAnalyzeResponse)
async def analyze_transaction(
    req: TxAnalyzeRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> TxAnalyzeResponse:
    """分析交易（一站式 API）"""
    tracer = Tracer(chain_id=req.chain_id, tx_hash=req.tx_hash)
    bind_context(trace_id=tracer.trace_id, chain_id=req.chain_id, tx_hash=req.tx_hash)

    parse_result: TxParseResult | None = None
    explanation: ExplanationResult | None = None
    error: str | None = None
    status = "success"

    try:
        # 1. 解析交易
        parser = get_parser(request)
        parse_result = await parser.parse(
            chain_id=req.chain_id,
            tx_hash=req.tx_hash,
            tracer=tracer,
        )

        # 2. 调用 RAG 生成解释（如果需要）
        if req.options.include_explanation:
            rag_client = get_rag_client(request)
            if rag_client:
                with tracer.step("call_rag", {"model": settings.rag_model}) as step:
                    try:
                        rag_result = await rag_client.explain(
                            parse_result=parse_result.to_dict(),
                            language=req.options.language,
                            trace_id=tracer.trace_id,
                        )
                        explanation = ExplanationResult(
                            summary=rag_result.get("summary", ""),
                            risk_level=rag_result.get("risk_level", "unknown"),
                            risk_reasons=rag_result.get("risk_reasons", []),
                            actions=rag_result.get("actions", []),
                            sources=rag_result.get("sources", []),
                        )
                        step.set_output({
                            "risk_level": explanation.risk_level,
                            "sources_count": len(explanation.sources),
                        })
                    except Exception as e:
                        logger.warning("rag_error", error=str(e))
                        step.set_output({"error": str(e)})
                        status = "partial"
                        error = f"RAG error: {str(e)}"
            else:
                status = "partial"
                error = "RAG client not configured"

    except ValueError as e:
        logger.warning("analyze_error", error=str(e))
        status = "failed"
        error = str(e)
    except Exception as e:
        logger.exception("analyze_exception", error=str(e))
        status = "failed"
        error = f"Internal error: {str(e)}"

    # 3. 记录日志（如果启用）
    if settings.trace_store_db:
        try:
            _save_parse_log(
                tracer=tracer,
                request=req,
                parse_result=parse_result,
                status=status,
                error=error,
            )
        except Exception as e:
            logger.warning("save_log_error", error=str(e))

    # 4. 构建响应
    response = TxAnalyzeResponse(
        trace_id=tracer.trace_id,
        status=status,
        parse_result=parse_result.to_dict() if parse_result else None,
        explanation=explanation,
        timings=tracer.get_timings(),
        error=error,
    )

    # 5. 包含 trace 日志（如果需要）
    if req.options.include_trace:
        response.trace_log = tracer.get_steps_list()

    clear_context()
    return response


def _save_parse_log(
    tracer: Tracer,
    request: TxAnalyzeRequest,
    parse_result: TxParseResult | None,
    status: str,
    error: str | None,
) -> None:
    """保存解析日志到数据库"""
    try:
        with get_db_context() as db:
            timings = tracer.get_timings()

            log = ParseLog(
                trace_id=tracer.trace_id,
                chain_id=request.chain_id,
                tx_hash=request.tx_hash,
                request_options=request.options.model_dump(),
                status=status,
                behavior_type=parse_result.behavior.type if parse_result else None,
                risk_flags=[rf.model_dump() for rf in parse_result.risk_flags] if parse_result else None,
                total_ms=timings.get("total_ms"),
                parse_ms=sum(v for k, v in timings.items() if k != "total_ms" and k != "call_rag_ms"),
                rag_ms=timings.get("call_rag_ms"),
                error_message=error,
                trace_steps=tracer.get_steps_list(),
            )
            db.add(log)
            db.commit()
    except Exception as e:
        logger.warning("save_parse_log_error", error=str(e))
