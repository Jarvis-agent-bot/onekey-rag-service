from __future__ import annotations

import json
from typing import Any

import redis.asyncio as redis

from logging import get_logger

logger = get_logger(__name__)


class RedisCache:
    """Redis 缓存客户端"""

    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self._client: redis.Redis | None = None

    async def connect(self) -> None:
        """连接 Redis"""
        if self._client is None:
            self._client = redis.from_url(self.redis_url, decode_responses=True)
            logger.info("redis_connected", url=self.redis_url)

    async def close(self) -> None:
        """关闭连接"""
        if self._client:
            await self._client.close()
            self._client = None

    async def get(self, key: str) -> Any | None:
        """获取缓存"""
        if not self._client:
            return None

        try:
            value = await self._client.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            logger.warning("redis_get_error", key=key, error=str(e))
            return None

    async def set(self, key: str, value: Any, ttl_seconds: int | None = None) -> bool:
        """设置缓存"""
        if not self._client:
            return False

        try:
            json_value = json.dumps(value, ensure_ascii=False)
            if ttl_seconds:
                await self._client.setex(key, ttl_seconds, json_value)
            else:
                await self._client.set(key, json_value)
            return True
        except Exception as e:
            logger.warning("redis_set_error", key=key, error=str(e))
            return False

    async def delete(self, key: str) -> bool:
        """删除缓存"""
        if not self._client:
            return False

        try:
            await self._client.delete(key)
            return True
        except Exception as e:
            logger.warning("redis_delete_error", key=key, error=str(e))
            return False

    async def exists(self, key: str) -> bool:
        """检查缓存是否存在"""
        if not self._client:
            return False

        try:
            return await self._client.exists(key) > 0
        except Exception as e:
            logger.warning("redis_exists_error", key=key, error=str(e))
            return False

    # ABI 缓存相关方法
    def _abi_cache_key(self, chain_id: int, contract_address: str) -> str:
        """生成 ABI 缓存 key"""
        return f"abi:{chain_id}:{contract_address.lower()}"

    async def get_abi(self, chain_id: int, contract_address: str) -> dict[str, Any] | None:
        """获取 ABI 缓存"""
        key = self._abi_cache_key(chain_id, contract_address)
        return await self.get(key)

    async def set_abi(
        self,
        chain_id: int,
        contract_address: str,
        abi_data: dict[str, Any],
        ttl_seconds: int = 604800,  # 7 天
    ) -> bool:
        """设置 ABI 缓存"""
        key = self._abi_cache_key(chain_id, contract_address)
        return await self.set(key, abi_data, ttl_seconds)

    # 解析结果缓存相关方法
    def _parse_result_key(self, chain_id: int, tx_hash: str) -> str:
        """生成解析结果缓存 key"""
        return f"parse:{chain_id}:{tx_hash.lower()}"

    async def get_parse_result(self, chain_id: int, tx_hash: str) -> dict[str, Any] | None:
        """获取解析结果缓存"""
        key = self._parse_result_key(chain_id, tx_hash)
        return await self.get(key)

    async def set_parse_result(
        self,
        chain_id: int,
        tx_hash: str,
        parse_result: dict[str, Any],
        ttl_seconds: int = 86400,  # 1 天
    ) -> bool:
        """设置解析结果缓存"""
        key = self._parse_result_key(chain_id, tx_hash)
        return await self.set(key, parse_result, ttl_seconds)
