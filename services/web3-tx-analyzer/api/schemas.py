from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class TxAnalyzeOptions(BaseModel):
    """分析选项"""
    include_explanation: bool = True
    include_trace: bool = False
    language: str = "zh"


class TxAnalyzeRequest(BaseModel):
    """交易分析请求"""
    chain_id: int
    tx_hash: str
    options: TxAnalyzeOptions = Field(default_factory=TxAnalyzeOptions)


class ExplanationResult(BaseModel):
    """解释结果"""
    summary: str = ""
    risk_level: Literal["low", "medium", "high", "unknown"] = "unknown"
    risk_reasons: list[str] = Field(default_factory=list)
    actions: list[dict[str, Any]] = Field(default_factory=list)
    sources: list[dict[str, Any]] = Field(default_factory=list)


class TxAnalyzeResponse(BaseModel):
    """交易分析响应"""
    trace_id: str
    status: Literal["success", "partial", "failed"] = "success"
    parse_result: dict[str, Any] | None = None
    explanation: ExplanationResult | None = None
    timings: dict[str, int] = Field(default_factory=dict)
    error: str | None = None
    trace_log: list[dict[str, Any]] | None = None


class TxParseRequest(BaseModel):
    """交易解析请求（不调用 RAG）"""
    chain_id: int
    tx_hash: str


class TxParseResponse(BaseModel):
    """交易解析响应"""
    trace_id: str
    status: Literal["success", "failed"] = "success"
    parse_result: dict[str, Any] | None = None
    timings: dict[str, int] = Field(default_factory=dict)
    error: str | None = None


class ChainInfo(BaseModel):
    """链信息"""
    chain_id: int
    name: str
    native_token: str
    explorer_url: str


class HealthResponse(BaseModel):
    """健康检查响应"""
    status: Literal["ok", "degraded", "unhealthy"]
    version: str
    dependencies: dict[str, str] = Field(default_factory=dict)
