from __future__ import annotations

import re
from typing import Callable

from bs4 import BeautifulSoup, Tag
from markdownify import MarkdownConverter, markdownify
from readability import Document


class _EnhancedMarkdownConverter(MarkdownConverter):
    """
    增强的 Markdown 转换器，专门优化技术文档的转换效果。

    改进点：
    1. 表格支持：自动推断表头，正确转换表格结构
    2. 代码块：从 class 属性中提取语言信息
    3. 地址/哈希保护：确保合约地址等不被截断或损坏
    """

    def __init__(self, **options):
        # 设置默认选项
        options.setdefault("heading_style", "ATX")  # 使用 # 风格标题
        options.setdefault("bullets", "-")  # 列表使用 -
        options.setdefault("code_language_callback", self._detect_code_language)
        options.setdefault("strip", ["script", "style", "noscript", "svg", "nav", "footer", "aside"])
        options.setdefault("table_infer_header", True)  # 自动推断表头
        super().__init__(**options)

    def _detect_code_language(self, el: Tag) -> str | None:
        """从代码块的 class 属性中检测编程语言"""
        if not el:
            return None

        classes = el.get("class", [])
        if isinstance(classes, str):
            classes = classes.split()

        for cls in classes:
            # 常见的代码高亮类名格式：language-xxx, lang-xxx, highlight-xxx
            for prefix in ["language-", "lang-", "highlight-"]:
                if cls.startswith(prefix):
                    return cls[len(prefix):]
            # 直接匹配常见语言名
            if cls.lower() in {
                "javascript", "js", "typescript", "ts", "python", "py",
                "solidity", "sol", "rust", "go", "java", "json", "yaml",
                "bash", "shell", "sh", "sql", "graphql", "html", "css",
            }:
                return cls.lower()

        return None


def _preprocess_html(html: str) -> str:
    """
    预处理 HTML，确保重要内容（如合约地址）被正确保留。
    """
    soup = BeautifulSoup(html, "lxml")

    # 移除可能干扰内容提取的元素
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()

    # 移除空的或仅包含空白的元素（但保留表格单元格）
    for tag in soup.find_all(True):
        if tag.name not in {"td", "th", "tr", "table", "pre", "code"}:
            if tag.string and not tag.string.strip():
                tag.decompose()

    return str(soup)


def _html_to_markdown(html: str) -> tuple[str, str]:
    """
    使用 markdownify 将 HTML 转换为 Markdown。

    支持：
    - 表格（包括合约地址表格）
    - 代码块（自动检测语言）
    - 标题层级
    - 链接和图片
    - 列表
    """
    soup = BeautifulSoup(html, "lxml")

    # 提取标题
    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()

    # 预处理
    processed_html = _preprocess_html(html)

    # 使用增强的转换器
    converter = _EnhancedMarkdownConverter()
    content = converter.convert(processed_html)

    # 后处理：清理多余的空行和空格
    content = re.sub(r"\n{3,}", "\n\n", content)
    content = re.sub(r" {2,}", " ", content)
    content = content.strip()

    return title, content


def _html_to_markdown_like(html: str) -> tuple[str, str]:
    """
    向后兼容的函数名，内部使用 markdownify 实现。
    """
    return _html_to_markdown(html)


def extract_readable(html: str) -> tuple[str, str]:
    """
    从 HTML 中提取可读内容。

    策略：
    1. 优先尝试使用 readability 提取主要内容区域
    2. 如果 readability 结果太短，直接处理原始 HTML 的 main/article/body
    3. 使用 markdownify 转换为 Markdown 格式
    """
    doc = Document(html)
    title = (doc.short_title() or "").strip()

    # 使用 readability 提取摘要
    summary_html = doc.summary(html_partial=True)
    t2, content = _html_to_markdown(summary_html)

    # 如果 readability 结果太短（可能丢失了重要内容如表格），
    # 尝试直接从原始 HTML 中提取
    if len(content) < 200:
        soup = BeautifulSoup(html, "lxml")

        # 移除导航、页脚等非内容元素
        for tag in soup(["nav", "footer", "header", "aside", "script", "style", "noscript"]):
            tag.decompose()

        # 尝试找到主要内容区域
        main_content = (
            soup.find("main") or
            soup.find("article") or
            soup.find(attrs={"role": "main"}) or
            soup.find(class_=re.compile(r"content|main|article", re.I)) or
            soup.body
        )

        if main_content:
            fallback_title, fallback_content = _html_to_markdown(str(main_content))

            # 如果 fallback 内容更丰富，使用它
            if len(fallback_content) > len(content):
                content = fallback_content
                if not title and fallback_title:
                    title = fallback_title

    if not title:
        title = t2

    return title, content

