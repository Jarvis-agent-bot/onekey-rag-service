from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class TxAnalyzeOptions(BaseModel):
    """分析选项"""
    include_explanation: bool = True
    include_trace: bool = False
    include_simulation: bool = False  # 是否包含交易模拟
    language: str = "zh"


class TxAnalyzeRequest(BaseModel):
    """交易分析请求"""
    chain_id: int
    tx_hash: str
    options: TxAnalyzeOptions = Field(default_factory=TxAnalyzeOptions)


class ContractIndexInfo(BaseModel):
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


class ExplanationResult(BaseModel):
    """解释结果"""
    summary: str = ""
    risk_level: Literal["low", "medium", "high", "unknown"] = "unknown"
    risk_reasons: list[str] = Field(default_factory=list)
    actions: list[dict[str, Any]] = Field(default_factory=list)
    sources: list[dict[str, Any]] = Field(default_factory=list)
    protocol: str | None = None
    address_attribution: list[dict[str, Any]] = Field(default_factory=list)
    contract_info: ContractIndexInfo | dict[str, Any] | None = None  # 来自 contract_index 的确定性结果


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


class ProtocolInfo(BaseModel):
    """协议信息 (用于已知协议的识别)"""
    protocol: str  # 协议名称，如 "Aave V3", "Uniswap V2"
    name: str  # 合约名称，如 "Pool", "Router02"
    type: str  # 合约类型，如 "lending_pool", "dex_router"
    website: str | None = None  # 协议官网


class AssetChangeInfo(BaseModel):
    """资产变化信息"""
    direction: Literal["in", "out"]  # in=收入, out=支出
    token_address: str
    token_symbol: str
    token_name: str
    decimals: int
    amount_raw: str  # 原始金额 (wei)
    amount_formatted: str  # 格式化金额
    token_type: str = "token"  # native, wrapped_native, stablecoin, atoken, token


class DecodeCalldataResponse(BaseModel):
    """
    Calldata 解码响应

    result 包含:
    - selector: 函数选择器
    - function_name: 函数名
    - function_signature: 完整签名
    - inputs: 解码后的参数
    - behavior_type: 行为类型 (approve, transfer, swap, etc.)
    - risk_level: 风险等级 (low, medium, high)
    - protocol_info: 协议信息 (如果是已知协议)
    - asset_changes: 资产变化预测 (Pay/Receive)
    - abi_source: ABI 来源 (local_registry, etherscan, 4bytes)
    """
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
    simulation_result: dict[str, Any] | None = None  # 交易模拟结果 (新增)
    explanation: ExplanationResult | None = None
    error: str | None = None
    timings: dict[str, int] = Field(default_factory=dict)
    trace_log: list[dict[str, Any]] | None = None  # 查询步骤追踪
