from __future__ import annotations

from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app_logging import get_logger

logger = get_logger(__name__)


# 常用函数签名本地缓存
COMMON_SIGNATURES: dict[str, list[str]] = {
    # ERC-20
    "0xa9059cbb": ["transfer(address,uint256)"],
    "0x23b872dd": ["transferFrom(address,address,uint256)"],
    "0x095ea7b3": ["approve(address,uint256)"],
    "0x70a08231": ["balanceOf(address)"],
    "0xdd62ed3e": ["allowance(address,address)"],
    "0x18160ddd": ["totalSupply()"],
    "0x313ce567": ["decimals()"],
    "0x06fdde03": ["name()"],
    "0x95d89b41": ["symbol()"],

    # ERC-721
    "0x42842e0e": ["safeTransferFrom(address,address,uint256)"],
    "0xb88d4fde": ["safeTransferFrom(address,address,uint256,bytes)"],
    "0x6352211e": ["ownerOf(uint256)"],
    "0xe985e9c5": ["isApprovedForAll(address,address)"],
    "0xa22cb465": ["setApprovalForAll(address,bool)"],
    "0x081812fc": ["getApproved(uint256)"],

    # Uniswap V2 Router
    "0x38ed1739": ["swapExactTokensForTokens(uint256,uint256,address[],address,uint256)"],
    "0x8803dbee": ["swapTokensForExactTokens(uint256,uint256,address[],address,uint256)"],
    "0x7ff36ab5": ["swapExactETHForTokens(uint256,address[],address,uint256)"],
    "0x4a25d94a": ["swapTokensForExactETH(uint256,uint256,address[],address,uint256)"],
    "0x18cbafe5": ["swapExactTokensForETH(uint256,uint256,address[],address,uint256)"],
    "0xfb3bdb41": ["swapETHForExactTokens(uint256,address[],address,uint256)"],
    "0xe8e33700": ["addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)"],
    "0xf305d719": ["addLiquidityETH(address,uint256,uint256,uint256,address,uint256)"],
    "0xbaa2abde": ["removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)"],
    "0x02751cec": ["removeLiquidityETH(address,uint256,uint256,uint256,address,uint256)"],
    "0x69328dec": ["removeLiquidityETHWithPermit(address,uint256,uint256,uint256,address,uint256,bool,uint8,bytes32,bytes32)"],
    "0x2195995c": ["removeLiquidityWithPermit(address,address,uint256,uint256,uint256,address,uint256,bool,uint8,bytes32,bytes32)"],
    "0xded9382a": ["removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(address,uint256,uint256,uint256,address,uint256,bool,uint8,bytes32,bytes32)"],
    "0x5c11d795": ["swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)"],
    "0xb6f9de95": ["swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256)"],
    "0x791ac947": ["swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)"],

    # Uniswap V3 Router
    "0x414bf389": ["exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))"],
    "0xc04b8d59": ["exactInput((bytes,address,uint256,uint256,uint256))"],
    "0xdb3e2198": ["exactOutputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))"],
    "0xf28c0498": ["exactOutput((bytes,address,uint256,uint256,uint256))"],

    # WETH
    "0xd0e30db0": ["deposit()"],
    "0x2e1a7d4d": ["withdraw(uint256)"],

    # Multicall
    "0xac9650d8": ["multicall(bytes[])"],
    "0x5ae401dc": ["multicall(uint256,bytes[])"],

    # Common
    "0x150b7a02": ["onERC721Received(address,address,uint256,bytes)"],
    "0xf23a6e61": ["onERC1155Received(address,address,uint256,uint256,bytes)"],
    "0xbc197c81": ["onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"],
}

# 常用事件签名本地缓存
COMMON_EVENT_SIGNATURES: dict[str, str] = {
    # ERC-20
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": "Transfer(address,address,uint256)",
    "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": "Approval(address,address,uint256)",

    # ERC-721 (same Transfer signature but different indexed params)
    # ERC-1155
    "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62": "TransferSingle(address,address,address,uint256,uint256)",
    "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb": "TransferBatch(address,address,address,uint256[],uint256[])",

    # Uniswap V2
    "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822": "Swap(address,uint256,uint256,uint256,uint256,address)",
    "0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f": "Mint(address,uint256,uint256)",
    "0xdccd412f0b1252819cb1fd330b93224ca42612892bb3f4f789976e6d81936496": "Burn(address,uint256,uint256,address)",
    "0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1": "Sync(uint112,uint112)",

    # Uniswap V3
    "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67": "Swap(address,address,int256,int256,uint160,uint128,int24)",

    # WETH
    "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c": "Deposit(address,uint256)",
    "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65": "Withdrawal(address,uint256)",
}


class SignatureDB:
    """函数签名数据库客户端"""

    BASE_URL = "https://www.4byte.directory/api/v1"

    def __init__(self, timeout: float = 10.0):
        self.timeout = timeout
        self._local_cache: dict[str, list[str]] = COMMON_SIGNATURES.copy()
        self._event_cache: dict[str, str] = COMMON_EVENT_SIGNATURES.copy()

    def get_local_signature(self, selector: str) -> list[str] | None:
        """从本地缓存获取签名"""
        selector = selector.lower()
        return self._local_cache.get(selector)

    def get_local_event_signature(self, topic: str) -> str | None:
        """从本地缓存获取事件签名"""
        topic = topic.lower()
        return self._event_cache.get(topic)

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=5))
    async def lookup_signature(self, selector: str) -> list[str]:
        """查询函数签名"""
        selector = selector.lower()

        # 先检查本地缓存
        if selector in self._local_cache:
            return self._local_cache[selector]

        logger.debug("4byte_lookup", selector=selector)

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.BASE_URL}/signatures/",
                    params={"hex_signature": selector},
                )
                response.raise_for_status()
                data = response.json()

            results = data.get("results", [])
            signatures = [r.get("text_signature") for r in results if r.get("text_signature")]

            # 缓存结果
            if signatures:
                self._local_cache[selector] = signatures

            return signatures
        except Exception as e:
            logger.warning("4byte_lookup_error", selector=selector, error=str(e))
            return []

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=5))
    async def lookup_event_signature(self, topic: str) -> str | None:
        """查询事件签名"""
        topic = topic.lower()

        # 先检查本地缓存
        if topic in self._event_cache:
            return self._event_cache[topic]

        logger.debug("4byte_event_lookup", topic=topic)

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.BASE_URL}/event-signatures/",
                    params={"hex_signature": topic},
                )
                response.raise_for_status()
                data = response.json()

            results = data.get("results", [])
            if results:
                signature = results[0].get("text_signature")
                if signature:
                    self._event_cache[topic] = signature
                    return signature

            return None
        except Exception as e:
            logger.warning("4byte_event_lookup_error", topic=topic, error=str(e))
            return None

    def add_to_cache(self, selector: str, signatures: list[str]) -> None:
        """添加到本地缓存"""
        self._local_cache[selector.lower()] = signatures

    def add_event_to_cache(self, topic: str, signature: str) -> None:
        """添加事件到本地缓存"""
        self._event_cache[topic.lower()] = signature
