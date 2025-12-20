from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from onekey_rag_service.config import Settings
from onekey_rag_service.rag.chat_provider import ChatProvider
from onekey_rag_service.utils import clamp_text


@dataclass(frozen=True)
class ConversationCompaction:
    retrieval_query: str
    memory_summary: str | None
    used_llm: bool
    raw: dict[str, Any] | None = None


def extract_system_instructions(messages: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for m in messages:
        if (m.get("role") or "") != "system":
            continue
        c = m.get("content")
        if isinstance(c, str) and c.strip():
            parts.append(c.strip())
    return "\n\n".join(parts).strip()


def format_history_excerpt(
    messages: list[dict[str, Any]],
    *,
    max_messages: int,
    max_chars: int,
    per_message_max_chars: int = 800,
) -> str:
    """
    仅用于给模型“补充对话上下文”，避免把整段历史塞进 prompt。
    """
    history: list[str] = []
    # 过滤 system/tool，只保留 user/assistant
    filtered = [m for m in messages if (m.get("role") or "") in {"user", "assistant"}]
    filtered = filtered[-max_messages:] if max_messages > 0 else filtered

    for m in filtered:
        role = m.get("role") or ""
        content = m.get("content")
        if not isinstance(content, str) or not content.strip():
            continue
        who = "用户" if role == "user" else "助手"
        history.append(f"{who}：{clamp_text(content.strip(), per_message_max_chars)}")

    text = "\n".join(history).strip()
    return clamp_text(text, max_chars)


def _strip_code_fences(text: str) -> str:
    t = (text or "").strip()
    if not t:
        return ""
    if t.startswith("```"):
        # 去掉首尾 ```xxx
        t = t.split("\n", 1)[-1]
        if t.endswith("```"):
            t = t[: -3]
    return t.strip()


def _extract_json_object(text: str) -> str:
    t = _strip_code_fences(text)
    if not t:
        return ""
    # 尝试截取第一个 {...} 作为 JSON
    start = t.find("{")
    end = t.rfind("}")
    if start >= 0 and end > start:
        return t[start : end + 1].strip()
    return t


async def compact_conversation(
    *,
    settings: Settings,
    chat: ChatProvider,
    model: str,
    messages: list[dict[str, Any]],
    question: str,
    callbacks: list | None = None,
) -> ConversationCompaction:
    """
    使用一次 LLM 调用同时完成：
    - Query rewrite：把多轮对话改写为“可检索”的独立问题（用于检索）
    - 记忆压缩：提炼对话背景与约束（用于回答）
    """
    if not (settings.query_rewrite_enabled or settings.memory_summary_enabled):
        return ConversationCompaction(retrieval_query=question, memory_summary=None, used_llm=False)

    # 仅在多轮对话时启用（至少两次 user 输入）
    user_turns = sum(1 for m in messages if (m.get("role") or "") == "user")
    if user_turns < 2:
        return ConversationCompaction(retrieval_query=question, memory_summary=None, used_llm=False)

    # “最近对话”不重复包含当前问题
    history_messages = list(messages)
    for i in range(len(history_messages) - 1, -1, -1):
        m = history_messages[i]
        if (m.get("role") or "") == "user":
            history_messages.pop(i)
            break

    history = format_history_excerpt(
        history_messages,
        max_messages=settings.conversation_history_max_messages,
        max_chars=settings.conversation_history_max_chars,
    )

    sys = (
        "你是对话预处理器，只做结构化输出，不要解释。\n"
        "请基于“最近对话”与“当前问题”，输出严格 JSON（不要 markdown 代码块），结构如下：\n"
        "{\n"
        '  "query": "用于检索 OneKey 开发者文档的独立问题（单句或短段，保留专有名词/错误码/方法名/代码符号）",\n'
        '  "summary": "对话记忆压缩（<= 8 条要点，覆盖：用户目标/上下文/约束/已尝试/关键实体；没有则空字符串）"\n'
        "}\n"
        "要求：\n"
        "- query 用中文输出，但可以保留英文术语与代码符号。\n"
        "- 不要输出 URL，不要输出无关内容。\n"
    )

    user = f"当前问题：{question}\n\n最近对话：\n{history}\n"
    result = await chat.complete(
        model=model,
        messages=[{"role": "system", "content": sys}, {"role": "user", "content": user}],
        callbacks=callbacks,
        temperature=0,
        top_p=1,
        max_tokens=settings.conversation_compaction_max_tokens,
    )

    raw_text = result.content or ""
    json_text = _extract_json_object(raw_text)
    try:
        data = json.loads(json_text)
    except Exception:
        return ConversationCompaction(retrieval_query=question, memory_summary=None, used_llm=True)

    if not isinstance(data, dict):
        return ConversationCompaction(retrieval_query=question, memory_summary=None, used_llm=True)

    query = data.get("query")
    summary = data.get("summary")
    rq = question
    if isinstance(query, str) and query.strip():
        rq = clamp_text(query.strip().strip('"').strip("'"), 220)

    ms: str | None = None
    if isinstance(summary, str) and summary.strip():
        ms = clamp_text(summary.strip(), 1400)

    return ConversationCompaction(retrieval_query=rq, memory_summary=ms, used_llm=True, raw=data)
