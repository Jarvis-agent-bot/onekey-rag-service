"""
DefiLlama API 客户端
"""

import logging
from decimal import Decimal

import httpx

from config import get_settings

logger = logging.getLogger(__name__)


class DefiLlamaClient:
    """DefiLlama API 客户端"""

    def __init__(self):
        settings = get_settings()
        self.base_url = settings.defillama_base_url.rstrip("/")
        self.timeout = settings.defillama_timeout
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout),
                headers={"Accept": "application/json"},
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def get_protocol_tvl(self, protocol_id: str) -> Decimal | None:
        """获取协议 TVL"""
        try:
            client = await self._get_client()
            url = f"{self.base_url}/tvl/{protocol_id}"
            response = await client.get(url)

            if response.status_code == 404:
                return None

            response.raise_for_status()
            tvl = response.json()

            if isinstance(tvl, (int, float)):
                return Decimal(str(tvl))
            return None
        except Exception as e:
            logger.warning(f"获取 TVL 失败: {protocol_id} - {e}")
            return None

    async def get_protocol(self, protocol_id: str) -> dict | None:
        """获取协议详情"""
        try:
            client = await self._get_client()
            url = f"{self.base_url}/protocol/{protocol_id}"
            response = await client.get(url)

            if response.status_code == 404:
                return None

            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.warning(f"获取协议详情失败: {protocol_id} - {e}")
            return None

    async def get_protocols(self) -> list[dict]:
        """获取所有协议列表"""
        try:
            client = await self._get_client()
            url = f"{self.base_url}/protocols"
            response = await client.get(url)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"获取协议列表失败: {e}")
            return []
