"""
Calldata 解码模块

支持解码未签名/未发送交易的 calldata 数据
"""
from __future__ import annotations

from typing import Any
from dataclasses import dataclass, field

from eth_utils import to_checksum_address

from app_logging import get_logger
from .abi_decoder import ABIDecoder
from .schemas import RiskFlag

logger = get_logger(__name__)


# 已知的危险函数选择器
DANGEROUS_SELECTORS: dict[str, dict[str, Any]] = {
    # 无限授权
    "0x095ea7b3": {
        "name": "approve",
        "risk_level": "check_value",  # 需要检查 value 参数
        "description": "Token approval - check the approved amount",
    },
    # NFT 全部授权
    "0xa22cb465": {
        "name": "setApprovalForAll",
        "risk_level": "high",
        "description": "NFT approval for all tokens to an operator",
    },
    # Permit (无 gas 授权)
    "0xd505accf": {
        "name": "permit",
        "risk_level": "high",
        "description": "Gasless token approval via signature",
    },
    # Permit2
    "0x2b67b570": {
        "name": "permit",
        "risk_level": "high",
        "description": "Permit2 batch approval",
    },
    # 转账
    "0xa9059cbb": {
        "name": "transfer",
        "risk_level": "medium",
        "description": "Token transfer - verify recipient and amount",
    },
    "0x23b872dd": {
        "name": "transferFrom",
        "risk_level": "medium",
        "description": "Token transfer from another address",
    },
}

# 已知的安全/常见函数
SAFE_SELECTORS: dict[str, str] = {
    "0x70a08231": "balanceOf",
    "0xdd62ed3e": "allowance",
    "0x18160ddd": "totalSupply",
    "0x313ce567": "decimals",
    "0x06fdde03": "name",
    "0x95d89b41": "symbol",
}

# 已知合约类型标识
KNOWN_CONTRACT_PATTERNS: dict[str, list[str]] = {
    "uniswap_v2_router": [
        "0x38ed1739",  # swapExactTokensForTokens
        "0x7ff36ab5",  # swapExactETHForTokens
        "0xe8e33700",  # addLiquidity
    ],
    "uniswap_v3_router": [
        "0x414bf389",  # exactInputSingle
        "0xc04b8d59",  # exactInput
    ],
    "permit2": [
        "0x2b67b570",  # permit
        "0x2a2d80d1",  # permitTransferFrom
    ],
}


@dataclass
class DecodedCalldata:
    """解码后的 calldata 结果"""
    # 基础信息
    selector: str
    raw_data: str

    # 解码信息
    function_name: str = ""
    function_signature: str = ""
    inputs: list[dict[str, Any]] = field(default_factory=list)

    # 分析结果
    behavior_type: str = "unknown"
    risk_level: str = "unknown"  # low, medium, high, unknown
    risk_flags: list[RiskFlag] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    # 额外信息
    possible_signatures: list[str] = field(default_factory=list)
    contract_type: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "selector": self.selector,
            "raw_data": self.raw_data,
            "function_name": self.function_name,
            "function_signature": self.function_signature,
            "inputs": self.inputs,
            "behavior_type": self.behavior_type,
            "risk_level": self.risk_level,
            "risk_flags": [rf.to_dict() if hasattr(rf, 'to_dict') else rf.__dict__ for rf in self.risk_flags],
            "warnings": self.warnings,
            "possible_signatures": self.possible_signatures,
            "contract_type": self.contract_type,
        }


@dataclass
class CalldataContext:
    """Calldata 解码上下文"""
    chain_id: int = 1
    to_address: str | None = None
    from_address: str | None = None
    value: str = "0"  # wei

    def to_dict(self) -> dict[str, Any]:
        return {
            "chain_id": self.chain_id,
            "to_address": self.to_address,
            "from_address": self.from_address,
            "value": self.value,
        }


