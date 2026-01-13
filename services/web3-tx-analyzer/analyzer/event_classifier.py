from __future__ import annotations

from typing import Any

from .schemas import DecodedEvent


# 事件类型定义
EVENT_TYPES = {
    # ERC-20
    "transfer_erc20": {
        "name": "Transfer",
        "required_args": ["from", "to", "value"],
        "topic": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    },
    "approval_erc20": {
        "name": "Approval",
        "required_args": ["owner", "spender", "value"],
        "topic": "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925",
    },
    # ERC-721 (same Transfer topic but with tokenId instead of value)
    "transfer_erc721": {
        "name": "Transfer",
        "required_args": ["from", "to", "tokenId"],
        "topic": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    },
    # Uniswap V2
    "swap_v2": {
        "name": "Swap",
        "required_args": ["sender", "amount0In", "amount1In", "amount0Out", "amount1Out", "to"],
        "topic": "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822",
    },
    "mint_v2": {
        "name": "Mint",
        "required_args": ["sender", "amount0", "amount1"],
        "topic": "0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f",
    },
    "burn_v2": {
        "name": "Burn",
        "required_args": ["sender", "amount0", "amount1", "to"],
        "topic": "0xdccd412f0b1252819cb1fd330b93224ca42612892bb3f4f789976e6d81936496",
    },
    "sync": {
        "name": "Sync",
        "required_args": ["reserve0", "reserve1"],
        "topic": "0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1",
    },
    # Uniswap V3
    "swap_v3": {
        "name": "Swap",
        "required_args": ["sender", "recipient", "amount0", "amount1", "sqrtPriceX96", "liquidity", "tick"],
        "topic": "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
    },
    # WETH
    "deposit": {
        "name": "Deposit",
        "required_args": ["dst", "wad"],
        "topic": "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c",
    },
    "withdrawal": {
        "name": "Withdrawal",
        "required_args": ["src", "wad"],
        "topic": "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65",
    },
}


class EventClassifier:
    """事件分类器"""

    def classify_event(self, decoded_event: dict[str, Any], topics: list[str]) -> DecodedEvent:
        """分类单个事件"""
        name = decoded_event.get("name", "")
        args = decoded_event.get("args", {})
        address = decoded_event.get("address", "")
        log_index = decoded_event.get("log_index", 0)

        # 确定事件类型
        event_type = self._determine_event_type(name, args, topics)

        return DecodedEvent(
            name=name,
            address=address,
            log_index=log_index,
            topics=topics,
            args=args,
            event_type=event_type,
        )

    def classify_events(
        self,
        logs: list[dict[str, Any]],
        decoded_events: list[dict[str, Any]],
    ) -> list[DecodedEvent]:
        """分类多个事件"""
        result = []

        for i, decoded in enumerate(decoded_events):
            log = logs[i] if i < len(logs) else {}
            topics = log.get("topics", [])
            address = log.get("address", "")
            log_index = log.get("logIndex", i)

            # 将 log 信息合并到 decoded
            decoded["address"] = address
            decoded["log_index"] = int(log_index, 16) if isinstance(log_index, str) else log_index

            event = self.classify_event(decoded, topics)
            result.append(event)

        return result

    def _determine_event_type(
        self,
        name: str,
        args: dict[str, Any],
        topics: list[str],
    ) -> str:
        """确定事件类型"""
        if not topics:
            return "unknown"

        topic0 = topics[0].lower()

        # 根据 topic0 匹配
        for event_type, definition in EVENT_TYPES.items():
            if definition["topic"] == topic0:
                # 验证必需参数
                required = definition["required_args"]
                if all(arg in args for arg in required):
                    return event_type

        # 特殊处理：区分 ERC-20 和 ERC-721 Transfer
        if name == "Transfer" and topic0 == "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef":
            if "tokenId" in args:
                return "transfer_erc721"
            elif "value" in args:
                return "transfer_erc20"

        # 根据事件名匹配
        if name == "Transfer":
            if "tokenId" in args:
                return "transfer_erc721"
            return "transfer_erc20"
        elif name == "Approval":
            if "tokenId" in args:
                return "approval_erc721"
            return "approval_erc20"
        elif name == "Swap":
            if "sqrtPriceX96" in args:
                return "swap_v3"
            return "swap_v2"
        elif name == "Mint":
            return "mint_v2"
        elif name == "Burn":
            return "burn_v2"
        elif name == "Sync":
            return "sync"
        elif name == "Deposit":
            return "deposit"
        elif name == "Withdrawal":
            return "withdrawal"

        return "unknown"

    def get_transfers(self, events: list[DecodedEvent]) -> list[DecodedEvent]:
        """获取所有转账事件"""
        return [e for e in events if e.event_type in ("transfer_erc20", "transfer_erc721")]

    def get_approvals(self, events: list[DecodedEvent]) -> list[DecodedEvent]:
        """获取所有授权事件"""
        return [e for e in events if e.event_type in ("approval_erc20", "approval_erc721")]

    def get_swaps(self, events: list[DecodedEvent]) -> list[DecodedEvent]:
        """获取所有 Swap 事件"""
        return [e for e in events if e.event_type in ("swap_v2", "swap_v3")]

    def get_liquidity_events(self, events: list[DecodedEvent]) -> list[DecodedEvent]:
        """获取所有流动性事件"""
        return [e for e in events if e.event_type in ("mint_v2", "burn_v2")]

    def get_wrap_events(self, events: list[DecodedEvent]) -> list[DecodedEvent]:
        """获取所有 WETH wrap/unwrap 事件"""
        return [e for e in events if e.event_type in ("deposit", "withdrawal")]
