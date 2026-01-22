from __future__ import annotations

import logging
import re
import time
import json
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from onekey_rag_service.config import Settings
from onekey_rag_service.rag.chat_provider import ChatProvider
from onekey_rag_service.rag.conversation import compact_conversation, extract_system_instructions, format_history_excerpt
from onekey_rag_service.rag.embeddings import EmbeddingsProvider
from onekey_rag_service.rag.pgvector_store import RetrievedChunk, hybrid_search, similarity_search
from onekey_rag_service.rag.reranker import Reranker
from onekey_rag_service.rag.kb_allocation import KbAllocation
from onekey_rag_service.utils import clamp_text
from onekey_rag_service.services.contract_index import (
    get_contract_info,
    build_contract_info_from_chunk,
    upsert_contract_info,
)

logger = logging.getLogger(__name__)

# 合约地址正则表达式 (0x + 40位十六进制)
_CONTRACT_ADDRESS_RE = re.compile(r'0x[a-fA-F0-9]{40}', re.IGNORECASE)


def _extract_addresses_from_text(text: str) -> set[str]:
    """从文本中提取所有合约地址（小写）"""
    if not text:
        return set()
    return {m.group(0).lower() for m in _CONTRACT_ADDRESS_RE.finditer(text)}


def _filter_chunks_by_address(
    chunks: list[RetrievedChunk],
    addresses: set[str],
    *,
    strict: bool = True,
) -> list[RetrievedChunk]:
    """
    过滤 chunks，只保留包含指定地址的结果。

    Args:
        chunks: 候选 chunks
        addresses: 要匹配的地址集合（小写）
        strict: True=只返回包含地址的; False=地址匹配的优先，不匹配的放后面

    Returns:
        过滤/排序后的 chunks
    """
    if not addresses:
        return chunks

    matched: list[RetrievedChunk] = []
    unmatched: list[RetrievedChunk] = []

    for c in chunks:
        chunk_addresses = _extract_addresses_from_text(c.text)
        if addresses & chunk_addresses:  # 有交集
            matched.append(c)
        else:
            unmatched.append(c)

    if strict:
        return matched
    return matched + unmatched


def _strip_code_fences(text: str) -> str:
    t = (text or "").strip()
    if not t:
        return ""
    if t.startswith("```"):
        t = t.split("\n", 1)[-1]
        if t.endswith("```"):
            t = t[: -3]
    return t.strip()


def _extract_json_object(text: str) -> str:
    t = _strip_code_fences(text)
    if not t:
        return ""
    start = t.find("{")
    end = t.rfind("}")
    if start >= 0 and end > start:
        return t[start : end + 1].strip()
    return t


def _ensure_json_object(content: str) -> str:
    """
    JSON 模式兜底：确保返回值是一个 JSON object 字符串。
    """
    raw = _extract_json_object(content)
    if raw:
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                return json.dumps(data, ensure_ascii=False)
            return json.dumps({"data": data}, ensure_ascii=False)
        except Exception:
            pass
    return json.dumps(
        {
            "error": "invalid_json",
            "message": clamp_text((content or "").strip(), 2000),
        },
        ensure_ascii=False,
    )


@dataclass(frozen=True)
class RagAnswer:
    answer: str
    sources: list[dict]
    debug: dict | None = None
    usage: dict | None = None
    meta: dict | None = None
    contract_info: dict | None = None  # 来自 contract_index 的确定性协议信息


@dataclass(frozen=True)
class RagPrepared:
    """RAG 预处理产物：检索/重排/上下文拼接 + 最终给上游模型的 messages。"""

    messages: list[dict] | None
    sources: list[dict]
    debug: dict | None = None
    direct_answer: str | None = None
    meta: dict | None = None
    contract_info: dict | None = None  # 来自 contract_index 的确定性协议信息


