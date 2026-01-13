from __future__ import annotations

from typing import Any

from .schemas import BehaviorResult, DecodedEvent, DecodedMethod


def _parse_int_value(value: str | int | None) -> int:
    """安全解析可能是十六进制或十进制的值"""
    if value is None:
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        value = value.strip()
        if value.startswith("0x") or value.startswith("0X"):
            return int(value, 16)
        if value == "":
            return 0
        return int(value)
    return 0


# 已知的 DEX Router 合约地址
KNOWN_DEX_ROUTERS = {
    # Uniswap V2 Router
    "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "uniswap_v2",
    # Uniswap V3 Router
    "0xe592427a0aece92de3edee1f18e0157c05861564": "uniswap_v3",
    "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "uniswap_v3",  # SwapRouter02
    # SushiSwap
    "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f": "sushiswap",
    # PancakeSwap (BSC)
    "0x10ed43c718714eb63d5aa57b78b54704e256024e": "pancakeswap",
    # 1inch
    "0x1111111254fb6c44bac0bed2854e76f90643097d": "1inch",
    "0x1111111254eeb25477b68fb85ed929f73a960582": "1inch_v5",
}

# Swap 相关方法选择器
SWAP_SELECTORS = {
    "0x38ed1739": "swapExactTokensForTokens",
    "0x8803dbee": "swapTokensForExactTokens",
    "0x7ff36ab5": "swapExactETHForTokens",
    "0x4a25d94a": "swapTokensForExactETH",
    "0x18cbafe5": "swapExactTokensForETH",
    "0xfb3bdb41": "swapETHForExactTokens",
    "0x414bf389": "exactInputSingle",
    "0xc04b8d59": "exactInput",
    "0xdb3e2198": "exactOutputSingle",
    "0xf28c0498": "exactOutput",
}

# 流动性相关方法选择器
LIQUIDITY_SELECTORS = {
    "0xe8e33700": "addLiquidity",
    "0xf305d719": "addLiquidityETH",
    "0xbaa2abde": "removeLiquidity",
    "0x02751cec": "removeLiquidityETH",
}

# Approve 相关方法选择器
APPROVE_SELECTORS = {
    "0x095ea7b3": "approve",
    "0xa22cb465": "setApprovalForAll",
}


