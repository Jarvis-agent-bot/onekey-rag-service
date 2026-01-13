from __future__ import annotations

from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app_logging import get_logger

logger = get_logger(__name__)


class RPCError(Exception):
    """RPC 调用错误"""

    def __init__(self, message: str, code: int | None = None):
        super().__init__(message)
        self.code = code


class RPCClient:
    """EVM JSON-RPC 客户端"""

    def __init__(self, rpc_url: str, timeout: float = 30.0):
        self.rpc_url = rpc_url
        self.timeout = timeout
        self._request_id = 0

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
    async def _call(self, method: str, params: list[Any]) -> Any:
        """执行 RPC 调用"""
        request_id = self._next_id()

        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": request_id,
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(self.rpc_url, json=payload)
            response.raise_for_status()
            data = response.json()

        if "error" in data:
            error = data["error"]
            raise RPCError(
                message=error.get("message", "Unknown RPC error"),
                code=error.get("code"),
            )

        return data.get("result")

    async def get_transaction_by_hash(self, tx_hash: str) -> dict[str, Any] | None:
        """获取交易详情"""
        logger.debug("rpc_get_transaction", tx_hash=tx_hash)
        result = await self._call("eth_getTransactionByHash", [tx_hash])
        return result

    async def get_transaction_receipt(self, tx_hash: str) -> dict[str, Any] | None:
        """获取交易收据"""
        logger.debug("rpc_get_receipt", tx_hash=tx_hash)
        result = await self._call("eth_getTransactionReceipt", [tx_hash])
        return result

    async def get_block_by_number(self, block_number: int | str, full_transactions: bool = False) -> dict[str, Any] | None:
        """获取区块信息"""
        if isinstance(block_number, int):
            block_number = hex(block_number)
        logger.debug("rpc_get_block", block_number=block_number)
        result = await self._call("eth_getBlockByNumber", [block_number, full_transactions])
        return result

    async def get_logs(
        self,
        from_block: int | str | None = None,
        to_block: int | str | None = None,
        address: str | list[str] | None = None,
        topics: list[str | list[str] | None] | None = None,
    ) -> list[dict[str, Any]]:
        """获取日志"""
        params: dict[str, Any] = {}

        if from_block is not None:
            params["fromBlock"] = hex(from_block) if isinstance(from_block, int) else from_block
        if to_block is not None:
            params["toBlock"] = hex(to_block) if isinstance(to_block, int) else to_block
        if address:
            params["address"] = address
        if topics:
            params["topics"] = topics

        logger.debug("rpc_get_logs", params=params)
        result = await self._call("eth_getLogs", [params])
        return result or []

    async def get_code(self, address: str, block: str = "latest") -> str:
        """获取合约代码"""
        logger.debug("rpc_get_code", address=address)
        result = await self._call("eth_getCode", [address, block])
        return result or "0x"

    async def call(
        self,
        to: str,
        data: str,
        from_address: str | None = None,
        block: str = "latest",
    ) -> str:
        """执行 eth_call"""
        params: dict[str, Any] = {"to": to, "data": data}
        if from_address:
            params["from"] = from_address

        result = await self._call("eth_call", [params, block])
        return result or "0x"

    async def get_chain_id(self) -> int:
        """获取链 ID"""
        result = await self._call("eth_chainId", [])
        return int(result, 16) if result else 0

    async def get_block_number(self) -> int:
        """获取最新区块号"""
        result = await self._call("eth_blockNumber", [])
        return int(result, 16) if result else 0
