"""
签名数据解析模块

支持解析 EIP-712 签名请求、Permit 签名等
"""
from __future__ import annotations

import json
import re
from typing import Any
from dataclasses import dataclass, field
from datetime import datetime

from app_logging import get_logger
from .schemas import RiskFlag

logger = get_logger(__name__)


# 已知的 EIP-712 签名类型
KNOWN_SIGNATURE_TYPES = {
    # Permit (ERC-2612)
    "Permit": {
        "description": "Token approval via signature (gasless)",
        "risk_level": "high",
        "fields": ["owner", "spender", "value", "nonce", "deadline"],
    },
    # Permit2 (Uniswap)
    "PermitSingle": {
        "description": "Uniswap Permit2 single token approval",
        "risk_level": "high",
        "fields": ["details", "spender", "sigDeadline"],
    },
    "PermitBatch": {
        "description": "Uniswap Permit2 batch token approval",
        "risk_level": "high",
        "fields": ["details", "spender", "sigDeadline"],
    },
    # OpenSea Seaport
    "OrderComponents": {
        "description": "OpenSea Seaport order",
        "risk_level": "medium",
        "fields": ["offerer", "zone", "offer", "consideration"],
    },
    # Blur
    "Order": {
        "description": "NFT marketplace order",
        "risk_level": "medium",
        "fields": ["trader", "side", "matchingPolicy", "collection"],
    },
    # EIP-712 Mail (example)
    "Mail": {
        "description": "Test/Example signature",
        "risk_level": "low",
        "fields": ["from", "to", "contents"],
    },
}

# 已知的危险域名/合约
KNOWN_DANGEROUS_CONTRACTS: dict[str, str] = {
    # 钓鱼合约地址可以添加到这里
}

# Permit2 合约地址
PERMIT2_ADDRESSES = {
    1: "0x000000000022D473030F116dDEE9F6B43aC78BA3",  # Ethereum
    56: "0x000000000022D473030F116dDEE9F6B43aC78BA3",  # BSC
    137: "0x000000000022D473030F116dDEE9F6B43aC78BA3",  # Polygon
    42161: "0x000000000022D473030F116dDEE9F6B43aC78BA3",  # Arbitrum
    10: "0x000000000022D473030F116dDEE9F6B43aC78BA3",  # Optimism
}


@dataclass
class EIP712Domain:
    """EIP-712 域信息"""
    name: str = ""
    version: str = ""
    chain_id: int | None = None
    verifying_contract: str = ""
    salt: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "version": self.version,
            "chain_id": self.chain_id,
            "verifying_contract": self.verifying_contract,
            "salt": self.salt,
        }


@dataclass
class SignatureAnalysis:
    """签名分析结果"""
    # 基础信息
    signature_type: str  # "eip712" | "personal_sign" | "eth_sign" | "unknown"
    primary_type: str = ""  # EIP-712 主类型
    domain: EIP712Domain | None = None

    # 解析结果
    message: dict[str, Any] = field(default_factory=dict)
    formatted_message: str = ""

    # 分析
    action_type: str = ""  # "permit" | "order" | "approval" | "unknown"
    action_description: str = ""
    affected_assets: list[dict[str, Any]] = field(default_factory=list)

    # 风险
    risk_level: str = "unknown"  # low | medium | high | critical
    risk_flags: list[RiskFlag] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    # 额外信息
    expires_at: datetime | None = None
    spender: str = ""
    raw_data: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "signature_type": self.signature_type,
            "primary_type": self.primary_type,
            "domain": self.domain.to_dict() if self.domain else None,
            "message": self.message,
            "formatted_message": self.formatted_message,
            "action_type": self.action_type,
            "action_description": self.action_description,
            "affected_assets": self.affected_assets,
            "risk_level": self.risk_level,
            "risk_flags": [rf.model_dump() for rf in self.risk_flags],
            "warnings": self.warnings,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "spender": self.spender,
        }


