from __future__ import annotations

from typing import Any

from .schemas import BehaviorResult, DecodedEvent, DecodedMethod, RiskFlag


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


# 已知的高风险合约特征
HIGH_RISK_SELECTORS = {
    # setApprovalForAll
    "0xa22cb465": "unlimited_nft_approval",
}

# 最大授权值阈值
MAX_UINT256 = 2**256 - 1
HIGH_VALUE_THRESHOLD = MAX_UINT256 * 0.9


class RiskDetector:
    """风险检测器"""

    def detect(
        self,
        method: DecodedMethod | None,
        events: list[DecodedEvent],
        behavior: BehaviorResult,
        to_address: str | None,
        value: str,
        from_address: str,
    ) -> list[RiskFlag]:
        """检测交易风险"""
        risks: list[RiskFlag] = []

        # 1. 检查 unlimited approve
        unlimited_risk = self._check_unlimited_approve(events)
        if unlimited_risk:
            risks.append(unlimited_risk)

        # 2. 检查大额授权
        high_value_risk = self._check_high_value_approve(events)
        if high_value_risk:
            risks.append(high_value_risk)

        # 3. 检查 setApprovalForAll
        nft_approval_risk = self._check_nft_approval(method, events)
        if nft_approval_risk:
            risks.append(nft_approval_risk)

        # 4. 检查自我授权
        self_approval_risk = self._check_self_approval(events, from_address)
        if self_approval_risk:
            risks.append(self_approval_risk)

        # 5. 检查向零地址转账
        zero_transfer_risk = self._check_zero_address_transfer(events)
        if zero_transfer_risk:
            risks.append(zero_transfer_risk)

        # 6. 检查大额原生代币转账
        high_value_transfer_risk = self._check_high_value_native_transfer(value)
        if high_value_transfer_risk:
            risks.append(high_value_transfer_risk)

        return risks

    def _check_unlimited_approve(self, events: list[DecodedEvent]) -> RiskFlag | None:
        """检查 unlimited approve"""
        for event in events:
            if event.event_type not in ("approval_erc20", "approval_erc721"):
                continue

            value = event.args.get("value", "0")
            try:
                v = _parse_int_value(value)
                if v >= HIGH_VALUE_THRESHOLD:
                    return RiskFlag(
                        type="unlimited_approve",
                        severity="medium",
                        evidence=f"Approval value = {value} (near max uint256)",
                        description="授权金额接近无限，建议设置具体授权额度",
                    )
            except (ValueError, TypeError):
                pass

        return None

    def _check_high_value_approve(self, events: list[DecodedEvent]) -> RiskFlag | None:
        """检查大额授权（非 unlimited 但金额很大）"""
        # 这里可以根据代币价格判断，但简化处理只检查 unlimited
        return None

    def _check_nft_approval(
        self,
        method: DecodedMethod | None,
        events: list[DecodedEvent],
    ) -> RiskFlag | None:
        """检查 NFT setApprovalForAll"""
        if method and method.selector == "0xa22cb465":
            # 检查是否设置为 true
            for inp in method.inputs:
                if inp.get("name") == "approved" and inp.get("value") == "true":
                    return RiskFlag(
                        type="nft_approval_for_all",
                        severity="medium",
                        evidence="setApprovalForAll(operator, true)",
                        description="授权操作者管理所有 NFT，请确认操作者地址可信",
                    )

        return None

    def _check_self_approval(
        self,
        events: list[DecodedEvent],
        from_address: str,
    ) -> RiskFlag | None:
        """检查自我授权（可能的钓鱼）"""
        from_lower = from_address.lower()

        for event in events:
            if event.event_type not in ("approval_erc20", "approval_erc721"):
                continue

            owner = event.args.get("owner", "").lower()
            spender = event.args.get("spender", "").lower()

            # 如果 owner 是交易发起者，但 spender 不是常见的 DEX
            if owner == from_lower and spender and spender != from_lower:
                # 这里可以检查 spender 是否是已知的安全合约
                pass

        return None

    def _check_zero_address_transfer(self, events: list[DecodedEvent]) -> RiskFlag | None:
        """检查向零地址转账"""
        zero_address = "0x0000000000000000000000000000000000000000"

        for event in events:
            if event.event_type not in ("transfer_erc20", "transfer_erc721"):
                continue

            to = event.args.get("to", "").lower()
            if to == zero_address:
                return RiskFlag(
                    type="transfer_to_zero",
                    severity="high",
                    evidence=f"Transfer to {zero_address}",
                    description="向零地址转账，代币将永久丢失",
                )

        return None

    def _check_high_value_native_transfer(self, value: str) -> RiskFlag | None:
        """检查大额原生代币转账"""
        try:
            v = _parse_int_value(value)
            # 超过 10 ETH（单位 wei）
            if v > 10 * 10**18:
                eth_value = v / 10**18
                return RiskFlag(
                    type="high_value_transfer",
                    severity="low",
                    evidence=f"Native token transfer: {eth_value:.4f} ETH",
                    description="大额原生代币转账，请确认收款地址正确",
                )
        except (ValueError, TypeError):
            pass

        return None