class CalldataDecoder:
    """Calldata 解码器"""

    def __init__(self, abi_decoder: ABIDecoder, signature_db: Any = None):
        self.abi_decoder = abi_decoder
        self.signature_db = signature_db

    async def decode(
        self,
        calldata: str,
        context: CalldataContext | None = None,
        abi: list[dict[str, Any]] | None = None,
    ) -> DecodedCalldata:
        """
        解码 calldata

        Args:
            calldata: 原始 calldata (0x 开头)
            context: 解码上下文 (链ID, 目标地址等)
            abi: 可选的合约 ABI

        Returns:
            DecodedCalldata: 解码结果
        """
        context = context or CalldataContext()

        # 清理输入
        calldata = calldata.strip()
        if not calldata.startswith("0x"):
            calldata = "0x" + calldata

        # 检查是否为空或太短
        if len(calldata) < 10:
            return DecodedCalldata(
                selector="",
                raw_data=calldata,
                warnings=["Calldata too short - no function selector"],
            )

        selector = calldata[:10].lower()
        result = DecodedCalldata(
            selector=selector,
            raw_data=calldata,
        )

        # 1. 尝试从 ABI 解码
        decoded = None
        if abi:
            decoded = self.abi_decoder.decode_function_input(calldata, abi=abi)

        # 2. 如果没有 ABI，尝试从签名数据库查询
        if not decoded or not decoded.get("name"):
            signatures = await self._lookup_signature(selector)
            if signatures:
                result.possible_signatures = signatures
                # 尝试用第一个签名解码
                decoded = self.abi_decoder.decode_function_input(
                    calldata, signature=signatures[0]
                )

        # 3. 填充解码结果
        if decoded:
            result.function_name = decoded.get("name", "")
            result.function_signature = decoded.get("signature", "")
            result.inputs = decoded.get("inputs", [])

        # 4. 分析行为类型
        result.behavior_type = self._analyze_behavior(selector, result.function_name)

        # 5. 检测风险
        risk_result = self._detect_risks(result, context)
        result.risk_level = risk_result["level"]
        result.risk_flags = risk_result["flags"]
        result.warnings = risk_result["warnings"]

        # 6. 识别合约类型
        result.contract_type = self._identify_contract_type(selector)

        return result

    async def _lookup_signature(self, selector: str) -> list[str]:
        """查询函数签名"""
        # 先检查本地缓存
        if self.signature_db:
            local = self.signature_db.get_local_signature(selector)
            if local:
                return local

            # 远程查询
            try:
                return await self.signature_db.lookup_signature(selector)
            except Exception as e:
                logger.warning("signature_lookup_error", selector=selector, error=str(e))

        return []

    def _analyze_behavior(self, selector: str, function_name: str) -> str:
        """分析交易行为类型"""
        selector = selector.lower()
        name_lower = function_name.lower()

        # 授权类
        if selector == "0x095ea7b3" or "approve" in name_lower:
            return "approve"
        if selector == "0xa22cb465" or "setapprovalforall" in name_lower:
            return "approve"
        if "permit" in name_lower:
            return "approve"

        # 转账类
        if selector in ["0xa9059cbb", "0x23b872dd"]:
            return "transfer"
        if "transfer" in name_lower:
            return "transfer"

        # Swap 类
        if any(x in name_lower for x in ["swap", "exchange"]):
            return "swap"

        # 流动性
        if "addliquidity" in name_lower or "mint" in name_lower:
            return "liquidity_add"
        if "removeliquidity" in name_lower or "burn" in name_lower:
            return "liquidity_remove"

        # 质押
        if "stake" in name_lower or "deposit" in name_lower:
            return "stake"
        if "unstake" in name_lower or "withdraw" in name_lower:
            return "unstake"

        # 借贷
        if "borrow" in name_lower:
            return "borrow"
        if "repay" in name_lower:
            return "repay"
        if "lend" in name_lower or "supply" in name_lower:
            return "lend"

        # 领取
        if "claim" in name_lower:
            return "claim"

        # 包装
        if name_lower in ["deposit", "wrap"]:
            return "wrap"
        if name_lower in ["withdraw", "unwrap"]:
            return "unwrap"

        return "unknown"

    def _detect_risks(
        self,
        decoded: DecodedCalldata,
        context: CalldataContext,
    ) -> dict[str, Any]:
        """检测风险"""
        flags: list[RiskFlag] = []
        warnings: list[str] = []
        level = "low"

        selector = decoded.selector.lower()

        # 检查已知危险函数
        if selector in DANGEROUS_SELECTORS:
            danger_info = DANGEROUS_SELECTORS[selector]
            warnings.append(danger_info["description"])

            if danger_info["risk_level"] == "high":
                level = "high"
                flags.append(RiskFlag(
                    type="dangerous_function",
                    severity="high",
                    evidence=f"Function: {danger_info['name']}",
                    description=danger_info["description"],
                ))
            elif danger_info["risk_level"] == "check_value":
                # 检查授权金额
                level = self._check_approval_amount(decoded, flags, warnings)

        # 检查无限授权 (approve)
        if selector == "0x095ea7b3" and decoded.inputs:
            amount_input = next(
                (inp for inp in decoded.inputs if inp.get("name") in ["value", "amount", "arg1"]),
                None
            )
            if amount_input:
                try:
                    amount = int(amount_input.get("value", "0"))
                    max_uint256 = 2**256 - 1
                    # 如果授权金额超过 90% 的最大值，认为是无限授权
                    if amount >= max_uint256 * 0.9:
                        level = "high"
                        flags.append(RiskFlag(
                            type="unlimited_approve",
                            severity="high",
                            evidence=f"Approved amount: {amount}",
                            description="Unlimited token approval - the spender can transfer all your tokens",
                        ))
                        warnings.append("DANGER: Unlimited token approval detected!")
                except (ValueError, TypeError):
                    pass

        # 检查 setApprovalForAll
        if selector == "0xa22cb465":
            approved_input = next(
                (inp for inp in decoded.inputs if inp.get("name") in ["approved", "_approved", "arg1"]),
                None
            )
            if approved_input and str(approved_input.get("value", "")).lower() in ["true", "1"]:
                level = "high"
                flags.append(RiskFlag(
                    type="nft_unlimited_approval",
                    severity="high",
                    evidence="setApprovalForAll(operator, true)",
                    description="Approving ALL NFTs to an operator",
                ))
                warnings.append("DANGER: This will approve ALL your NFTs!")

        # 检查转账目标地址
        if decoded.behavior_type == "transfer" and decoded.inputs:
            to_input = next(
                (inp for inp in decoded.inputs if inp.get("name") in ["to", "_to", "recipient", "dst"]),
                None
            )
            if to_input:
                to_addr = str(to_input.get("value", "")).lower()
                if to_addr == "0x0000000000000000000000000000000000000000":
                    level = "high"
                    flags.append(RiskFlag(
                        type="zero_address_transfer",
                        severity="high",
                        evidence=f"Transfer to: {to_addr}",
                        description="Transfer to zero address - tokens will be burned/lost",
                    ))
                    warnings.append("DANGER: Transferring to zero address!")

        # 检查原生代币转账金额
        if context.value and context.value != "0":
            try:
                value_wei = int(context.value)
                value_eth = value_wei / 1e18
                if value_eth > 1:
                    warnings.append(f"This transaction sends {value_eth:.4f} native tokens")
                    if value_eth > 10:
                        level = max(level, "medium", key=lambda x: ["low", "medium", "high"].index(x))
                        flags.append(RiskFlag(
                            type="high_value_transfer",
                            severity="medium",
                            evidence=f"Value: {value_eth:.4f} ETH/BNB/MATIC",
                            description="High value native token transfer",
                        ))
            except (ValueError, TypeError):
                pass

        return {
            "level": level,
            "flags": flags,
            "warnings": warnings,
        }

    def _check_approval_amount(
        self,
        decoded: DecodedCalldata,
        flags: list[RiskFlag],
        warnings: list[str],
    ) -> str:
        """检查授权金额"""
        for inp in decoded.inputs:
            if inp.get("type") == "uint256" and inp.get("name") in ["value", "amount", "arg1"]:
                try:
                    amount = int(inp.get("value", "0"))
                    max_uint256 = 2**256 - 1
                    if amount >= max_uint256 * 0.9:
                        flags.append(RiskFlag(
                            type="unlimited_approve",
                            severity="high",
                            evidence=f"Amount: {amount}",
                            description="Unlimited approval",
                        ))
                        warnings.append("Unlimited approval detected")
                        return "high"
                    elif amount > 10**24:  # > 1M tokens (assuming 18 decimals)
                        flags.append(RiskFlag(
                            type="high_value_approve",
                            severity="medium",
                            evidence=f"Amount: {amount}",
                            description="Large approval amount",
                        ))
                        return "medium"
                except (ValueError, TypeError):
                    pass
        return "low"

    def _identify_contract_type(self, selector: str) -> str | None:
        """识别合约类型"""
        selector = selector.lower()

        for contract_type, selectors in KNOWN_CONTRACT_PATTERNS.items():
            if selector in [s.lower() for s in selectors]:
                return contract_type

        return None

    def format_decoded_for_display(self, decoded: DecodedCalldata) -> dict[str, Any]:
        """格式化解码结果用于显示"""
        result = {
            "function": {
                "name": decoded.function_name or "Unknown",
                "selector": decoded.selector,
                "signature": decoded.function_signature,
            },
            "parameters": [],
            "analysis": {
                "behavior": decoded.behavior_type,
                "risk_level": decoded.risk_level,
                "warnings": decoded.warnings,
            },
        }

        # 格式化参数
        for inp in decoded.inputs:
            param = {
                "name": inp.get("name", ""),
                "type": inp.get("type", ""),
                "value": inp.get("value"),
            }

            # 特殊格式化
            if inp.get("type") == "address":
                try:
                    param["value"] = to_checksum_address(inp.get("value", ""))
                    param["display"] = f"{param['value'][:6]}...{param['value'][-4:]}"
                except Exception:
                    pass
            elif inp.get("type") == "uint256":
                try:
                    value = int(inp.get("value", "0"))
                    if value == 2**256 - 1:
                        param["display"] = "Unlimited (MAX_UINT256)"
                    elif value > 10**18:
                        param["display"] = f"{value / 10**18:.4f} (assuming 18 decimals)"
                    else:
                        param["display"] = str(value)
                except (ValueError, TypeError):
                    param["display"] = str(inp.get("value"))

            result["parameters"].append(param)

        return result
