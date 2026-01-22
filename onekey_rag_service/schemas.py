from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok"]
    dependencies: dict[str, str]


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
    response_format: dict[str, Any] | None = None
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


class ContractInfo(BaseModel):
    """合约索引信息 - 来自 contract_index 的确定性协议识别结果"""
    address: str
    protocol: str
    protocol_version: str = ""
    contract_type: str = ""
    contract_name: str = ""
    source_url: str = ""
    confidence: float = 1.0
    chain_id: int = 1
    source: str = "contract_index"


class OpenAIChatCompletionsResponse(BaseModel):
    id: str
    object: Literal["chat.completion"] = "chat.completion"
    created: int
    model: str
    choices: list[OpenAIChatCompletionsResponseChoice]
    usage: OpenAIUsage = Field(default_factory=OpenAIUsage)
    sources: list[SourceItem] = Field(default_factory=list)
    contract_info: ContractInfo | None = None
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
