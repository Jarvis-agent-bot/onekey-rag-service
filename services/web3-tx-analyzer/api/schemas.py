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


# ==================== 新增：Calldata 解码 ====================

class DecodeCalldataRequest(BaseModel):
    """Calldata 解码请求"""
    calldata: str  # 原始 calldata (0x 开头)
    chain_id: int = 1
    to_address: str | None = None  # 目标合约地址（可选，用于获取 ABI）
    from_address: str | None = None
    value: str = "0"  # wei


class DecodeCalldataResponse(BaseModel):
    """Calldata 解码响应"""
    trace_id: str
    status: Literal["success", "partial", "failed"] = "success"
    result: dict[str, Any] | None = None
    formatted: dict[str, Any] | None = None  # 格式化后的显示数据
    error: str | None = None
    timings: dict[str, int] = Field(default_factory=dict)


# ==================== 新增：交易模拟 ====================

class SimulateRequest(BaseModel):
    """交易模拟请求"""
    chain_id: int
    from_address: str
    to_address: str
    data: str  # calldata
    value: str = "0"  # wei
    gas_limit: int | None = None


class SimulateResponse(BaseModel):
    """交易模拟响应"""
    trace_id: str
    status: Literal["success", "failed"] = "success"
    result: dict[str, Any] | None = None
    error: str | None = None
    timings: dict[str, int] = Field(default_factory=dict)


# ==================== 新增：签名解析 ====================

class DecodeSignatureRequest(BaseModel):
    """签名数据解析请求"""
    data: dict[str, Any] | str  # EIP-712 数据或 JSON 字符串
    chain_id: int | None = None


class DecodeSignatureResponse(BaseModel):
    """签名数据解析响应"""
    trace_id: str
    status: Literal["success", "failed"] = "success"
    result: dict[str, Any] | None = None
    summary: str | None = None  # 人类可读的摘要
    error: str | None = None


# ==================== 新增：智能解析 (自动识别输入类型) ====================

class SmartAnalyzeRequest(BaseModel):
    """智能分析请求 - 自动识别输入类型"""
    input: str  # 交易哈希 / calldata / 签名数据
    chain_id: int = 1
    # 可选的上下文信息
    context: dict[str, Any] = Field(default_factory=dict)
    options: TxAnalyzeOptions = Field(default_factory=TxAnalyzeOptions)


class SmartAnalyzeResponse(BaseModel):
    """智能分析响应"""
    trace_id: str
    input_type: Literal["tx_hash", "calldata", "signature", "unknown"]
    status: Literal["success", "partial", "failed"] = "success"
    # 根据类型返回不同的结果
    tx_result: dict[str, Any] | None = None  # 交易哈希分析结果
    decode_result: dict[str, Any] | None = None  # calldata 解码结果
    signature_result: dict[str, Any] | None = None  # 签名解析结果
    explanation: ExplanationResult | None = None
    error: str | None = None
    timings: dict[str, int] = Field(default_factory=dict)
