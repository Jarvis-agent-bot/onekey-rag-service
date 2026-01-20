"""
Calldata 解码模块

支持解码未签名/未发送交易的 calldata 数据

ABI 获取优先级:
1. 用户提供的 ABI
2. 本地合约注册表 (已知协议)
3. Etherscan API (链上验证)
4. 4bytes 签名数据库 (函数签名)
"""
from __future__ import annotations

from typing import Any
from dataclasses import dataclass, field

from eth_utils import to_checksum_address

from app_logging import get_logger, Tracer
from .abi_decoder import ABIDecoder
from .schemas import RiskFlag
from .asset_predictor import AssetPredictor, AssetChange, get_asset_predictor
from integrations.contract_registry import ContractRegistry, ContractInfo, get_contract_registry
from integrations.token_service import get_token_service

logger = get_logger(__name__)


class _NoOpTracerContext:
    """No-op tracer context for when tracer is not provided"""
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False
    def set_output(self, output: dict):
        pass


class _NoOpTracer:
    """No-op tracer for when tracer is not provided"""
    def step(self, name: str, input_data: dict | None = None, metadata: dict | None = None):
        return _NoOpTracerContext()


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
class ProtocolInfo:
    """协议信息"""
    protocol: str
    name: str
    type: str
    website: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "protocol": self.protocol,
            "name": self.name,
            "type": self.type,
            "website": self.website,
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

    # 协议信息 (新增)
    protocol_info: ProtocolInfo | None = None

    # 资产变化预测 (新增)
    asset_changes: list[AssetChange] = field(default_factory=list)

    # ABI 来源 (新增)
    abi_source: str = "unknown"  # user_provided, local_registry, etherscan, 4bytes, none

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
            "protocol_info": self.protocol_info.to_dict() if self.protocol_info else None,
            "asset_changes": [ac.to_dict() for ac in self.asset_changes],
            "abi_source": self.abi_source,
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

    def __init__(
        self,
        abi_decoder: ABIDecoder,
        signature_db: Any = None,
        etherscan_client_factory: Any = None,  # Callable[[int], EtherscanClient] - chain_id -> client
        contract_registry: ContractRegistry | None = None,
        asset_predictor: AssetPredictor | None = None,
    ):
        self.abi_decoder = abi_decoder
        self.signature_db = signature_db
        self.etherscan_client_factory = etherscan_client_factory  # 根据 chain_id 创建 client
        self.contract_registry = contract_registry or get_contract_registry()
        self.asset_predictor = asset_predictor or get_asset_predictor()
        self.token_service = get_token_service()

    async def decode(
        self,
        calldata: str,
        context: CalldataContext | None = None,
        abi: list[dict[str, Any]] | None = None,
        tracer: Tracer | None = None,
    ) -> DecodedCalldata:
        """
        解码 calldata

        ABI 获取优先级:
        1. 用户提供的 ABI
        2. 本地合约注册表 (已知协议)
        3. Etherscan API (链上验证)
        4. 4bytes 签名数据库 (函数签名)

        Args:
            calldata: 原始 calldata (0x 开头)
            context: 解码上下文 (链ID, 目标地址等)
            abi: 可选的合约 ABI
            tracer: 可选的追踪器，用于记录解码步骤

        Returns:
            DecodedCalldata: 解码结果
        """
        context = context or CalldataContext()
        tracer = tracer or _NoOpTracer()

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

        # 0. 识别合约 (如果有目标地址)
        contract_info: ContractInfo | None = None
        if context.to_address:
            with tracer.step("identify_contract", {"address": context.to_address, "chain_id": context.chain_id}) as step:
                contract_info = self.contract_registry.identify_contract(
                    context.chain_id, context.to_address
                )
                if contract_info:
                    result.protocol_info = ProtocolInfo(
                        protocol=contract_info.protocol,
                        name=contract_info.name,
                        type=contract_info.type,
                        website=contract_info.website,
                    )
                    result.contract_type = contract_info.type
                    step.set_output({
                        "found": True,
                        "protocol": contract_info.protocol,
                        "name": contract_info.name,
                        "type": contract_info.type,
                    })
                    logger.debug(
                        "contract_identified",
                        address=context.to_address,
                        protocol=contract_info.protocol,
                        name=contract_info.name,
                    )
                else:
                    step.set_output({"found": False})

        # ABI 获取和解码流程
        decoded = None
        abi_source = "none"

        # 1. 尝试用用户提供的 ABI 解码
        if abi:
            with tracer.step("user_abi_decode", {"has_abi": True}) as step:
                decoded = self.abi_decoder.decode_function_input(calldata, abi=abi)
                if decoded and decoded.get("name"):
                    abi_source = "user_provided"
                    step.set_output({"success": True, "function": decoded.get("name")})
                    logger.debug("decoded_with_user_abi", function=decoded.get("name"))
                else:
                    step.set_output({"success": False})

        # 2. 尝试从本地合约注册表获取 ABI
        if (not decoded or not decoded.get("name")) and contract_info:
            with tracer.step("local_abi_lookup", {"protocol": contract_info.protocol, "name": contract_info.name}) as step:
                local_abi = self.contract_registry.get_local_abi(contract_info)
                if local_abi:
                    decoded = self.abi_decoder.decode_function_input(calldata, abi=local_abi)
                    if decoded and decoded.get("name"):
                        abi_source = "local_registry"
                        step.set_output({"success": True, "function": decoded.get("name"), "protocol": contract_info.protocol})
                        logger.debug(
                            "decoded_with_local_abi",
                            function=decoded.get("name"),
                            protocol=contract_info.protocol,
                        )
                    else:
                        step.set_output({"success": False, "reason": "decode_failed"})
                else:
                    step.set_output({"success": False, "reason": "no_local_abi"})

        # 3. 尝试从 Etherscan 获取 ABI
        if (not decoded or not decoded.get("name")) and self.etherscan_client_factory and context.to_address:
            with tracer.step("etherscan_abi_lookup", {"address": context.to_address, "chain_id": context.chain_id}) as step:
                try:
                    etherscan_client = self.etherscan_client_factory(context.chain_id)
                    if etherscan_client:
                        etherscan_abi = await etherscan_client.get_abi(context.to_address)
                        if etherscan_abi:
                            decoded = self.abi_decoder.decode_function_input(calldata, abi=etherscan_abi)
                            if decoded and decoded.get("name"):
                                abi_source = "etherscan"
                                step.set_output({"success": True, "function": decoded.get("name")})
                                logger.debug(
                                    "decoded_with_etherscan_abi",
                                    function=decoded.get("name"),
                                    address=context.to_address,
                                )
                            else:
                                step.set_output({"success": False, "reason": "decode_failed", "has_abi": True})
                        else:
                            step.set_output({"success": False, "reason": "no_abi_found"})
                    else:
                        step.set_output({"success": False, "reason": "no_client"})
                except Exception as e:
                    step.set_output({"success": False, "error": str(e)})
                    logger.warning("etherscan_abi_error", error=str(e), address=context.to_address)

        # 4. 如果还没解码成功，尝试从签名数据库查询
        if not decoded or not decoded.get("name"):
            with tracer.step("signature_lookup", {"selector": selector}) as step:
                signatures = await self._lookup_signature(selector)
                if signatures:
                    result.possible_signatures = signatures
                    # 尝试用第一个签名解码
                    decoded = self.abi_decoder.decode_function_input(
                        calldata, signature=signatures[0]
                    )
                    if decoded and decoded.get("name"):
                        abi_source = "4bytes"
                        step.set_output({
                            "success": True,
                            "function": decoded.get("name"),
                            "candidates_count": len(signatures),
                        })
                        logger.debug(
                            "decoded_with_4bytes",
                            function=decoded.get("name"),
                            selector=selector,
                        )
                    else:
                        step.set_output({"success": False, "candidates_count": len(signatures), "reason": "decode_failed"})
                else:
                    step.set_output({"success": False, "candidates_count": 0, "reason": "no_signatures_found"})

        result.abi_source = abi_source

        # 3. 填充解码结果
        if decoded:
            result.function_name = decoded.get("name", "")
            result.function_signature = decoded.get("signature", "")
            result.inputs = decoded.get("inputs", [])

        # 4. 分析行为类型 - 优先使用资产预测器的结果
        # 5. 预测资产变化
        if result.function_name:
            with tracer.step("predict_assets", {"function": result.function_name, "protocol": contract_info.protocol if contract_info else None}) as step:
                params = self._inputs_to_params(result.inputs)
                asset_changes, predicted_behavior = self.asset_predictor.predict(
                    contract_info=contract_info,
                    function_name=result.function_name,
                    params=params,
                    chain_id=context.chain_id,
                    value=context.value,
                    to_address=context.to_address,
                )
                result.asset_changes = asset_changes
                if predicted_behavior != "unknown":
                    result.behavior_type = predicted_behavior
                else:
                    result.behavior_type = self._analyze_behavior(selector, result.function_name)
                step.set_output({
                    "behavior_type": result.behavior_type,
                    "asset_changes_count": len(asset_changes),
                    "pay_count": len([a for a in asset_changes if a.direction == "out"]),
                    "receive_count": len([a for a in asset_changes if a.direction == "in"]),
                })
        else:
            result.behavior_type = self._analyze_behavior(selector, result.function_name)

        # 6. 检测风险
        risk_result = self._detect_risks(result, context)
        result.risk_level = risk_result["level"]
        result.risk_flags = risk_result["flags"]
        result.warnings = risk_result["warnings"]

        # 7. 如果没有通过合约识别获得类型，尝试通过选择器识别
        if not result.contract_type:
            result.contract_type = self._identify_contract_type(selector)

        return result

    def _inputs_to_params(self, inputs: list[dict[str, Any]]) -> dict[str, Any]:
        """将 inputs 列表转换为参数字典"""
        params = {}
        for inp in inputs:
            name = inp.get("name", "")
            value = inp.get("value")
            if name:
                params[name] = value
            # 也支持 argN 格式
            elif "arg" in str(name).lower():
                params[name] = value
        return params

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
            "abi_source": decoded.abi_source,
        }

        # 添加协议信息
        if decoded.protocol_info:
            result["protocol"] = decoded.protocol_info.to_dict()

        # 添加资产变化
        if decoded.asset_changes:
            result["asset_changes"] = {
                "pay": [],
                "receive": [],
            }
            for change in decoded.asset_changes:
                change_info = {
                    "token": change.token_symbol,
                    "name": change.token_name,
                    "amount": change.amount_formatted,
                    "address": change.token_address,
                    "type": change.token_type,
                }
                if change.direction == "out":
                    result["asset_changes"]["pay"].append(change_info)
                else:
                    result["asset_changes"]["receive"].append(change_info)

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
                    # 尝试获取地址的名称
                    token_info = self.token_service.get_token_info(1, param["value"])
                    if token_info:
                        param["display"] = f"{token_info.symbol} ({param['value'][:6]}...{param['value'][-4:]})"
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
