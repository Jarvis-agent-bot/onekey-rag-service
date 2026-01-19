"""
交易模拟模块

支持在发送交易前模拟执行，预测结果和资产变化
"""
from __future__ import annotations

from typing import Any
from dataclasses import dataclass, field
from decimal import Decimal

from eth_utils import to_checksum_address

from app_logging import get_logger
from integrations import RPCClient
from .schemas import RiskFlag

logger = get_logger(__name__)


# 已知代币信息缓存
KNOWN_TOKENS: dict[int, dict[str, dict[str, Any]]] = {
    # Ethereum Mainnet
    1: {
        "0xdac17f958d2ee523a2206206994597c13d831ec7": {"symbol": "USDT", "decimals": 6},
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": {"symbol": "USDC", "decimals": 6},
        "0x6b175474e89094c44da98b954eedeac495271d0f": {"symbol": "DAI", "decimals": 18},
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": {"symbol": "WETH", "decimals": 18},
        "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": {"symbol": "WBTC", "decimals": 8},
    },
    # BSC
    56: {
        "0x55d398326f99059ff775485246999027b3197955": {"symbol": "USDT", "decimals": 18},
        "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": {"symbol": "USDC", "decimals": 18},
        "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": {"symbol": "WBNB", "decimals": 18},
    },
    # Polygon
    137: {
        "0xc2132d05d31c914a87c6611c10748aeb04b58e8f": {"symbol": "USDT", "decimals": 6},
        "0x2791bca1f2de4661ed88a30c99a7a9449aa84174": {"symbol": "USDC", "decimals": 6},
        "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270": {"symbol": "WMATIC", "decimals": 18},
    },
}

# ERC20 Transfer 事件签名
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
# ERC20 Approval 事件签名
APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"


@dataclass
class TokenTransfer:
    """代币转账记录"""
    token_address: str
    from_address: str
    to_address: str
    amount: str  # raw amount
    symbol: str = ""
    decimals: int = 18
    formatted_amount: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "token_address": self.token_address,
            "from_address": self.from_address,
            "to_address": self.to_address,
            "amount": self.amount,
            "symbol": self.symbol,
            "decimals": self.decimals,
            "formatted_amount": self.formatted_amount,
        }


@dataclass
class AssetChange:
    """资产变化"""
    address: str  # 受影响的地址
    token: str  # 代币地址或 "native"
    symbol: str
    decimals: int
    change: str  # 变化量 (可为负数)
    formatted_change: str
    direction: str  # "in" | "out"

    def to_dict(self) -> dict[str, Any]:
        return {
            "address": self.address,
            "token": self.token,
            "symbol": self.symbol,
            "decimals": self.decimals,
            "change": self.change,
            "formatted_change": self.formatted_change,
            "direction": self.direction,
        }


@dataclass
class SimulationResult:
    """模拟结果"""
    success: bool
    gas_used: int = 0
    return_data: str = ""
    error_message: str = ""

    # 资产变化
    token_transfers: list[TokenTransfer] = field(default_factory=list)
    asset_changes: list[AssetChange] = field(default_factory=list)

    # 风险
    risk_flags: list[RiskFlag] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    # 原始数据
    raw_result: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "gas_used": self.gas_used,
            "return_data": self.return_data,
            "error_message": self.error_message,
            "token_transfers": [t.to_dict() for t in self.token_transfers],
            "asset_changes": [a.to_dict() for a in self.asset_changes],
            "risk_flags": [rf.model_dump() for rf in self.risk_flags],
            "warnings": self.warnings,
        }


@dataclass
class SimulationRequest:
    """模拟请求"""
    chain_id: int
    from_address: str
    to_address: str
    data: str
    value: str = "0"  # wei
    gas_limit: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "chain_id": self.chain_id,
            "from_address": self.from_address,
            "to_address": self.to_address,
            "data": self.data,
            "value": self.value,
            "gas_limit": self.gas_limit,
        }