class BehaviorAnalyzer:
    """行为分析器"""

    def analyze(
        self,
        method: DecodedMethod | None,
        events: list[DecodedEvent],
        to_address: str | None,
        value: str,
        input_data: str,
    ) -> BehaviorResult:
        """分析交易行为"""
        evidence: list[str] = []
        details: dict[str, Any] = {}

        # 1. 检查是否是 Swap
        swap_result = self._check_swap(method, events, to_address)
        if swap_result:
            return swap_result

        # 2. 检查是否是流动性操作
        liquidity_result = self._check_liquidity(method, events)
        if liquidity_result:
            return liquidity_result

        # 3. 检查是否是 Wrap/Unwrap
        wrap_result = self._check_wrap(method, events)
        if wrap_result:
            return wrap_result

        # 4. 检查是否是授权
        approve_result = self._check_approve(method, events)
        if approve_result:
            return approve_result

        # 5. 检查是否是转账
        transfer_result = self._check_transfer(method, events, value)
        if transfer_result:
            return transfer_result

        # 6. 未知行为
        return BehaviorResult(
            type="unknown",
            confidence="low",
            evidence=[],
            details={},
        )

    def _check_swap(
        self,
        method: DecodedMethod | None,
        events: list[DecodedEvent],
        to_address: str | None,
    ) -> BehaviorResult | None:
        """检查是否是 Swap 行为"""
        evidence: list[str] = []
        details: dict[str, Any] = {}

        # 检查方法签名
        is_swap_method = False
        if method and method.selector in SWAP_SELECTORS:
            is_swap_method = True
            evidence.append(f"method:{method.name or SWAP_SELECTORS[method.selector]}")

        # 检查目标地址是否是已知 DEX
        is_known_dex = False
        if to_address and to_address.lower() in KNOWN_DEX_ROUTERS:
            is_known_dex = True
            dex_name = KNOWN_DEX_ROUTERS[to_address.lower()]
            evidence.append(f"dex:{dex_name}")
            details["dex"] = dex_name

        # 检查 Swap 事件
        swap_events = [e for e in events if e.event_type in ("swap_v2", "swap_v3")]
        if swap_events:
            evidence.append(f"event:Swap(count={len(swap_events)})")
            details["swap_count"] = len(swap_events)

            # 提取 swap 详情
            for i, swap in enumerate(swap_events):
                args = swap.args
                if swap.event_type == "swap_v2":
                    details[f"swap_{i}"] = {
                        "type": "v2",
                        "pool": swap.address,
                        "amount0In": args.get("amount0In"),
                        "amount1In": args.get("amount1In"),
                        "amount0Out": args.get("amount0Out"),
                        "amount1Out": args.get("amount1Out"),
                    }
                elif swap.event_type == "swap_v3":
                    details[f"swap_{i}"] = {
                        "type": "v3",
                        "pool": swap.address,
                        "amount0": args.get("amount0"),
                        "amount1": args.get("amount1"),
                    }

        # 判断置信度
        if swap_events:
            if is_swap_method or is_known_dex:
                confidence = "high"
            else:
                confidence = "medium"

            return BehaviorResult(
                type="swap",
                confidence=confidence,
                evidence=evidence,
                details=details,
            )

        # 只有方法签名没有事件
        if is_swap_method:
            return BehaviorResult(
                type="swap",
                confidence="medium",
                evidence=evidence,
                details=details,
            )

        return None

    def _check_liquidity(
        self,
        method: DecodedMethod | None,
        events: list[DecodedEvent],
    ) -> BehaviorResult | None:
        """检查是否是流动性操作"""
        evidence: list[str] = []
        details: dict[str, Any] = {}

        # 检查方法签名
        if method and method.selector in LIQUIDITY_SELECTORS:
            method_name = LIQUIDITY_SELECTORS[method.selector]
            evidence.append(f"method:{method_name}")

            if "add" in method_name.lower():
                behavior_type = "liquidity_add"
            else:
                behavior_type = "liquidity_remove"

            # 检查 Mint/Burn 事件
            mint_events = [e for e in events if e.event_type == "mint_v2"]
            burn_events = [e for e in events if e.event_type == "burn_v2"]

            if mint_events:
                evidence.append(f"event:Mint(count={len(mint_events)})")
            if burn_events:
                evidence.append(f"event:Burn(count={len(burn_events)})")

            return BehaviorResult(
                type=behavior_type,
                confidence="high" if (mint_events or burn_events) else "medium",
                evidence=evidence,
                details=details,
            )

        # 只有事件没有方法
        mint_events = [e for e in events if e.event_type == "mint_v2"]
        burn_events = [e for e in events if e.event_type == "burn_v2"]

        if mint_events and not burn_events:
            return BehaviorResult(
                type="liquidity_add",
                confidence="medium",
                evidence=[f"event:Mint(count={len(mint_events)})"],
                details={},
            )

        if burn_events and not mint_events:
            return BehaviorResult(
                type="liquidity_remove",
                confidence="medium",
                evidence=[f"event:Burn(count={len(burn_events)})"],
                details={},
            )

        return None

    def _check_wrap(
        self,
        method: DecodedMethod | None,
        events: list[DecodedEvent],
    ) -> BehaviorResult | None:
        """检查是否是 Wrap/Unwrap 操作"""
        evidence: list[str] = []

        # 检查 Deposit/Withdrawal 事件
        deposit_events = [e for e in events if e.event_type == "deposit"]
        withdrawal_events = [e for e in events if e.event_type == "withdrawal"]

        if deposit_events and not withdrawal_events:
            evidence.append(f"event:Deposit(count={len(deposit_events)})")
            if method and method.selector == "0xd0e30db0":
                evidence.append("method:deposit")

            return BehaviorResult(
                type="wrap",
                confidence="high",
                evidence=evidence,
                details={},
            )

        if withdrawal_events and not deposit_events:
            evidence.append(f"event:Withdrawal(count={len(withdrawal_events)})")
            if method and method.selector == "0x2e1a7d4d":
                evidence.append("method:withdraw")

            return BehaviorResult(
                type="unwrap",
                confidence="high",
                evidence=evidence,
                details={},
            )

        return None

    def _check_approve(
        self,
        method: DecodedMethod | None,
        events: list[DecodedEvent],
    ) -> BehaviorResult | None:
        """检查是否是授权操作"""
        evidence: list[str] = []
        details: dict[str, Any] = {}

        # 检查方法签名
        if method and method.selector in APPROVE_SELECTORS:
            evidence.append(f"method:{APPROVE_SELECTORS[method.selector]}")

            # 检查 Approval 事件
            approval_events = [e for e in events if e.event_type in ("approval_erc20", "approval_erc721")]
            if approval_events:
                evidence.append(f"event:Approval(count={len(approval_events)})")

                # 检查是否是 unlimited approve
                for event in approval_events:
                    value = event.args.get("value", "0")
                    if value and self._is_unlimited_value(value):
                        details["unlimited"] = True
                        break

            return BehaviorResult(
                type="approve",
                confidence="high",
                evidence=evidence,
                details=details,
            )

        return None

    def _check_transfer(
        self,
        method: DecodedMethod | None,
        events: list[DecodedEvent],
        value: str,
    ) -> BehaviorResult | None:
        """检查是否是转账操作"""
        evidence: list[str] = []
        details: dict[str, Any] = {}

        # 检查方法签名
        transfer_selectors = {"0xa9059cbb": "transfer", "0x23b872dd": "transferFrom"}
        if method and method.selector in transfer_selectors:
            evidence.append(f"method:{transfer_selectors[method.selector]}")

        # 检查 Transfer 事件
        transfer_events = [e for e in events if e.event_type in ("transfer_erc20", "transfer_erc721")]
        if transfer_events:
            evidence.append(f"event:Transfer(count={len(transfer_events)})")
            details["transfer_count"] = len(transfer_events)

            # 判断是 ERC20 还是 NFT
            erc20_transfers = [e for e in transfer_events if e.event_type == "transfer_erc20"]
            nft_transfers = [e for e in transfer_events if e.event_type == "transfer_erc721"]

            if nft_transfers and not erc20_transfers:
                return BehaviorResult(
                    type="nft_trade" if len(nft_transfers) > 1 else "transfer",
                    confidence="medium",
                    evidence=evidence,
                    details=details,
                )

        # 检查原生代币转账
        if value and _parse_int_value(value) > 0 and not evidence:
            evidence.append(f"native_transfer:value={value}")

        if evidence:
            return BehaviorResult(
                type="transfer",
                confidence="high" if method else "medium",
                evidence=evidence,
                details=details,
            )

        return None

    def _is_unlimited_value(self, value: str) -> bool:
        """检查是否是 unlimited 授权值"""
        try:
            v = _parse_int_value(value)
            # MAX_UINT256 或接近的值
            max_uint256 = 2**256 - 1
            return v >= max_uint256 * 0.9
        except (ValueError, TypeError):
            return False
