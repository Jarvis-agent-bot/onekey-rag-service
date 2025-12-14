from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class ChunkItem:
    section_path: str
    text: str


def chunk_markdown_by_headers(markdown: str, *, max_chars: int = 2400, overlap_chars: int = 200) -> list[ChunkItem]:
    """
    MVP chunking：
    - 以标题（# / ## / ###）为边界分段
    - 再按长度切分，保持少量 overlap
    """
    # 优先使用 LangChain 的 MarkdownHeaderTextSplitter（满足“使用 LangChain”的约束）
    lc_chunks = _try_langchain_header_split(markdown, max_chars=max_chars, overlap_chars=overlap_chars)
    if lc_chunks:
        return lc_chunks

    lines = markdown.splitlines()
    sections: list[tuple[str, list[str]]] = []

    current_path: list[str] = []
    current_lines: list[str] = []

    def flush() -> None:
        nonlocal current_lines
        if not current_lines:
            return
        section_path = " > ".join(current_path)
        sections.append((section_path, current_lines))
        current_lines = []

    for line in lines:
        header = re.match(r"^(#{1,3})\s+(.*)$", line.strip())
        if header:
            flush()
            level = len(header.group(1))
            title = header.group(2).strip()
            if level == 1:
                current_path = [title]
            elif level == 2:
                current_path = (current_path[:1] if current_path else []) + [title]
            else:
                current_path = (current_path[:2] if len(current_path) >= 2 else current_path) + [title]
            current_lines.append(line.strip())
        else:
            current_lines.append(line)

    flush()

    chunk_items: list[ChunkItem] = []
    for section_path, section_lines in sections:
        text = "\n".join(section_lines).strip()
        if not text:
            continue
        chunk_items.extend(_split_by_length(section_path, text, max_chars=max_chars, overlap_chars=overlap_chars))

    return chunk_items


def _try_langchain_header_split(markdown: str, *, max_chars: int, overlap_chars: int) -> list[ChunkItem]:
    try:
        from langchain_text_splitters import MarkdownHeaderTextSplitter  # type: ignore
    except Exception:
        try:
            from langchain.text_splitter import MarkdownHeaderTextSplitter  # type: ignore
        except Exception:
            return []

    splitter = MarkdownHeaderTextSplitter(headers_to_split_on=[("#", "h1"), ("##", "h2"), ("###", "h3")])
    try:
        docs = splitter.split_text(markdown)
    except Exception:
        return []

    items: list[ChunkItem] = []
    for doc in docs:
        meta = getattr(doc, "metadata", {}) or {}
        path = [meta.get("h1"), meta.get("h2"), meta.get("h3")]
        section_path = " > ".join([str(p).strip() for p in path if p and str(p).strip()])
        text = (getattr(doc, "page_content", "") or "").strip()
        if not text:
            continue
        items.extend(_split_by_length(section_path, text, max_chars=max_chars, overlap_chars=overlap_chars))

    return items


def _split_by_length(section_path: str, text: str, *, max_chars: int, overlap_chars: int) -> list[ChunkItem]:
    if len(text) <= max_chars:
        return [ChunkItem(section_path=section_path, text=text)]

    items: list[ChunkItem] = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        part = text[start:end].strip()
        if part:
            items.append(ChunkItem(section_path=section_path, text=part))
        if end >= len(text):
            break
        start = max(0, end - overlap_chars)
    return items