def _resolve_default_prompts(requested_model: str | None) -> tuple[str, str]:
    if requested_model == "onekey-docs" or not requested_model:
        return (
            "你是 OneKey 开发者文档助手。你必须严格基于提供的“文档片段”回答，不要编造。",
            "我在 OneKey 开发者文档中没有检索到直接相关的内容。你可以换一种问法，或提供更具体的关键词（如 SDK 名称/方法名/报错信息）。",
        )
    if requested_model == "tx-analyzer":
        return (
            "你是 Web3 交易分析知识库助手。你必须严格基于提供的“知识库片段”回答，不要编造。",
            "当前 tx-analyzer 知识库未检索到相关内容，请补充知识库文档或调整交易问题。",
        )
    return (
        "你是知识库助手。你必须严格基于提供的“知识库片段”回答，不要编造。",
        "当前知识库未检索到相关内容，请补充文档或调整问题。",
    )


def _merge_candidates(candidates: list[list[RetrievedChunk]], *, k: int) -> list[RetrievedChunk]:
    by_id: dict[int, RetrievedChunk] = {}
    for group in candidates:
        for c in group:
            prev = by_id.get(c.chunk_id)
            if (not prev) or c.score > prev.score:
                by_id[c.chunk_id] = c
    merged = list(by_id.values())
    merged.sort(key=lambda x: x.score, reverse=True)
    return merged[:k]


def _build_sources(chunks: list[RetrievedChunk], *, max_sources: int = 6) -> list[dict]:
    seen: set[str] = set()
    sources: list[dict] = []

    for c in sorted(chunks, key=lambda x: x.score, reverse=True):
        url = _append_anchor(c.url, c.section_path)
        if url in seen:
            continue
        seen.add(url)
        sources.append(
            {
                "url": url,
                "title": c.title,
                "section_path": c.section_path,
                "snippet": "",
            }
        )
        if len(sources) >= max_sources:
            break
    return sources


_CITATION_RE = re.compile(r"\[(\d{1,3})\]")


def _slugify_anchor(text: str) -> str:
    s = (text or "").strip().lower()
    s = re.sub(r"[^\w\s-]", "", s, flags=re.UNICODE)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s


def _append_anchor(url: str, section_path: str) -> str:
    if not url or "#" in url:
        return url
    last = (section_path or "").split(" > ")[-1].strip()
    anchor = _slugify_anchor(last)
    if not anchor:
        return url
    return f"{url}#{anchor}"


def _sanitize_inline_citations(text: str, *, max_ref: int) -> str:
    """
    删除模型输出中越界的引用编号（例如 [99]），避免前端无法对齐 sources。
    """

    def _repl(m: re.Match[str]) -> str:
        try:
            n = int(m.group(1))
        except Exception:
            return ""
        return m.group(0) if 1 <= n <= max_ref else ""

    cleaned = _CITATION_RE.sub(_repl, text or "")
    cleaned = re.sub(r" {2,}", " ", cleaned)
    return cleaned.strip()


def _has_any_inline_citation(text: str) -> bool:
    return bool(_CITATION_RE.search(text or ""))


def _build_references_tail(*, sources: list[dict], inline: bool) -> str:
    if not sources:
        return ""
    if inline:
        lines = ["\n\n参考："]
        for i, s in enumerate(sources, start=1):
            ref = int(s.get("ref") or i)
            title = (s.get("title") or "").strip()
            url = (s.get("url") or "").strip()
            if title:
                lines.append(f"[{ref}] {title} - {url}")
            else:
                lines.append(f"[{ref}] {url}")
        return "\n".join(lines).rstrip()

    lines = ["\n\n来源："] + [f"- {(s.get('url') or '').strip()}" for s in sources if (s.get("url") or "").strip()]
    return "\n".join(lines).rstrip()


def _fill_source_snippets(sources: list[dict], chunks: list[RetrievedChunk], *, snippet_max_chars: int) -> None:
    by_url: dict[str, RetrievedChunk] = {}
    for c in sorted(chunks, key=lambda x: x.score, reverse=True):
        by_url.setdefault(c.url, c)

    for s in sources:
        url = s.get("url") or ""
        c = by_url.get(url)
        if not c:
            continue
        s["snippet"] = clamp_text(c.text.replace("\n", " ").strip(), snippet_max_chars)


def _build_inline_sources(chunks: list[RetrievedChunk], *, snippet_max_chars: int, max_sources: int) -> list[dict]:
    sources: list[dict] = []
    for i, c in enumerate(chunks[:max_sources], start=1):
        sources.append(
            {
                "ref": i,
                "url": _append_anchor(c.url, c.section_path),
                "title": c.title,
                "section_path": c.section_path,
                "snippet": clamp_text(c.text.replace("\n", " ").strip(), snippet_max_chars),
            }
        )
    return sources