class TxSimulator:
    """交易模拟器"""

    def __init__(self, rpc_clients: dict[int, RPCClient]):
        """
        Args:
            rpc_clients: 链ID -> RPC客户端的映射
        """
        self.rpc_clients = rpc_clients

    async def simulate(self, request: SimulationRequest) -> SimulationResult:
        """
        模拟交易执行

        Args:
            request: 模拟请求

        Returns:
            SimulationResult: 模拟结果
        """
        rpc = self.rpc_clients.get(request.chain_id)
        if not rpc:
            return SimulationResult(
                success=False,
                error_message=f"Unsupported chain: {request.chain_id}",
            )

        result = SimulationResult(success=True)

        # 1. 使用 eth_call 模拟执行
        try:
            call_result = await self._simulate_call(rpc, request)
            result.return_data = call_result.get("result", "")
            result.raw_result["eth_call"] = call_result

            if call_result.get("error"):
                result.success = False
                result.error_message = call_result["error"]
                result.warnings.append(f"Transaction will fail: {call_result['error']}")
        except Exception as e:
            logger.warning("simulate_call_error", error=str(e))
            result.success = False
            result.error_message = str(e)

        # 2. 估算 gas
        try:
            gas_estimate = await self._estimate_gas(rpc, request)
            result.gas_used = gas_estimate
        except Exception as e:
            logger.warning("estimate_gas_error", error=str(e))
            # Gas 估算失败不影响模拟结果
            result.warnings.append(f"Gas estimation failed: {str(e)}")

        # 3. 尝试使用 trace_call 获取详细信息（如果 RPC 支持）
        try:
            trace_result = await self._trace_call(rpc, request)
            if trace_result:
                result.raw_result["trace_call"] = trace_result
                # 从 trace 中提取代币转账
                transfers = self._extract_transfers_from_trace(trace_result, request.chain_id)
                result.token_transfers = transfers
                # 计算资产变化
                result.asset_changes = self._calculate_asset_changes(
                    transfers, request.from_address, request.value
                )
        except Exception as e:
            logger.debug("trace_call_not_supported", error=str(e))
            # trace_call 不是所有节点都支持，忽略错误

        # 4. 分析风险
        result.risk_flags = self._analyze_simulation_risks(result, request)

        return result

    async def _simulate_call(
        self, rpc: RPCClient, request: SimulationRequest
    ) -> dict[str, Any]:
        """使用 eth_call 模拟"""
        try:
            result = await rpc.call(
                to=request.to_address,
                data=request.data,
                from_address=request.from_address,
            )
            return {"result": result}
        except Exception as e:
            error_msg = str(e)
            # 解析 revert 原因
            if "revert" in error_msg.lower():
                return {"error": error_msg, "type": "revert"}
            return {"error": error_msg, "type": "unknown"}

    async def _estimate_gas(self, rpc: RPCClient, request: SimulationRequest) -> int:
        """估算 gas"""
        params = {
            "from": request.from_address,
            "to": request.to_address,
            "data": request.data,
        }
        if request.value and request.value != "0":
            params["value"] = hex(int(request.value))

        result = await rpc._call("eth_estimateGas", [params])
        return int(result, 16) if result else 0

    async def _trace_call(
        self, rpc: RPCClient, request: SimulationRequest
    ) -> dict[str, Any] | None:
        """使用 trace_call 获取详细执行信息"""
        params = {
            "from": request.from_address,
            "to": request.to_address,
            "data": request.data,
        }
        if request.value and request.value != "0":
            params["value"] = hex(int(request.value))

        try:
            # 尝试 debug_traceCall (Geth)
            result = await rpc._call(
                "debug_traceCall",
                [params, "latest", {"tracer": "callTracer"}]
            )
            return result
        except Exception:
            pass

        try:
            # 尝试 trace_call (OpenEthereum/Erigon)
            result = await rpc._call(
                "trace_call",
                [params, ["trace"], "latest"]
            )
            return result
        except Exception:
            pass

        return None

    def _extract_transfers_from_trace(
        self, trace: dict[str, Any], chain_id: int
    ) -> list[TokenTransfer]:
        """从 trace 结果中提取代币转账"""
        transfers: list[TokenTransfer] = []

        # 处理 callTracer 格式
        if "calls" in trace:
            self._process_call_trace(trace, transfers, chain_id)

        # 处理 trace_call 格式
        if "trace" in trace:
            for t in trace["trace"]:
                self._process_trace_entry(t, transfers, chain_id)

        return transfers

    def _process_call_trace(
        self,
        call: dict[str, Any],
        transfers: list[TokenTransfer],
        chain_id: int,
    ) -> None:
        """处理 callTracer 格式的 trace"""
        # 检查是否有日志（代币转账事件）
        logs = call.get("logs", [])
        for log in logs:
            topics = log.get("topics", [])
            if topics and topics[0].lower() == TRANSFER_TOPIC.lower():
                transfer = self._parse_transfer_log(log, chain_id)
                if transfer:
                    transfers.append(transfer)

        # 递归处理子调用
        for sub_call in call.get("calls", []):
            self._process_call_trace(sub_call, transfers, chain_id)

    def _process_trace_entry(
        self,
        entry: dict[str, Any],
        transfers: list[TokenTransfer],
        chain_id: int,
    ) -> None:
        """处理 trace_call 格式的 trace 条目"""
        action = entry.get("action", {})
        result = entry.get("result", {})

        # 检查是否是合约调用
        if entry.get("type") == "call":
            # 这里可以进一步分析调用
            pass

    def _parse_transfer_log(
        self, log: dict[str, Any], chain_id: int
    ) -> TokenTransfer | None:
        """解析 Transfer 事件日志"""
        try:
            topics = log.get("topics", [])
            data = log.get("data", "0x")
            address = log.get("address", "")

            if len(topics) < 3:
                return None

            from_addr = to_checksum_address("0x" + topics[1][-40:])
            to_addr = to_checksum_address("0x" + topics[2][-40:])

            # 解析金额
            amount = "0"
            if data and data != "0x":
                amount = str(int(data, 16))

            # 获取代币信息
            token_info = self._get_token_info(address, chain_id)

            formatted = self._format_amount(amount, token_info.get("decimals", 18))

            return TokenTransfer(
                token_address=address,
                from_address=from_addr,
                to_address=to_addr,
                amount=amount,
                symbol=token_info.get("symbol", ""),
                decimals=token_info.get("decimals", 18),
                formatted_amount=formatted,
            )
        except Exception as e:
            logger.warning("parse_transfer_log_error", error=str(e))
            return None

    def _get_token_info(self, address: str, chain_id: int) -> dict[str, Any]:
        """获取代币信息"""
        address_lower = address.lower()
        chain_tokens = KNOWN_TOKENS.get(chain_id, {})

        if address_lower in chain_tokens:
            return chain_tokens[address_lower]

        # 返回默认值
        return {"symbol": "???", "decimals": 18}

    def _format_amount(self, amount: str, decimals: int) -> str:
        """格式化金额"""
        try:
            value = Decimal(amount) / Decimal(10 ** decimals)
            if value == 0:
                return "0"
            if value < Decimal("0.0001"):
                return f"< 0.0001"
            return f"{value:.4f}"
        except Exception:
            return amount

    def _calculate_asset_changes(
        self,
        transfers: list[TokenTransfer],
        user_address: str,
        native_value: str,
    ) -> list[AssetChange]:
        """计算资产变化"""
        changes: list[AssetChange] = []
        user_lower = user_address.lower()

        # 计算原生代币变化
        if native_value and native_value != "0":
            try:
                value = int(native_value)
                formatted = self._format_amount(str(value), 18)
                changes.append(AssetChange(
                    address=user_address,
                    token="native",
                    symbol="ETH",
                    decimals=18,
                    change=f"-{value}",
                    formatted_change=f"-{formatted}",
                    direction="out",
                ))
            except ValueError:
                pass

        # 聚合代币变化
        token_changes: dict[str, int] = {}  # token -> net change
        token_info: dict[str, dict] = {}

        for transfer in transfers:
            token = transfer.token_address.lower()
            if token not in token_info:
                token_info[token] = {
                    "symbol": transfer.symbol,
                    "decimals": transfer.decimals,
                }

            amount = int(transfer.amount) if transfer.amount else 0

            # 用户发出
            if transfer.from_address.lower() == user_lower:
                token_changes[token] = token_changes.get(token, 0) - amount

            # 用户收到
            if transfer.to_address.lower() == user_lower:
                token_changes[token] = token_changes.get(token, 0) + amount

        # 转换为 AssetChange
        for token, change in token_changes.items():
            if change == 0:
                continue

            info = token_info.get(token, {})
            formatted = self._format_amount(str(abs(change)), info.get("decimals", 18))
            direction = "in" if change > 0 else "out"
            sign = "+" if change > 0 else "-"

            changes.append(AssetChange(
                address=user_address,
                token=token,
                symbol=info.get("symbol", "???"),
                decimals=info.get("decimals", 18),
                change=str(change),
                formatted_change=f"{sign}{formatted}",
                direction=direction,
            ))

        return changes

    def _analyze_simulation_risks(
        self,
        result: SimulationResult,
        request: SimulationRequest,
    ) -> list[RiskFlag]:
        """分析模拟结果的风险"""
        risks: list[RiskFlag] = []

        # 检查是否会失败
        if not result.success:
            risks.append(RiskFlag(
                type="transaction_will_fail",
                severity="high",
                evidence=result.error_message,
                description="This transaction will fail if executed",
            ))

        # 检查大额转出
        for change in result.asset_changes:
            if change.direction == "out":
                try:
                    amount = abs(int(change.change))
                    # 检查大额转出（粗略估计）
                    if change.token == "native" and amount > 10 * 10**18:
                        risks.append(RiskFlag(
                            type="high_value_out",
                            severity="medium",
                            evidence=f"Sending {change.formatted_change} {change.symbol}",
                            description="Large amount of native tokens being sent",
                        ))
                except (ValueError, TypeError):
                    pass

        # 检查 gas 异常
        if result.gas_used > 1_000_000:
            risks.append(RiskFlag(
                type="high_gas_usage",
                severity="low",
                evidence=f"Gas estimate: {result.gas_used}",
                description="High gas usage, transaction may be complex",
            ))

        return risks


async def simulate_transaction(
    rpc_clients: dict[int, RPCClient],
    chain_id: int,
    from_address: str,
    to_address: str,
    data: str,
    value: str = "0",
) -> SimulationResult:
    """
    便捷函数：模拟交易

    Args:
        rpc_clients: RPC 客户端映射
        chain_id: 链 ID
        from_address: 发送者地址
        to_address: 接收者/合约地址
        data: calldata
        value: 发送的原生代币数量 (wei)

    Returns:
        SimulationResult: 模拟结果
    """
    simulator = TxSimulator(rpc_clients)
    request = SimulationRequest(
        chain_id=chain_id,
        from_address=from_address,
        to_address=to_address,
        data=data,
        value=value,
    )
    return await simulator.simulate(request)
