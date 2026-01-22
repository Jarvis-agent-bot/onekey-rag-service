"""
Calldata 解码模块

支持解码未签名/未发送交易的 calldata 数据

ABI 获取优先级:
1. 用户提供的 ABI
2. Etherscan API (链上验证)
3. 4bytes 签名数据库 (函数签名)

注意: 协议识别、行为分析、风险评估等功能由 RAG 服务负责
"""
from __future__ import annotations

from typing import Any
from dataclasses import dataclass, field

from eth_utils import to_checksum_address

from app_logging import get_logger, Tracer
from .abi_decoder import ABIDecoder

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


@dataclass
class DecodedCalldata:
    """解码后的 calldata 结果 - 仅包含基础解析信息"""
    # 基础信息
    selector: str
    raw_data: str

    # 解码信息
    function_name: str = ""
    function_signature: str = ""
    inputs: list[dict[str, Any]] = field(default_factory=list)

    # ABI 来源
    abi_source: str = "unknown"  # user_provided, etherscan, 4bytes, none

    # 解码置信度 - 当使用 4bytes 且有多个候选时
    decode_confidence: str = "high"  # high, medium, low
    possible_signatures: list[str] = field(default_factory=list)
    alternate_decodes: list[dict[str, Any]] = field(default_factory=list)
    abi_fragment: dict[str, Any] | None = None

    # 警告信息
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "selector": self.selector,
            "raw_data": self.raw_data,
            "function_name": self.function_name,
            "function_signature": self.function_signature,
            "inputs": self.inputs,
            "abi_source": self.abi_source,
            "decode_confidence": self.decode_confidence,
            "possible_signatures": self.possible_signatures,
            "alternate_decodes": self.alternate_decodes,
            "abi_fragment": self.abi_fragment,
            "warnings": self.warnings,
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
    """Calldata 解码器 - 仅负责基础解析"""

    def __init__(
        self,
        abi_decoder: ABIDecoder,
        signature_db: Any = None,
        etherscan_client_factory: Any = None,  # Callable[[int], EtherscanClient]
    ):
        self.abi_decoder = abi_decoder
        self.signature_db = signature_db
        self.etherscan_client_factory = etherscan_client_factory

    async def decode(
        self,
        calldata: str,
        context: CalldataContext | None = None,
        abi: list[dict[str, Any]] | None = None,
        tracer: Tracer | None = None,
    ) -> DecodedCalldata:
        """
        解码 calldata - 仅做基础解析

        ABI 获取优先级:
        1. 用户提供的 ABI
        2. Etherscan API (链上验证)
        3. 4bytes 签名数据库 (函数签名)

        Args:
            calldata: 原始 calldata (0x 开头)
            context: 解码上下文 (链ID, 目标地址等)
            abi: 可选的合约 ABI
            tracer: 可选的追踪器

        Returns:
            DecodedCalldata: 基础解码结果
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

        # 2. 尝试从 Etherscan 获取 ABI
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
                                result.abi_fragment = self.abi_decoder.find_function_abi(selector, etherscan_abi)
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

        # 3. 如果还没解码成功，尝试从签名数据库查询
        if not decoded or not decoded.get("name"):
            with tracer.step("signature_lookup", {"selector": selector}) as step:
                signatures = await self._lookup_signature(selector)
                if signatures:
                    result.possible_signatures = signatures

                    # 智能签名匹配
                    best_match = self._find_best_signature_match(calldata, signatures)

                    if best_match:
                        decoded = best_match["decoded"]
                        abi_source = "4bytes"
                        result.decode_confidence = best_match["confidence"]

                        if best_match["valid_count"] > 1:
                            result.warnings.append(
                                f"Selector collision: {best_match['valid_count']} possible functions. "
                                f"Using '{decoded.get('name')}'. Others: {', '.join(best_match['other_names'][:3])}"
                            )
                            result.alternate_decodes = [
                                {"name": name} for name in best_match["other_names"][:5]
                            ]

                        step.set_output({
                            "success": True,
                            "function": decoded.get("name"),
                            "candidates_count": len(signatures),
                            "valid_matches": best_match["valid_count"],
                            "confidence": best_match["confidence"],
                        })
                    else:
                        step.set_output({"success": False, "candidates_count": len(signatures)})
                else:
                    step.set_output({"success": False, "candidates_count": 0})

        result.abi_source = abi_source

        # 填充解码结果
        if decoded:
            result.function_name = decoded.get("name", "")
            result.function_signature = decoded.get("signature", "")
            result.inputs = decoded.get("inputs", [])

        return result

    def _find_best_signature_match(
        self,
        calldata: str,
        signatures: list[str],
    ) -> dict[str, Any] | None:
        """智能签名匹配"""
        valid_matches: list[tuple[dict, str, int]] = []

        # 常见协议函数优先级
        HIGH_PRIORITY_FUNCTIONS = {
            "withdraw": 10, "supply": 10, "borrow": 10, "repay": 10, "deposit": 8,
            "transfer": 10, "approve": 10, "transferFrom": 10,
            "swapExactTokensForTokens": 7, "swapExactETHForTokens": 7,
            "addLiquidity": 7, "removeLiquidity": 5,
        }

        for sig in signatures:
            try:
                decoded = self.abi_decoder.decode_function_input(calldata, signature=sig)
                if decoded and decoded.get("name"):
                    func_name = decoded.get("name", "")
                    inputs = decoded.get("inputs", [])

                    # 参数越少越好
                    param_score = max(0, 20 - len(inputs) * 2)
                    priority_score = HIGH_PRIORITY_FUNCTIONS.get(func_name, 0)

                    if "WithPermit" in func_name or "permit" in func_name.lower():
                        priority_score -= 5

                    total_score = param_score + priority_score
                    valid_matches.append((decoded, sig, total_score))
            except Exception:
                continue

        if not valid_matches:
            return None

        valid_matches.sort(key=lambda x: x[2], reverse=True)
        best_decoded, best_sig, best_score = valid_matches[0]

        if len(valid_matches) == 1:
            confidence = "high"
        elif best_score > valid_matches[1][2] + 5:
            confidence = "medium"
        else:
            confidence = "low"

        return {
            "decoded": best_decoded,
            "signature": best_sig,
            "valid_count": len(valid_matches),
            "confidence": confidence,
            "other_names": [m[0].get("name", "") for m in valid_matches[1:]],
        }

    async def _lookup_signature(self, selector: str) -> list[str]:
        """查询函数签名"""
        if self.signature_db:
            local = self.signature_db.get_local_signature(selector)
            if local:
                return local

            try:
                return await self.signature_db.lookup_signature(selector)
            except Exception as e:
                logger.warning("signature_lookup_error", selector=selector, error=str(e))

        return []

    def format_decoded_for_display(self, decoded: DecodedCalldata) -> dict[str, Any]:
        """格式化解码结果用于显示"""
        result = {
            "function": {
                "name": decoded.function_name or "Unknown",
                "selector": decoded.selector,
                "signature": decoded.function_signature,
            },
            "parameters": [],
            "abi_source": decoded.abi_source,
            "decode_confidence": decoded.decode_confidence,
            "warnings": decoded.warnings,
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
