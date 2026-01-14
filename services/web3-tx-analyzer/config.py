from __future__ import annotations

from typing import Any

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

RAG_BASE_URL = "http://api:8000"
RAG_MODEL = "tx-analyzer"
RAG_API_KEY = ""
RAG_TIMEOUT_S = 90.0


class ChainConfig:
    """链配置"""

    def __init__(
        self,
        chain_id: int,
        name: str,
        rpc_url: str,
        explorer_base_url: str,
        explorer_api_key: str = "",
        native_token: str = "ETH",
    ):
        self.chain_id = chain_id
        self.name = name
        self.rpc_url = rpc_url
        self.explorer_base_url = explorer_base_url
        self.explorer_api_key = explorer_api_key
        self.native_token = native_token


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # 基础配置
    app_env: str = Field(default="local", alias="APP_ENV")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    log_format: str = Field(default="json", alias="LOG_FORMAT")
    port: int = Field(default=8001, alias="PORT")

    # 数据库
    database_url: str = Field(default="postgresql://postgres:postgres@localhost:5432/onekey_rag", alias="DATABASE_URL")
    database_schema: str = Field(default="tx_analyzer", alias="DATABASE_SCHEMA")

    # Redis
    redis_url: str = Field(default="redis://localhost:6379/1", alias="REDIS_URL")

    # RAG 服务
    rag_base_url: str = Field(default=RAG_BASE_URL)
    rag_model: str = Field(default=RAG_MODEL)
    rag_api_key: str = Field(default=RAG_API_KEY)
    rag_timeout_s: float = Field(default=RAG_TIMEOUT_S)

    # 链 RPC
    eth_rpc_url: str = Field(default="https://eth.llamarpc.com", alias="ETH_RPC_URL")
    bsc_rpc_url: str = Field(default="https://bsc-dataseed.binance.org", alias="BSC_RPC_URL")
    polygon_rpc_url: str = Field(default="https://polygon-rpc.com", alias="POLYGON_RPC_URL")
    arbitrum_rpc_url: str = Field(default="https://arb1.arbitrum.io/rpc", alias="ARBITRUM_RPC_URL")
    optimism_rpc_url: str = Field(default="https://mainnet.optimism.io", alias="OPTIMISM_RPC_URL")

    # Etherscan API Keys
    etherscan_eth_api_key: str = Field(default="", alias="ETHERSCAN_ETH_API_KEY")
    etherscan_bsc_api_key: str = Field(default="", alias="ETHERSCAN_BSC_API_KEY")
    etherscan_polygon_api_key: str = Field(default="", alias="ETHERSCAN_POLYGON_API_KEY")
    etherscan_arbitrum_api_key: str = Field(default="", alias="ETHERSCAN_ARBITRUM_API_KEY")
    etherscan_optimism_api_key: str = Field(default="", alias="ETHERSCAN_OPTIMISM_API_KEY")

    # 缓存 TTL
    abi_cache_ttl_seconds: int = Field(default=604800, alias="ABI_CACHE_TTL_SECONDS")
    parse_result_cache_ttl_seconds: int = Field(default=86400, alias="PARSE_RESULT_CACHE_TTL_SECONDS")

    # 限流
    etherscan_rate_limit_per_min: int = Field(default=5, alias="ETHERSCAN_RATE_LIMIT_PER_MIN")
    rpc_timeout_s: float = Field(default=30.0, alias="RPC_TIMEOUT_S")

    # Trace 配置
    trace_enabled: bool = Field(default=True, alias="TRACE_ENABLED")
    trace_store_db: bool = Field(default=True, alias="TRACE_STORE_DB")

    def get_chain_configs(self) -> dict[int, ChainConfig]:
        """获取所有链配置"""
        return {
            1: ChainConfig(
                chain_id=1,
                name="ethereum",
                rpc_url=self.eth_rpc_url,
                explorer_base_url="https://api.etherscan.io/api",
                explorer_api_key=self.etherscan_eth_api_key,
                native_token="ETH",
            ),
            56: ChainConfig(
                chain_id=56,
                name="bsc",
                rpc_url=self.bsc_rpc_url,
                explorer_base_url="https://api.bscscan.com/api",
                explorer_api_key=self.etherscan_bsc_api_key,
                native_token="BNB",
            ),
            137: ChainConfig(
                chain_id=137,
                name="polygon",
                rpc_url=self.polygon_rpc_url,
                explorer_base_url="https://api.polygonscan.com/api",
                explorer_api_key=self.etherscan_polygon_api_key,
                native_token="MATIC",
            ),
            42161: ChainConfig(
                chain_id=42161,
                name="arbitrum",
                rpc_url=self.arbitrum_rpc_url,
                explorer_base_url="https://api.arbiscan.io/api",
                explorer_api_key=self.etherscan_arbitrum_api_key,
                native_token="ETH",
            ),
            10: ChainConfig(
                chain_id=10,
                name="optimism",
                rpc_url=self.optimism_rpc_url,
                explorer_base_url="https://api-optimistic.etherscan.io/api",
                explorer_api_key=self.etherscan_optimism_api_key,
                native_token="ETH",
            ),
        }

    def get_chain_config(self, chain_id: int) -> ChainConfig | None:
        """获取指定链的配置"""
        return self.get_chain_configs().get(chain_id)


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
        _settings.rag_base_url = RAG_BASE_URL
        _settings.rag_model = RAG_MODEL
        _settings.rag_api_key = RAG_API_KEY
        _settings.rag_timeout_s = RAG_TIMEOUT_S
    return _settings
