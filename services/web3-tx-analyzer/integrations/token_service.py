"""
Token 信息服务

提供 Token 信息查询和金额格式化功能
"""
from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from typing import Any
from dataclasses import dataclass, field

from app_logging import get_logger

logger = get_logger(__name__)

# 数据目录
DATA_DIR = Path(__file__).parent.parent / "data"
TOKENS_FILE = DATA_DIR / "known_tokens.json"


@dataclass
class TokenInfo:
    """Token 信息"""
    address: str
    chain_id: int
    symbol: str
    name: str
    decimals: int
    type: str = "token"  # native, wrapped_native, stablecoin, atoken, token, etc.
    underlying: str | None = None  # 对于 aToken，这是底层资产地址

    def to_dict(self) -> dict[str, Any]:
        return {
            "address": self.address,
            "chain_id": self.chain_id,
            "symbol": self.symbol,
            "name": self.name,
            "decimals": self.decimals,
            "type": self.type,
            "underlying": self.underlying,
        }


# 本地代币地址映射（用于处理 msg.value）
NATIVE_TOKEN_ADDRESSES = {
    "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "0x0000000000000000000000000000000000000000",
}

# 各链的原生代币
NATIVE_TOKENS: dict[int, TokenInfo] = {
    1: TokenInfo("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", 1, "ETH", "Ethereum", 18, "native"),
    10: TokenInfo("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", 10, "ETH", "Ethereum", 18, "native"),
    56: TokenInfo("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", 56, "BNB", "BNB", 18, "native"),
    137: TokenInfo("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", 137, "MATIC", "Polygon", 18, "native"),
    42161: TokenInfo("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", 42161, "ETH", "Ethereum", 18, "native"),
    43114: TokenInfo("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", 43114, "AVAX", "Avalanche", 18, "native"),
    8453: TokenInfo("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", 8453, "ETH", "Ethereum", 18, "native"),
}


class TokenService:
    """Token 信息服务"""

    def __init__(self):
        self._tokens: dict[str, dict[str, dict]] = {}
        self._load_tokens()

    def _load_tokens(self) -> None:
        """加载 Token 数据"""
        try:
            if TOKENS_FILE.exists():
                with open(TOKENS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # 转换地址为小写
                    for chain_id, tokens in data.items():
                        self._tokens[chain_id] = {
                            addr.lower(): info for addr, info in tokens.items()
                        }
                logger.info("token_service_loaded", count=sum(len(t) for t in self._tokens.values()))
        except Exception as e:
            logger.error("token_service_load_error", error=str(e))

    def get_token_info(self, chain_id: int, address: str) -> TokenInfo | None:
        """
        获取 Token 信息

        Args:
            chain_id: 链 ID
            address: Token 地址

        Returns:
            TokenInfo 或 None
        """
        if not address:
            return None

        address = address.lower()

        # 检查是否是原生代币
        if address in NATIVE_TOKEN_ADDRESSES:
            return NATIVE_TOKENS.get(chain_id)

        # 从本地库查询
        chain_tokens = self._tokens.get(str(chain_id), {})
        info = chain_tokens.get(address)

        if info:
            return TokenInfo(
                address=address,
                chain_id=chain_id,
                symbol=info.get("symbol", "UNKNOWN"),
                name=info.get("name", "Unknown Token"),
                decimals=info.get("decimals", 18),
                type=info.get("type", "token"),
                underlying=info.get("underlying"),
            )

        return None

    def get_native_token(self, chain_id: int) -> TokenInfo | None:
        """获取原生代币信息"""
        return NATIVE_TOKENS.get(chain_id)

    def format_amount(self, raw_amount: str | int, decimals: int) -> str:
        """
        格式化金额

        Args:
            raw_amount: 原始金额 (wei)
            decimals: 小数位数

        Returns:
            格式化后的金额字符串
        """
        try:
            if isinstance(raw_amount, str):
                if raw_amount.startswith("0x"):
                    raw_amount = int(raw_amount, 16)
                else:
                    raw_amount = int(raw_amount)

            amount = Decimal(raw_amount) / Decimal(10 ** decimals)

            # 移除尾部零
            formatted = f"{amount:.{decimals}f}".rstrip("0").rstrip(".")

            return formatted
        except Exception:
            return str(raw_amount)

    def parse_amount(self, formatted_amount: str, decimals: int) -> int:
        """
        解析格式化金额为原始金额

        Args:
            formatted_amount: 格式化后的金额
            decimals: 小数位数

        Returns:
            原始金额 (wei)
        """
        try:
            amount = Decimal(formatted_amount)
            raw = int(amount * Decimal(10 ** decimals))
            return raw
        except Exception:
            return 0

    def is_stablecoin(self, chain_id: int, address: str) -> bool:
        """判断是否是稳定币"""
        info = self.get_token_info(chain_id, address)
        return info is not None and info.type == "stablecoin"

    def is_atoken(self, chain_id: int, address: str) -> bool:
        """判断是否是 aToken"""
        info = self.get_token_info(chain_id, address)
        return info is not None and info.type == "atoken"

    def get_underlying_token(self, chain_id: int, atoken_address: str) -> TokenInfo | None:
        """获取 aToken 的底层资产"""
        info = self.get_token_info(chain_id, atoken_address)
        if info and info.underlying:
            return self.get_token_info(chain_id, info.underlying)
        return None


# 全局单例
_service: TokenService | None = None


def get_token_service() -> TokenService:
    """获取 Token 服务单例"""
    global _service
    if _service is None:
        _service = TokenService()
    return _service