class SignatureParser:
    """签名数据解析器"""

    def parse(self, data: str | dict[str, Any]) -> SignatureAnalysis:
        """
        解析签名数据

        Args:
            data: 签名数据 (JSON 字符串或字典)

        Returns:
            SignatureAnalysis: 解析结果
        """
        # 解析输入
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except json.JSONDecodeError:
                # 可能是 personal_sign 的原始消息
                return self._parse_personal_sign(data)

        # 检测签名类型
        if self._is_eip712(data):
            return self._parse_eip712(data)
        elif self._is_typed_data_v4(data):
            return self._parse_typed_data_v4(data)
        else:
            return SignatureAnalysis(
                signature_type="unknown",
                message=data if isinstance(data, dict) else {"raw": data},
                warnings=["Unable to determine signature type"],
            )

    def _is_eip712(self, data: dict[str, Any]) -> bool:
        """检查是否是 EIP-712 格式"""
        return (
            "domain" in data
            and "message" in data
            and "primaryType" in data
            and "types" in data
        )

    def _is_typed_data_v4(self, data: dict[str, Any]) -> bool:
        """检查是否是 TypedData V4 格式"""
        return self._is_eip712(data)

    def _parse_personal_sign(self, message: str) -> SignatureAnalysis:
        """解析 personal_sign 消息"""
        result = SignatureAnalysis(
            signature_type="personal_sign",
            message={"raw": message},
            formatted_message=message,
            risk_level="low",
        )

        # 检查是否包含可疑内容
        lower_msg = message.lower()
        if any(word in lower_msg for word in ["transfer", "approve", "claim"]):
            result.warnings.append(
                "Message contains keywords that might be misleading"
            )
            result.risk_level = "medium"

        return result

    def _parse_eip712(self, data: dict[str, Any]) -> SignatureAnalysis:
        """解析 EIP-712 签名"""
        result = SignatureAnalysis(
            signature_type="eip712",
            raw_data=data,
        )

        # 解析域
        domain_data = data.get("domain", {})
        result.domain = EIP712Domain(
            name=domain_data.get("name", ""),
            version=domain_data.get("version", ""),
            chain_id=domain_data.get("chainId"),
            verifying_contract=domain_data.get("verifyingContract", ""),
            salt=domain_data.get("salt", ""),
        )

        # 解析主类型和消息
        result.primary_type = data.get("primaryType", "")
        result.message = data.get("message", {})

        # 格式化消息用于显示
        result.formatted_message = self._format_message(
            result.message, result.primary_type
        )

        # 分析签名类型
        self._analyze_signature_type(result)

        # 检测风险
        self._detect_risks(result)

        return result

    def _parse_typed_data_v4(self, data: dict[str, Any]) -> SignatureAnalysis:
        """解析 TypedData V4 (同 EIP-712)"""
        return self._parse_eip712(data)

    def _format_message(self, message: dict[str, Any], primary_type: str) -> str:
        """格式化消息用于显示"""
        lines = [f"Type: {primary_type}", ""]

        def format_value(key: str, value: Any, indent: int = 0) -> list[str]:
            prefix = "  " * indent
            if isinstance(value, dict):
                result = [f"{prefix}{key}:"]
                for k, v in value.items():
                    result.extend(format_value(k, v, indent + 1))
                return result
            elif isinstance(value, list):
                result = [f"{prefix}{key}: [{len(value)} items]"]
                for i, item in enumerate(value[:3]):  # 只显示前3个
                    if isinstance(item, dict):
                        result.append(f"{prefix}  [{i}]:")
                        for k, v in item.items():
                            result.extend(format_value(k, v, indent + 2))
                    else:
                        result.append(f"{prefix}  [{i}]: {item}")
                if len(value) > 3:
                    result.append(f"{prefix}  ... and {len(value) - 3} more")
                return result
            else:
                # 格式化特殊值
                formatted = self._format_special_value(key, value)
                return [f"{prefix}{key}: {formatted}"]

        for key, value in message.items():
            lines.extend(format_value(key, value))

        return "\n".join(lines)

    def _format_special_value(self, key: str, value: Any) -> str:
        """格式化特殊值"""
        key_lower = key.lower()

        # 时间戳
        if key_lower in ["deadline", "expiry", "expiration", "sigdeadline"]:
            try:
                ts = int(value)
                if ts > 10**18:  # 可能是 wei
                    ts = ts // 10**9
                dt = datetime.fromtimestamp(ts)
                return f"{value} ({dt.strftime('%Y-%m-%d %H:%M:%S')})"
            except (ValueError, OSError):
                pass

        # 大数值 (可能是代币数量)
        if key_lower in ["value", "amount", "nonce"]:
            try:
                v = int(value)
                max_uint256 = 2**256 - 1
                if v == max_uint256:
                    return "UNLIMITED (MAX_UINT256)"
                if v > 10**18:
                    return f"{value} ({v / 10**18:.4f} tokens, assuming 18 decimals)"
            except (ValueError, TypeError):
                pass

        # 地址
        if key_lower in ["owner", "spender", "token", "verifyingcontract"]:
            if isinstance(value, str) and len(value) == 42:
                return f"{value[:10]}...{value[-8:]}"

        return str(value)

    def _analyze_signature_type(self, result: SignatureAnalysis) -> None:
        """分析签名的具体类型"""
        primary_type = result.primary_type
        message = result.message

        # 检查已知类型
        if primary_type in KNOWN_SIGNATURE_TYPES:
            info = KNOWN_SIGNATURE_TYPES[primary_type]
            result.action_description = info["description"]
            result.risk_level = info["risk_level"]

        # Permit 类型
        if primary_type == "Permit":
            result.action_type = "permit"
            result.spender = message.get("spender", "")

            # 检查授权金额
            value = message.get("value", "0")
            try:
                v = int(value)
                max_uint256 = 2**256 - 1
                if v >= max_uint256 * 0.9:
                    result.warnings.append("UNLIMITED token approval!")
                    result.risk_level = "critical"
            except (ValueError, TypeError):
                pass

            # 检查截止时间
            deadline = message.get("deadline")
            if deadline:
                try:
                    ts = int(deadline)
                    result.expires_at = datetime.fromtimestamp(ts)
                except (ValueError, OSError):
                    pass

            result.affected_assets.append({
                "type": "token_approval",
                "spender": result.spender,
                "amount": str(value),
            })

        # Permit2 类型
        elif primary_type in ["PermitSingle", "PermitBatch"]:
            result.action_type = "permit2"
            result.spender = message.get("spender", "")

            details = message.get("details", {})
            if isinstance(details, dict):
                token = details.get("token", "")
                amount = details.get("amount", "0")
                result.affected_assets.append({
                    "type": "permit2_approval",
                    "token": token,
                    "spender": result.spender,
                    "amount": str(amount),
                })
            elif isinstance(details, list):
                for d in details:
                    result.affected_assets.append({
                        "type": "permit2_approval",
                        "token": d.get("token", ""),
                        "spender": result.spender,
                        "amount": str(d.get("amount", "0")),
                    })

            result.risk_level = "high"

        # NFT 订单类型
        elif primary_type in ["OrderComponents", "Order"]:
            result.action_type = "nft_order"
            result.action_description = "NFT marketplace listing/offer"

            # 解析 offer 和 consideration
            offers = message.get("offer", [])
            for offer in offers:
                result.affected_assets.append({
                    "type": "offer",
                    "item_type": offer.get("itemType"),
                    "token": offer.get("token"),
                    "amount": offer.get("startAmount"),
                })

    def _detect_risks(self, result: SignatureAnalysis) -> None:
        """检测签名风险"""
        # 检查验证合约是否可疑
        if result.domain and result.domain.verifying_contract:
            contract = result.domain.verifying_contract.lower()
            if contract in KNOWN_DANGEROUS_CONTRACTS:
                result.risk_flags.append(RiskFlag(
                    type="dangerous_contract",
                    severity="high",
                    evidence=f"Contract: {contract}",
                    description=KNOWN_DANGEROUS_CONTRACTS[contract],
                ))
                result.risk_level = "critical"

        # 检查是否是 Permit2 但验证合约不匹配
        if result.action_type == "permit2" and result.domain:
            chain_id = result.domain.chain_id
            expected = PERMIT2_ADDRESSES.get(chain_id, "").lower()
            actual = result.domain.verifying_contract.lower()
            if expected and actual != expected:
                result.risk_flags.append(RiskFlag(
                    type="invalid_permit2_contract",
                    severity="high",
                    evidence=f"Expected: {expected}, Got: {actual}",
                    description="Permit2 contract address mismatch - possible phishing",
                ))
                result.risk_level = "critical"
                result.warnings.append("WARNING: Permit2 contract address mismatch!")

        # 检查无限授权
        for asset in result.affected_assets:
            amount = asset.get("amount", "0")
            try:
                v = int(amount)
                if v >= 2**256 * 0.9:
                    result.risk_flags.append(RiskFlag(
                        type="unlimited_approval",
                        severity="high",
                        evidence=f"Amount: {amount}",
                        description="Unlimited token approval via signature",
                    ))
                    if result.risk_level != "critical":
                        result.risk_level = "high"
            except (ValueError, TypeError):
                pass

        # 检查过期时间
        if result.expires_at:
            now = datetime.now()
            if result.expires_at < now:
                result.warnings.append("Signature has already expired")
            elif (result.expires_at - now).days > 365:
                result.warnings.append("Signature valid for more than 1 year")
                result.risk_flags.append(RiskFlag(
                    type="long_validity",
                    severity="medium",
                    evidence=f"Expires: {result.expires_at}",
                    description="Signature has very long validity period",
                ))

    def get_human_readable_summary(self, result: SignatureAnalysis) -> str:
        """生成人类可读的摘要"""
        lines = []

        # 标题
        if result.action_type == "permit":
            lines.append("🔐 Token Approval Request (Permit)")
        elif result.action_type == "permit2":
            lines.append("🔐 Token Approval Request (Permit2)")
        elif result.action_type == "nft_order":
            lines.append("🖼️ NFT Order Signature")
        else:
            lines.append(f"📝 Signature Request: {result.primary_type}")

        lines.append("")

        # 域信息
        if result.domain:
            if result.domain.name:
                lines.append(f"App: {result.domain.name}")
            if result.domain.verifying_contract:
                lines.append(f"Contract: {result.domain.verifying_contract}")

        # 操作描述
        if result.action_description:
            lines.append(f"Action: {result.action_description}")

        # 受影响的资产
        if result.affected_assets:
            lines.append("")
            lines.append("Affected Assets:")
            for asset in result.affected_assets:
                asset_type = asset.get("type", "")
                if "approval" in asset_type:
                    spender = asset.get("spender", "")[:20] + "..."
                    amount = asset.get("amount", "0")
                    try:
                        v = int(amount)
                        if v >= 2**256 * 0.9:
                            amount = "UNLIMITED"
                    except (ValueError, TypeError):
                        pass
                    lines.append(f"  - Approve {amount} to {spender}")

        # 过期时间
        if result.expires_at:
            lines.append(f"Expires: {result.expires_at.strftime('%Y-%m-%d %H:%M:%S')}")

        # 风险等级
        lines.append("")
        risk_emoji = {
            "low": "🟢",
            "medium": "🟡",
            "high": "🟠",
            "critical": "🔴",
            "unknown": "⚪",
        }
        lines.append(f"Risk Level: {risk_emoji.get(result.risk_level, '⚪')} {result.risk_level.upper()}")

        # 警告
        if result.warnings:
            lines.append("")
            lines.append("⚠️ Warnings:")
            for warning in result.warnings:
                lines.append(f"  - {warning}")

        return "\n".join(lines)


def parse_signature(data: str | dict[str, Any]) -> SignatureAnalysis:
    """
    便捷函数：解析签名数据

    Args:
        data: 签名数据

    Returns:
        SignatureAnalysis: 解析结果
    """
    parser = SignatureParser()
    return parser.parse(data)
