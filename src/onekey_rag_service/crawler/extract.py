from __future__ import annotations

import re

from bs4 import BeautifulSoup
from readability import Document


def _html_to_markdown_like(html: str) -> tuple[str, str]:
    """
    说明：MVP 先输出“接近 Markdown”的纯文本格式（含标题与代码块），后续可替换为更严格的 HTML->Markdown 转换器。
    """
    soup = BeautifulSoup(html, "lxml")

    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()

    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()

    main = soup.find("main") or soup.body or soup

    lines: list[str] = []

    for el in main.descendants:
        if getattr(el, "name", None) in {"h1", "h2", "h3"}:
            text = el.get_text(" ", strip=True)
            if not text:
                continue
            prefix = {"h1": "# ", "h2": "## ", "h3": "### "}.get(el.name, "")
            lines.append(prefix + text)
            continue

        if getattr(el, "name", None) == "pre":
            code = el.get_text("\n", strip=False)
            code = re.sub(r"\n{3,}", "\n\n", code).rstrip()
            if code:
                lines.append("```")
                lines.append(code)
                lines.append("```")
            continue

        if getattr(el, "name", None) in {"p", "li"}:
            text = el.get_text(" ", strip=True)
            if text:
                lines.append(text)

    content = "\n\n".join([ln for ln in (ln.strip() for ln in lines) if ln])
    content = re.sub(r"\n{3,}", "\n\n", content).strip()
    return title, content


def extract_readable(html: str) -> tuple[str, str]:
    doc = Document(html)
    title = (doc.short_title() or "").strip()
    summary_html = doc.summary(html_partial=True)
    t2, content = _html_to_markdown_like(summary_html)
    if not title:
        title = t2
    return title, content

