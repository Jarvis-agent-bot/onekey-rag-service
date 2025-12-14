from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok"]
    dependencies: dict[str, str]


class AdminCrawlRequest(BaseModel):
    mode: Literal["full", "incremental"] = "full"
    sitemap_url: str | None = None
    seed_urls: list[str] | None = None
    include_patterns: list[str] | None = None
    exclude_patterns: list[str] | None = None
    max_pages: int | None = None


class AdminJobResponse(BaseModel):
    job_id: str


class AdminJobStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: dict[str, Any] = Field(default_factory=dict)
    error: str = ""


class AdminIndexRequest(BaseModel):
    mode: Literal["full", "incremental"] = "incremental"


class OpenAIChatMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str


class OpenAIChatCompletionsRequest(BaseModel):
    model: str = "onekey-docs"
    messages: list[OpenAIChatMessage]
    stream: bool = False
    temperature: float | None = None
    top_p: float | None = None
    max_tokens: int | None = None
    metadata: dict[str, Any] | None = None
    debug: bool = False


class SourceItem(BaseModel):
    ref: int | None = None
    url: str
    title: str = ""
    section_path: str = ""
    snippet: str = ""


class OpenAIChatCompletionsResponseChoiceMessage(BaseModel):
    role: Literal["assistant"]
    content: str


class OpenAIChatCompletionsResponseChoice(BaseModel):
    index: int
    message: OpenAIChatCompletionsResponseChoiceMessage
    finish_reason: str | None = None


class OpenAIUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class OpenAIChatCompletionsResponse(BaseModel):
    id: str
    object: Literal["chat.completion"] = "chat.completion"
    created: int
    model: str
    choices: list[OpenAIChatCompletionsResponseChoice]
    usage: OpenAIUsage = Field(default_factory=OpenAIUsage)
    sources: list[SourceItem] = Field(default_factory=list)
    debug: dict[str, Any] | None = None


class FeedbackRequest(BaseModel):
    conversation_id: str
    message_id: str
    rating: Literal["up", "down"]
    reason: str | None = None
    comment: str | None = None
    sources: list[str] | None = None


class FeedbackResponse(BaseModel):
    status: Literal["ok"] = "ok"