def _build_context(chunks: list[RetrievedChunk], *, max_chars: int = 12_000) -> str:
    parts: list[str] = []
    total = 0
    for i, c in enumerate(chunks, start=1):
        block = f"[{i}]\nURL: {c.url}\n标题: {c.title}\n章节: {c.section_path}\n内容:\n{c.text}\n"
        if total + len(block) > max_chars:
            break
        parts.append(block)
        total += len(block)
    return "\n\n".join(parts).strip()


def _normalize_sources(raw_sources: list[dict] | None) -> list[dict]:
    sources: list[dict] = []
    for s in raw_sources or []:
        if not isinstance(s, dict):
            continue
        url = s.get("url")
        title = s.get("title")
        section_path = s.get("section_path")
        snippet = s.get("snippet")
        ref = s.get("ref")
        sources.append(
            {
                "url": str(url) if url else "",
                "title": str(title) if title else "",
                "section_path": str(section_path) if section_path else "",
                "snippet": str(snippet) if snippet else "",
                "ref": int(ref) if isinstance(ref, int) else None,
            }
        )
    return sources


def _safe_render(template: str, variables: dict[str, Any]) -> str:
    class _SafeDict(dict):
        def __missing__(self, key: str):
            return ""

    try:
        return (template or "").format_map(_SafeDict(**variables))
    except Exception:
        return template or ""


