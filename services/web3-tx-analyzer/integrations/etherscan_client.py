from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app_logging import get_logger

logger = get_logger(__name__)


class EtherscanError(Exception):
    """Etherscan API 错误"""

    def __init__(self, message: str, status: str | None = None):
        super().__init__(message)
        self.status = status


class EtherscanClient:
    """Etherscan API 客户端（支持多链）"""

    def __init__(
        self,
        base_url: str,
        api_key: str = "",
        rate_limit_per_min: int = 5,
        timeout: float = 30.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.rate_limit_per_min = rate_limit_per_min
        self.timeout = timeout
        self._last_request_time = 0.0
        self._request_interval = 60.0 / rate_limit_per_min if rate_limit_per_min > 0 else 0

    async def _rate_limit(self) -> None:
        """请求限流"""
        if self._request_interval > 0:
            elapsed = time.time() - self._last_request_time
            if elapsed < self._request_interval:
                await asyncio.sleep(self._request_interval - elapsed)
        self._last_request_time = time.time()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def _request(self, params: dict[str, Any]) -> dict[str, Any]:
        """发送请求"""
        await self._rate_limit()

        if self.api_key:
            params["apikey"] = self.api_key

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(self.base_url, params=params)
            response.raise_for_status()
            data = response.json()

        # 检查 API 响应状态
        status = data.get("status")
        message = data.get("message", "")
        result = data.get("result")

        # Etherscan API 的 status 为 "0" 表示失败，"1" 表示成功
        # 但有些情况下 message 为 "OK" 也表示成功
        if status == "0" and message != "OK":
            # 合约未验证的情况
            if "not verified" in str(result).lower():
                logger.debug("contract_not_verified", result=result)
                return {"status": "0", "message": "Contract source code not verified", "result": None}
            raise EtherscanError(message=str(result), status=status)

        return data

    async def get_abi(self, contract_address: str) -> list[dict[str, Any]] | None:
        """获取合约 ABI"""
        logger.debug("etherscan_get_abi", address=contract_address)

        params = {
            "module": "contract",
            "action": "getabi",
            "address": contract_address,
        }

        try:
            data = await self._request(params)
            result = data.get("result")

            if result and isinstance(result, str) and result.startswith("["):
                import json
                return json.loads(result)
            return None
        except EtherscanError as e:
            if "not verified" in str(e).lower():
                return None
            raise

    async def get_source_code(self, contract_address: str) -> dict[str, Any] | None:
        """获取合约源码信息"""
        logger.debug("etherscan_get_source", address=contract_address)

        params = {
            "module": "contract",
            "action": "getsourcecode",
            "address": contract_address,
        }

        try:
            data = await self._request(params)
            result = data.get("result")

            if result and isinstance(result, list) and len(result) > 0:
                source_info = result[0]
                # 检查是否已验证
                if source_info.get("ABI") == "Contract source code not verified":
                    return None
                return source_info
            return None
        except EtherscanError:
            return None

    async def get_contract_creation(self, contract_addresses: list[str]) -> list[dict[str, Any]]:
        """获取合约创建信息"""
        logger.debug("etherscan_get_creation", addresses=contract_addresses)

        params = {
            "module": "contract",
            "action": "getcontractcreation",
            "contractaddresses": ",".join(contract_addresses),
        }

        try:
            data = await self._request(params)
            result = data.get("result")
            return result if isinstance(result, list) else []
        except EtherscanError:
            return []

    async def get_tx_list(
        self,
        address: str,
        start_block: int = 0,
        end_block: int = 99999999,
        page: int = 1,
        offset: int = 100,
        sort: str = "desc",
    ) -> list[dict[str, Any]]:
        """获取地址交易列表"""
        params = {
            "module": "account",
            "action": "txlist",
            "address": address,
            "startblock": start_block,
            "endblock": end_block,
            "page": page,
            "offset": offset,
            "sort": sort,
        }

        try:
            data = await self._request(params)
            result = data.get("result")
            return result if isinstance(result, list) else []
        except EtherscanError:
            return []

    async def get_token_tx(
        self,
        address: str,
        contract_address: str | None = None,
        start_block: int = 0,
        end_block: int = 99999999,
        page: int = 1,
        offset: int = 100,
        sort: str = "desc",
    ) -> list[dict[str, Any]]:
        """获取代币转账记录"""
        params = {
            "module": "account",
            "action": "tokentx",
            "address": address,
            "startblock": start_block,
            "endblock": end_block,
            "page": page,
            "offset": offset,
            "sort": sort,
        }

        if contract_address:
            params["contractaddress"] = contract_address

        try:
            data = await self._request(params)
            result = data.get("result")
            return result if isinstance(result, list) else []
        except EtherscanError:
            return []
