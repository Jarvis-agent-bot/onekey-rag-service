from __future__ import annotations

import re
from typing import Any

from eth_abi import decode as abi_decode
from eth_abi.exceptions import DecodingError
from eth_utils import decode_hex, to_checksum_address

from app_logging import get_logger

logger = get_logger(__name__)


class ABIDecoder:
    """ABI 解码器"""

    # 常用 ERC-20/721 ABI（用于无 ABI 时的基础解码）
    STANDARD_ABIS: dict[str, dict[str, Any]] = {
        # ERC-20 Transfer
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": {
            "name": "Transfer",
            "inputs": [
                {"indexed": True, "name": "from", "type": "address"},
                {"indexed": True, "name": "to", "type": "address"},
                {"indexed": False, "name": "value", "type": "uint256"},
            ],
        },
        # ERC-20 Approval
        "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": {
            "name": "Approval",
            "inputs": [
                {"indexed": True, "name": "owner", "type": "address"},
                {"indexed": True, "name": "spender", "type": "address"},
                {"indexed": False, "name": "value", "type": "uint256"},
            ],
        },
        # Uniswap V2 Swap
        "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822": {
            "name": "Swap",
            "inputs": [
                {"indexed": True, "name": "sender", "type": "address"},
                {"indexed": False, "name": "amount0In", "type": "uint256"},
                {"indexed": False, "name": "amount1In", "type": "uint256"},
                {"indexed": False, "name": "amount0Out", "type": "uint256"},
                {"indexed": False, "name": "amount1Out", "type": "uint256"},
                {"indexed": True, "name": "to", "type": "address"},
            ],
        },
        # Uniswap V2 Mint
        "0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f": {
            "name": "Mint",
            "inputs": [
                {"indexed": True, "name": "sender", "type": "address"},
                {"indexed": False, "name": "amount0", "type": "uint256"},
                {"indexed": False, "name": "amount1", "type": "uint256"},
            ],
        },
        # Uniswap V2 Burn
        "0xdccd412f0b1252819cb1fd330b93224ca42612892bb3f4f789976e6d81936496": {
            "name": "Burn",
            "inputs": [
                {"indexed": True, "name": "sender", "type": "address"},
                {"indexed": False, "name": "amount0", "type": "uint256"},
                {"indexed": False, "name": "amount1", "type": "uint256"},
                {"indexed": True, "name": "to", "type": "address"},
            ],
        },
        # Uniswap V2 Sync
        "0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1": {
            "name": "Sync",
            "inputs": [
                {"indexed": False, "name": "reserve0", "type": "uint112"},
                {"indexed": False, "name": "reserve1", "type": "uint112"},
            ],
        },
        # WETH Deposit
        "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c": {
            "name": "Deposit",
            "inputs": [
                {"indexed": True, "name": "dst", "type": "address"},
                {"indexed": False, "name": "wad", "type": "uint256"},
            ],
        },
        # WETH Withdrawal
        "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65": {
            "name": "Withdrawal",
            "inputs": [
                {"indexed": True, "name": "src", "type": "address"},
                {"indexed": False, "name": "wad", "type": "uint256"},
            ],
        },
        # Uniswap V3 Swap
        "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67": {
            "name": "Swap",
            "inputs": [
                {"indexed": True, "name": "sender", "type": "address"},
                {"indexed": True, "name": "recipient", "type": "address"},
                {"indexed": False, "name": "amount0", "type": "int256"},
                {"indexed": False, "name": "amount1", "type": "int256"},
                {"indexed": False, "name": "sqrtPriceX96", "type": "uint160"},
                {"indexed": False, "name": "liquidity", "type": "uint128"},
                {"indexed": False, "name": "tick", "type": "int24"},
            ],
        },
    }

    def __init__(self):
        self._abi_cache: dict[str, list[dict[str, Any]]] = {}

    def set_abi(self, contract_address: str, abi: list[dict[str, Any]]) -> None:
        """设置合约 ABI"""
        self._abi_cache[contract_address.lower()] = abi

    def get_abi(self, contract_address: str) -> list[dict[str, Any]] | None:
        """获取合约 ABI"""
        return self._abi_cache.get(contract_address.lower())

    def decode_function_input(
        self,
        input_data: str,
        abi: list[dict[str, Any]] | None = None,
        signature: str | None = None,
    ) -> dict[str, Any] | None:
        """解码函数输入"""
        if not input_data or input_data == "0x" or len(input_data) < 10:
            return None

        selector = input_data[:10].lower()
        data = input_data[10:]

        # 如果有 ABI，尝试从 ABI 解码
        if abi:
            for item in abi:
                if item.get("type") != "function":
                    continue

                func_selector = self._get_function_selector(item)
                if func_selector == selector:
                    try:
                        decoded = self._decode_with_abi(data, item.get("inputs", []))
                        return {
                            "name": item.get("name", ""),
                            "selector": selector,
                            "signature": self._format_signature(item),
                            "inputs": decoded,
                        }
                    except Exception as e:
                        logger.warning("decode_function_error", selector=selector, error=str(e))

        # 如果有签名，尝试从签名解码
        if signature:
            try:
                decoded = self._decode_from_signature(data, signature)
                name = signature.split("(")[0] if "(" in signature else signature
                return {
                    "name": name,
                    "selector": selector,
                    "signature": signature,
                    "inputs": decoded,
                }
            except Exception as e:
                logger.warning("decode_from_signature_error", signature=signature, error=str(e))

        return {
            "name": "",
            "selector": selector,
            "signature": "",
            "inputs": [],
        }

    def decode_log(
        self,
        log: dict[str, Any],
        abi: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any] | None:
        """解码事件日志"""
        topics = log.get("topics", [])
        if not topics:
            return None

        topic0 = topics[0].lower() if topics else ""
        data = log.get("data", "0x")

        # 先尝试标准 ABI
        if topic0 in self.STANDARD_ABIS:
            event_def = self.STANDARD_ABIS[topic0]
            try:
                decoded = self._decode_event_with_def(topics, data, event_def)
                return {
                    "name": event_def["name"],
                    "args": decoded,
                }
            except Exception as e:
                logger.warning("decode_standard_event_error", topic=topic0, error=str(e))

        # 尝试从 ABI 解码
        if abi:
            for item in abi:
                if item.get("type") != "event":
                    continue

                event_topic = self._get_event_topic(item)
                if event_topic == topic0:
                    try:
                        decoded = self._decode_event_with_def(topics, data, item)
                        return {
                            "name": item.get("name", ""),
                            "args": decoded,
                        }
                    except Exception as e:
                        logger.warning("decode_event_error", topic=topic0, error=str(e))

        return {
            "name": "",
            "args": {},
            "raw_topics": topics,
            "raw_data": data,
        }

    def _get_function_selector(self, func_def: dict[str, Any]) -> str:
        """计算函数选择器"""
        from eth_utils import keccak

        signature = self._format_signature(func_def)
        return "0x" + keccak(text=signature).hex()[:8]

    def _get_event_topic(self, event_def: dict[str, Any]) -> str:
        """计算事件 topic"""
        from eth_utils import keccak

        signature = self._format_signature(event_def)
        return "0x" + keccak(text=signature).hex()

    def _format_signature(self, def_: dict[str, Any]) -> str:
        """格式化函数/事件签名"""
        name = def_.get("name", "")
        inputs = def_.get("inputs", [])
        types = [self._format_type(inp.get("type", "")) for inp in inputs]
        return f"{name}({','.join(types)})"

    def _format_type(self, type_str: str) -> str:
        """格式化类型字符串"""
        # 处理 tuple 类型
        if type_str.startswith("tuple"):
            return type_str
        return type_str

    def _decode_with_abi(self, data: str, inputs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """使用 ABI 定义解码数据"""
        if not data or data == "0x":
            return []

        types = [inp.get("type", "") for inp in inputs]
        names = [inp.get("name", f"arg{i}") for i, inp in enumerate(inputs)]

        try:
            data_bytes = decode_hex(data) if data.startswith("0x") else decode_hex("0x" + data)
            decoded = abi_decode(types, data_bytes)

            result = []
            for i, value in enumerate(decoded):
                result.append({
                    "name": names[i],
                    "type": types[i],
                    "value": self._format_value(value, types[i]),
                })
            return result
        except DecodingError:
            return []

    def _decode_from_signature(self, data: str, signature: str) -> list[dict[str, Any]]:
        """从签名解码数据"""
        # 提取参数类型
        match = re.match(r"(\w+)\((.*)\)", signature)
        if not match:
            return []

        types_str = match.group(2)
        if not types_str:
            return []

        types = self._parse_types(types_str)

        try:
            data_bytes = decode_hex(data) if data.startswith("0x") else decode_hex("0x" + data)
            decoded = abi_decode(types, data_bytes)

            result = []
            for i, value in enumerate(decoded):
                result.append({
                    "name": f"arg{i}",
                    "type": types[i],
                    "value": self._format_value(value, types[i]),
                })
            return result
        except DecodingError:
            return []

    def _parse_types(self, types_str: str) -> list[str]:
        """解析类型字符串"""
        types = []
        depth = 0
        current = ""

        for char in types_str:
            if char == "(":
                depth += 1
                current += char
            elif char == ")":
                depth -= 1
                current += char
            elif char == "," and depth == 0:
                if current.strip():
                    types.append(current.strip())
                current = ""
            else:
                current += char

        if current.strip():
            types.append(current.strip())

        return types

    def _decode_event_with_def(
        self,
        topics: list[str],
        data: str,
        event_def: dict[str, Any],
    ) -> dict[str, Any]:
        """使用事件定义解码"""
        inputs = event_def.get("inputs", [])
        result = {}

        indexed_inputs = [inp for inp in inputs if inp.get("indexed")]
        non_indexed_inputs = [inp for inp in inputs if not inp.get("indexed")]

        # 解码 indexed 参数（从 topics[1:] 开始）
        for i, inp in enumerate(indexed_inputs):
            if i + 1 < len(topics):
                topic = topics[i + 1]
                name = inp.get("name", f"indexed_{i}")
                type_ = inp.get("type", "")

                if type_ == "address":
                    result[name] = to_checksum_address("0x" + topic[-40:])
                elif type_.startswith("uint") or type_.startswith("int"):
                    result[name] = str(int(topic, 16))
                else:
                    result[name] = topic

        # 解码非 indexed 参数
        if non_indexed_inputs and data and data != "0x":
            types = [inp.get("type", "") for inp in non_indexed_inputs]
            names = [inp.get("name", f"arg{i}") for i, inp in enumerate(non_indexed_inputs)]

            try:
                data_bytes = decode_hex(data)
                decoded = abi_decode(types, data_bytes)

                for i, value in enumerate(decoded):
                    result[names[i]] = self._format_value(value, types[i])
            except DecodingError:
                result["raw_data"] = data

        return result

    def _format_value(self, value: Any, type_: str) -> Any:
        """格式化解码后的值"""
        if isinstance(value, bytes):
            return "0x" + value.hex()
        elif isinstance(value, int):
            if type_ == "address" or "address" in type_:
                try:
                    return to_checksum_address(hex(value))
                except Exception:
                    return str(value)
            return str(value)
        elif isinstance(value, tuple):
            return [self._format_value(v, "") for v in value]
        elif isinstance(value, list):
            return [self._format_value(v, "") for v in value]
        return value