async def prepare_rag(
    session: Session,
    *,
    settings: Settings,
    embeddings: EmbeddingsProvider,
    chat: ChatProvider | None,
    reranker: Reranker | None,
    chat_model: str,
    request_messages: list[dict],
    question: str,
    request_metadata: dict[str, Any] | None = None,
    workspace_id: str = "default",
    kb_allocations: list[KbAllocation] | None = None,
    prompt_templates: dict[str, str] | None = None,
    requested_model: str | None = None,
    strict_kb: bool = False,
    debug: bool = False,
    callbacks: list | None = None,
) -> RagPrepared:
    t_prepare = time.perf_counter()
    t_compaction_ms: int | None = None
    t_embed_ms: int | None = None
    t_retrieve_ms: int | None = None
    t_rerank_ms: int | None = None
    t_context_ms: int | None = None

    system_instructions = extract_system_instructions(request_messages)
    history_messages = list(request_messages)
    for i in range(len(history_messages) - 1, -1, -1):
        if (history_messages[i].get("role") or "") == "user":
            history_messages.pop(i)
            break

    history_excerpt = format_history_excerpt(
        history_messages,
        max_messages=settings.conversation_history_max_messages,
        max_chars=settings.conversation_history_max_chars,
    )

    retrieval_query = question
    memory_summary: str | None = None
    used_compaction = False
    if chat and (settings.query_rewrite_enabled or settings.memory_summary_enabled):
        t0 = time.perf_counter()
        try:
            compaction = await compact_conversation(
                settings=settings,
                chat=chat,
                model=chat_model,
                messages=request_messages,
                question=question,
                callbacks=callbacks,
            )
            retrieval_query = compaction.retrieval_query
            memory_summary = compaction.memory_summary
            used_compaction = compaction.used_llm
            t_compaction_ms = int((time.perf_counter() - t0) * 1000)
        except Exception:
            # Query rewrite/记忆压缩属于“增强项”，失败不应影响主链路
            retrieval_query = question
            memory_summary = None
            used_compaction = False
            t_compaction_ms = int((time.perf_counter() - t0) * 1000)

    default_system, no_sources_answer = _resolve_default_prompts(requested_model)

    def _filter_chunks_by_metadata(chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
        if not request_metadata:
            return chunks
        allowlist = [str(s).lower() for s in (request_metadata.get("source_allowlist") or []) if str(s).strip()]
        denylist = [str(s).lower() for s in (request_metadata.get("source_denylist") or []) if str(s).strip()]
        if not allowlist and not denylist:
            return chunks

        def match_any(text: str, patterns: list[str]) -> bool:
            return any(p in text for p in patterns)

        filtered: list[RetrievedChunk] = []
        for c in chunks:
            combined = " ".join([c.url, c.title, c.section_path]).lower()
            if allowlist and not match_any(combined, allowlist):
                continue
            if denylist and match_any(combined, denylist):
                continue
            filtered.append(c)
        return filtered

    # 构建 contract_info 的辅助函数
    def _build_contract_info(hit) -> dict | None:
        if not hit:
            return None
        return {
            "address": hit.address,
            "protocol": hit.protocol,
            "protocol_version": hit.protocol_version or "",
            "contract_type": hit.contract_type or "",
            "contract_name": hit.contract_name or "",
            "source_url": hit.source_url or "",
            "confidence": hit.confidence,
            "chain_id": hit.chain_id,
            "source": "contract_index",
        }

    address_query = None
    contract_index_hit = None  # 合约索引命中信息
    if request_metadata and request_metadata.get("address_lookup"):
        address_value = str(request_metadata.get("address_lookup") or "").strip()
        if address_value:
            address_query = f"{address_value} 地址归属 addresses address list"

            # 尝试从合约索引中查找协议信息
            try:
                contract_index_hit = get_contract_info(session, address_value)
                if contract_index_hit:
                    logger.debug(
                        "Contract index hit: %s -> %s (%s)",
                        address_value, contract_index_hit.protocol, contract_index_hit.contract_type
                    )
                    # 如果 metadata 中没有 protocol，使用索引中的信息
                    if request_metadata and not request_metadata.get("protocol"):
                        request_metadata = dict(request_metadata or {})
                        request_metadata["protocol"] = contract_index_hit.protocol
                        if contract_index_hit.protocol_version:
                            request_metadata["protocol_version"] = contract_index_hit.protocol_version
                        if contract_index_hit.contract_type:
                            request_metadata["contract_type"] = contract_index_hit.contract_type
            except Exception as e:
                logger.warning("Contract index lookup failed: %s", e)

    # 处理协议信息，构建协议相关的检索查询
    protocol_query = None
    if request_metadata and request_metadata.get("protocol"):
        protocol_value = str(request_metadata.get("protocol") or "").strip()
        protocol_name = str(request_metadata.get("protocol_name") or "").strip()
        if protocol_value:
            protocol_parts = [protocol_value]
            if protocol_name and protocol_name != protocol_value:
                protocol_parts.append(protocol_name)
            protocol_query = f"{' '.join(protocol_parts)} protocol 协议 合约 contract DeFi"

    # 处理函数名/签名/选择器，即使协议未识别也能检索到相关文档
    function_query = None
    if request_metadata:
        func_parts = []
        function_name = str(request_metadata.get("function_name") or "").strip()
        function_signature = str(request_metadata.get("function_signature") or "").strip()
        selector = str(request_metadata.get("selector") or "").strip()
        if function_name:
            func_parts.append(function_name)
        if function_signature and function_signature != function_name:
            func_parts.append(function_signature)
        if selector:
            func_parts.append(selector)
        if func_parts:
            function_query = f"{' '.join(func_parts)} function 函数 方法 DeFi protocol 协议"

    t0 = time.perf_counter()
    qvec = embeddings.embed_query(retrieval_query)
    t_embed_ms = int((time.perf_counter() - t0) * 1000)
    if address_query:
        t0 = time.perf_counter()
        address_qvec = embeddings.embed_query(address_query)
        t_embed_ms += int((time.perf_counter() - t0) * 1000)
    if protocol_query:
        t0 = time.perf_counter()
        protocol_qvec = embeddings.embed_query(protocol_query)
        t_embed_ms += int((time.perf_counter() - t0) * 1000)
    if function_query:
        t0 = time.perf_counter()
        function_qvec = embeddings.embed_query(function_query)
        t_embed_ms += int((time.perf_counter() - t0) * 1000)
    mode = (settings.retrieval_mode or "vector").lower()
    t0 = time.perf_counter()
    allocations = [a for a in (kb_allocations or []) if int(a.top_k or 0) > 0]
    if strict_kb and not allocations:
        return RagPrepared(
            messages=None,
            direct_answer=no_sources_answer,
            sources=[],
            debug={"retrieved": 0, "retrieval_query": retrieval_query, "used_compaction": used_compaction} if debug else None,
            meta={
                "workspace_id": workspace_id,
                "kb_allocations": [a.__dict__ for a in allocations],
                "retrieval_query": retrieval_query,
                "retrieved": 0,
                "rerank_used": False,
                "timings_ms": {
                    "compaction": t_compaction_ms,
                    "embed": t_embed_ms,
                    "retrieve": t_retrieve_ms,
                    "rerank": t_rerank_ms,
                    "context": t_context_ms,
                    "total_prepare": int((time.perf_counter() - t_prepare) * 1000),
                },
                "used_compaction": used_compaction,
            },
            contract_info=_build_contract_info(contract_index_hit),
        )
    def _retrieve_for_query(query_text: str, query_embedding: list[float]) -> list[RetrievedChunk]:
        if allocations:
            groups: list[list[RetrievedChunk]] = []
            for a in allocations:
                per_k = max(1, int(a.top_k))
                if mode == "hybrid":
                    groups.append(
                        hybrid_search(
                            session,
                            query_text=query_text,
                            query_embedding=query_embedding,
                            workspace_id=workspace_id,
                            kb_id=a.kb_id,
                            k=per_k,
                            vector_k=min(settings.hybrid_vector_k, per_k),
                            bm25_k=min(settings.hybrid_bm25_k, per_k),
                            vector_weight=settings.hybrid_vector_weight,
                            bm25_weight=settings.hybrid_bm25_weight,
                            fts_config=settings.bm25_fts_config,
                        )
                    )
                else:
                    groups.append(
                        similarity_search(
                            session,
                            query_embedding=query_embedding,
                            workspace_id=workspace_id,
                            kb_id=a.kb_id,
                            k=per_k,
                        )
                    )
            return _merge_candidates(groups, k=settings.rag_top_k)

        if mode == "hybrid":
            return hybrid_search(
                session,
                query_text=query_text,
                query_embedding=query_embedding,
                workspace_id=workspace_id,
                kb_id=None,
                k=settings.rag_top_k,
                vector_k=settings.hybrid_vector_k,
                bm25_k=settings.hybrid_bm25_k,
                vector_weight=settings.hybrid_vector_weight,
                bm25_weight=settings.hybrid_bm25_weight,
                fts_config=settings.bm25_fts_config,
            )

        return similarity_search(
            session,
            query_embedding=query_embedding,
            workspace_id=workspace_id,
            kb_id=None,
            k=settings.rag_top_k,
        )

    retrieved = _retrieve_for_query(retrieval_query, qvec)
    if address_query:
        retrieved_address = _retrieve_for_query(address_query, address_qvec)
        retrieved = _merge_candidates([retrieved, retrieved_address], k=settings.rag_top_k)
    if protocol_query:
        retrieved_protocol = _retrieve_for_query(protocol_query, protocol_qvec)
        retrieved = _merge_candidates([retrieved, retrieved_protocol], k=settings.rag_top_k)
    if function_query:
        retrieved_function = _retrieve_for_query(function_query, function_qvec)
        retrieved = _merge_candidates([retrieved, retrieved_function], k=settings.rag_top_k)
    t_retrieve_ms = int((time.perf_counter() - t0) * 1000)
    retrieved = _filter_chunks_by_metadata(retrieved)

    # 地址相关性过滤：收集查询中的所有地址
    query_addresses: set[str] = set()
    query_addresses.update(_extract_addresses_from_text(question))
    if request_metadata and request_metadata.get("address_lookup"):
        addr = str(request_metadata.get("address_lookup") or "").strip().lower()
        if addr and _CONTRACT_ADDRESS_RE.match(addr):
            query_addresses.add(addr)

    # 如果查询包含地址，优先返回包含这些地址的 chunks
    address_filtered_count = 0
    auto_learned_contracts: list[str] = []
    if query_addresses:
        pre_filter_count = len(retrieved)
        # strict=True: 只返回包含地址的 chunk
        # 如果过滤后没有结果，回退到 strict=False（地址匹配优先）
        filtered = _filter_chunks_by_address(retrieved, query_addresses, strict=True)
        if filtered:
            retrieved = filtered
            address_filtered_count = pre_filter_count - len(filtered)

            # 自动学习：从匹配的 chunks 中提取协议信息并写入索引
            # 只对索引中不存在的地址进行学习
            for addr in query_addresses:
                if contract_index_hit and contract_index_hit.address == addr:
                    continue  # 已经在索引中了
                try:
                    existing = get_contract_info(session, addr)
                    if existing:
                        continue  # 已在索引中

                    # 尝试从 chunks 中提取协议信息
                    for c in filtered[:3]:  # 只检查前 3 个最相关的
                        if addr not in c.text.lower():
                            continue
                        contract_info = build_contract_info_from_chunk(
                            chunk_text=c.text,
                            chunk_url=c.url,
                            chunk_kb_id="",  # chunk 没有直接的 kb_id
                            address=addr,
                        )
                        if contract_info:
                            upsert_contract_info(
                                session,
                                address=contract_info.address,
                                protocol=contract_info.protocol,
                                protocol_version=contract_info.protocol_version,
                                contract_type=contract_info.contract_type,
                                source_url=contract_info.source_url,
                                confidence=contract_info.confidence,
                            )
                            auto_learned_contracts.append(addr)
                            logger.info(
                                "Auto-learned contract from RAG: %s -> %s (%s)",
                                addr, contract_info.protocol, contract_info.contract_type
                            )
                            break
                except Exception as e:
                    logger.debug("Auto-learn failed for %s: %s", addr, e)
        else:
            # 没有严格匹配，使用非严格模式（地址匹配的排前面）
            retrieved = _filter_chunks_by_address(retrieved, query_addresses, strict=False)

    ranked = retrieved
    rerank_used = bool(reranker)
    if reranker:
        t0 = time.perf_counter()
        try:
            ranked = await reranker.rerank(query=retrieval_query, candidates=retrieved, top_n=settings.rag_top_n)
        except Exception:
            ranked = retrieved[: settings.rag_top_n]
        t_rerank_ms = int((time.perf_counter() - t0) * 1000)

    max_ctx = min(settings.rag_top_n, settings.rag_max_sources) if settings.inline_citations_enabled else settings.rag_top_n
    topn = ranked[:max_ctx]
    orig_score_by_id = {c.chunk_id: c.score for c in retrieved}
    top_scores_pre_rerank = [orig_score_by_id.get(c.chunk_id) for c in topn] if rerank_used else None
    if settings.inline_citations_enabled:
        sources = _build_inline_sources(topn, snippet_max_chars=settings.rag_snippet_max_chars, max_sources=max_ctx)
    else:
        sources = _build_sources(topn, max_sources=settings.rag_max_sources)
        _fill_source_snippets(sources, topn, snippet_max_chars=settings.rag_snippet_max_chars)

    if not topn:
        return RagPrepared(
            messages=None,
            direct_answer=no_sources_answer,
            sources=[],
            debug={"retrieved": 0, "retrieval_query": retrieval_query, "used_compaction": used_compaction} if debug else None,
            meta={
                "workspace_id": workspace_id,
                "kb_allocations": [a.__dict__ for a in allocations],
                "retrieval_query": retrieval_query,
                "retrieved": 0,
                "rerank_used": rerank_used,
                "timings_ms": {
                    "compaction": t_compaction_ms,
                    "embed": t_embed_ms,
                    "retrieve": t_retrieve_ms,
                    "rerank": t_rerank_ms,
                    "context": t_context_ms,
                    "total_prepare": int((time.perf_counter() - t_prepare) * 1000),
                },
                "used_compaction": used_compaction,
            },
            contract_info=_build_contract_info(contract_index_hit),
        )

    t0 = time.perf_counter()
    context = _build_context(topn, max_chars=settings.rag_context_max_chars)
    t_context_ms = int((time.perf_counter() - t0) * 1000)

    templates = prompt_templates or {}
    system = templates.get("system") or default_system

    extra = ""
    if system_instructions:
        extra += f"用户额外要求（如与规则冲突，以规则为准）：\n{system_instructions}\n\n"
    if memory_summary:
        extra += f"对话摘要（压缩记忆）：\n{memory_summary}\n\n"
    if history_excerpt:
        extra += f"最近对话片段：\n{history_excerpt}\n\n"

    citation_rules = ""
    if settings.inline_citations_enabled:
        citation_rules = (
            "引用规则（重要）：\n"
            f"- 你只能引用编号 1..{len(topn)}，引用格式为 [数字]，例如 [1]。\n"
            "- 每个关键结论/步骤后都要给出至少一个引用；如果文档片段不足以支撑，请明确说“不确定/文档未说明”。\n"
            "- 不要在正文里堆砌 URL；只用 [n] 这种 inline citation。\n\n"
        )

    formatting_rules = (
        "格式要求（重要）：\n"
        "- 请使用 Markdown 输出。\n"
        "- 对变量名/方法名/参数名/字段名/命令/路径/报错关键词等“短代码片段”，使用反引号包裹（inline code），例如 `connectId`、`HardwareSDK.init()`。\n"
        "- 不要把单个标识符/字段名（例如 `device_id`、`connectId`）单独放在一行或代码块里；尽量写在句子中。\n"
        "- 对多行代码/命令/配置使用代码块（fenced code block），并尽量标注语言，例如 ```ts / ```bash / ```json。\n"
        "- 代码块优先用于“≥2 行”或需要复制执行的命令/配置；不要为了展示一个词/一个参数就用代码块。\n"
        "- 除代码块外，不要把短标识符单独换行。\n\n"
    )

    default_user = (
        f"{extra}"
        f"当前问题：{question}\n\n"
        f"文档片段（可引用）：\n{context}\n\n"
        f"{formatting_rules}"
        f"{citation_rules}"
        "请用中文给出：\n"
        "1) 简要结论（1-3 句）\n"
        "2) 具体步骤（分点）\n"
        "3) 若文档片段包含代码/配置，请给出对应示例\n"
        "4) 注意事项/常见坑（如有）\n"
    )

    user = default_user
    if templates.get("user"):
        user = _safe_render(
            templates.get("user") or "",
            {
                "user_query": question,
                "retrieved_context": context,
                "formatting_rules": formatting_rules,
                "citation_rules": citation_rules,
                "extra": extra,
                "workspace_id": workspace_id,
            },
        )

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    debug_obj: dict | None = None
    if debug:
        debug_obj = {
            "retrieved": len(retrieved),
            "chunk_ids": [c.chunk_id for c in retrieved],
            "top_chunk_ids": [c.chunk_id for c in topn],
            "top_scores": [c.score for c in topn],
            "top_scores_pre_rerank": top_scores_pre_rerank,
            "rerank_used": rerank_used,
            "retrieval_query": retrieval_query,
            "used_compaction": used_compaction,
            "address_filter": {
                "applied": bool(query_addresses),
                "query_addresses": list(query_addresses),
                "filtered_count": address_filtered_count,
                "auto_learned": auto_learned_contracts,
            },
            "timings_ms": {
                "compaction": t_compaction_ms,
                "embed": t_embed_ms,
                "retrieve": t_retrieve_ms,
                "rerank": t_rerank_ms,
                "context": t_context_ms,
                "total_prepare": int((time.perf_counter() - t_prepare) * 1000),
            },
        }

    return RagPrepared(
        messages=messages,
        sources=sources,
        debug=debug_obj,
        meta={
            "workspace_id": workspace_id,
            "kb_allocations": [a.__dict__ for a in allocations],
            "retrieval_query": retrieval_query,
            "retrieved": len(retrieved),
            "chunk_ids": [c.chunk_id for c in retrieved],
            "scores": [c.score for c in retrieved],
            "top_chunk_ids": [c.chunk_id for c in topn],
            "top_scores": [c.score for c in topn],
            "top_scores_pre_rerank": top_scores_pre_rerank,
            "rerank_used": rerank_used,
            "address_filter": {
                "applied": bool(query_addresses),
                "query_addresses": list(query_addresses),
                "filtered_count": address_filtered_count,
                "auto_learned": auto_learned_contracts,
            },
            "timings_ms": {
                "compaction": t_compaction_ms,
                "embed": t_embed_ms,
                "retrieve": t_retrieve_ms,
                "rerank": t_rerank_ms,
                "context": t_context_ms,
                "total_prepare": int((time.perf_counter() - t_prepare) * 1000),
            },
            "used_compaction": used_compaction,
        },
        contract_info=_build_contract_info(contract_index_hit),
    )


async def answer_with_rag(
    session: Session,
    *,
    settings: Settings,
    embeddings: EmbeddingsProvider,
    chat: ChatProvider | None,
    reranker: Reranker | None,
    chat_model: str,
    request_messages: list[dict],
    question: str,
    request_metadata: dict[str, Any] | None = None,
    workspace_id: str = "default",
    kb_allocations: list[KbAllocation] | None = None,
    prompt_templates: dict[str, str] | None = None,
    requested_model: str | None = None,
    strict_kb: bool = False,
    temperature: float | None = None,
    top_p: float | None = None,
    max_tokens: int | None = None,
    response_format: dict[str, Any] | None = None,
    debug: bool = False,
    callbacks: list | None = None,
) -> RagAnswer:
    _, no_sources_answer = _resolve_default_prompts(requested_model)
    prepared = await prepare_rag(
        session,
        settings=settings,
        embeddings=embeddings,
        chat=chat,
        reranker=reranker,
        chat_model=chat_model,
        request_messages=request_messages,
        question=question,
        request_metadata=request_metadata,
        workspace_id=workspace_id,
        kb_allocations=kb_allocations,
        prompt_templates=prompt_templates,
        requested_model=requested_model,
        strict_kb=strict_kb,
        debug=debug,
        callbacks=callbacks,
    )

    if prepared.direct_answer is not None:
        return RagAnswer(answer=prepared.direct_answer, sources=prepared.sources, debug=prepared.debug, meta=prepared.meta, contract_info=prepared.contract_info)

    if not prepared.messages:
        return RagAnswer(
            answer=no_sources_answer,
            sources=[],
            debug=prepared.debug,
            meta=prepared.meta,
            contract_info=prepared.contract_info,
        )

    sources = _normalize_sources(prepared.sources)

    if not chat:
        # 降级：无上游模型时，返回可用片段的摘要式回答（确保服务可运行）
        answer = no_sources_answer
        return RagAnswer(answer=answer, sources=sources, debug=prepared.debug, meta=prepared.meta, contract_info=prepared.contract_info)

    t0 = time.perf_counter()
    result = await chat.complete(
        model=chat_model,
        messages=prepared.messages,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
        response_format=response_format,
        callbacks=callbacks,
    )
    chat_ms = int((time.perf_counter() - t0) * 1000)

    # 观测：把 chat 耗时写入 meta，便于 admin 聚合统计（不依赖 debug=true）
    try:
        timings_meta = dict((prepared.meta or {}).get("timings_ms") or {})
        timings_meta["chat"] = chat_ms
        if "total_prepare" in timings_meta and isinstance(timings_meta.get("total_prepare"), (int, float)):
            timings_meta["total"] = int(timings_meta["total_prepare"]) + int(chat_ms)
        prepared.meta["timings_ms"] = timings_meta
    except Exception:
        pass

    content = (result.content or "").strip()
    json_mode = bool(response_format) and response_format.get("type") == "json_object"
    if json_mode:
        content = _ensure_json_object(content)
    else:
        if settings.inline_citations_enabled:
            content = _sanitize_inline_citations(content, max_ref=len(sources))
            # 如果模型没按要求输出引用，至少在末尾补一个参考（避免“无可追溯”）
            if sources and not _has_any_inline_citation(content):
                content = (content + "\n\n（未能在正文中生成引用标记，已在参考中列出来源）").strip()

        if sources and settings.answer_append_sources:
            content += _build_references_tail(sources=sources, inline=settings.inline_citations_enabled)

    debug_obj = prepared.debug
    if debug_obj is not None:
        timings = dict(debug_obj.get("timings_ms") or {})
        timings["chat"] = chat_ms
        debug_obj = {**debug_obj, "timings_ms": timings}

    return RagAnswer(
        answer=content,
        sources=sources,
        usage=result.usage,
        debug=debug_obj,
        meta=prepared.meta,
        contract_info=prepared.contract_info,
    )
