from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class GasInfo(BaseModel):
    """Gas 信息"""
    gas_used: str = ""
    gas_price: str = ""
    fee_paid: str = ""


class DecodedMethod(BaseModel):
    """解码后的方法"""
    signature: str = ""
    selector: str = ""
    name: str = ""
    inputs: list[dict[str, Any]] = Field(default_factory=list)
    abi_source: Literal["registry", "explorer", "signature_db", "unknown"] = "unknown"
    abi_ref: str = ""


class DecodedEvent(BaseModel):
    """解码后的事件"""
    name: str
    address: str
    log_index: int = 0
    topics: list[str] = Field(default_factory=list)
    args: dict[str, Any] = Field(default_factory=dict)
    event_type: str = ""  # transfer_erc20, transfer_erc721, swap_v2, etc.


class BehaviorResult(BaseModel):
    """行为分析结果"""
    type: Literal[
        "swap",
        "bridge",
        "stake",
        "unstake",
        "lend",
        "borrow",
        "repay",
        "liquidity_add",
        "liquidity_remove",
        "mint",
        "burn",
        "nft_trade",
        "transfer",
        "approve",
        "claim",
        "airdrop",
        "wrap",
        "unwrap",
        "unknown",
    ] = "unknown"
    confidence: Literal["high", "medium", "low"] = "low"
    evidence: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class RiskFlag(BaseModel):
    """风险标签"""
    type: str
    severity: Literal["low", "medium", "high"] = "low"
    evidence: str = ""
    description: str = ""


class TraceInfo(BaseModel):
    """Trace 信息"""
    source: str = ""
    ref: str = ""
    status: Literal["success", "failed", "unknown"] = "unknown"
    summary: list[str] = Field(default_factory=list)


class SourcesInfo(BaseModel):
    """数据来源信息"""
    tx_receipt: str = ""
    logs: str = ""
    abi: str = ""


class DiagnosticsInfo(BaseModel):
    """诊断信息"""
    abi: dict[str, Any] = Field(default_factory=dict)
    method: dict[str, Any] = Field(default_factory=dict)
    events: dict[str, Any] = Field(default_factory=dict)


class TxParseResult(BaseModel):
    """交易解析结果"""
    version: str = "1.0.0"
    tx_hash: str
    chain_id: int
    block_number: int | None = None
    timestamp: int | None = None

    # 交易基本信息
    from_address: str = Field(alias="from", default="")
    to_address: str | None = Field(alias="to", default=None)
    nonce: int | None = None
    tx_type: int | None = None
    value: str = "0"
    input_data: str = Field(alias="input", default="")

    # Gas 信息
    gas: GasInfo = Field(default_factory=GasInfo)

    # 状态
    status: Literal["success", "failed"] = "success"

    # 解码信息
    method: DecodedMethod | None = None
    events: list[DecodedEvent] = Field(default_factory=list)

    # 行为分析
    behavior: BehaviorResult = Field(default_factory=BehaviorResult)

    # 风险标签
    risk_flags: list[RiskFlag] = Field(default_factory=list)

    # 来源信息
    sources: SourcesInfo = Field(default_factory=SourcesInfo)

    # 诊断信息
    diagnostics: DiagnosticsInfo = Field(default_factory=DiagnosticsInfo)

    # Trace 信息（可选）
    trace: TraceInfo | None = None

    class Config:
        populate_by_name = True

    def to_dict(self) -> dict[str, Any]:
        """转换为字典（用于 JSON 序列化）"""
        return self.model_dump(by_alias=True, exclude_none=True)


class TxAnalyzeRequest(BaseModel):
    """交易分析请求"""
    chain_id: int
    tx_hash: str
    options: dict[str, Any] = Field(default_factory=dict)


class TxAnalyzeOptions(BaseModel):
    """交易分析选项"""
    include_explanation: bool = True
    include_trace: bool = False
    language: str = "zh"


class ExplanationResult(BaseModel):
    """RAG 解释结果"""
    summary: str = ""
    risk_level: Literal["low", "medium", "high", "unknown"] = "unknown"
    risk_reasons: list[str] = Field(default_factory=list)
    actions: list[dict[str, Any]] = Field(default_factory=list)
    sources: list[dict[str, Any]] = Field(default_factory=list)


class TxAnalyzeResponse(BaseModel):
    """交易分析响应"""
    trace_id: str
    status: Literal["success", "partial", "failed"] = "success"
    parse_result: TxParseResult | None = None
    explanation: ExplanationResult | None = None
    timings: dict[str, int] = Field(default_factory=dict)
    error: str | None = None
    trace_log: list[dict[str, Any]] | None = None
