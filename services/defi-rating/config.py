"""
配置管理
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """应用配置"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # 应用配置
    app_env: str = Field(default="development", alias="APP_ENV")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    host: str = "0.0.0.0"
    port: int = Field(default=8002, alias="PORT")
    debug: bool = False

    # 数据库配置 (复用主数据库，使用独立 schema)
    database_url: str = Field(
        default="postgresql://postgres:postgres@localhost:5432/onekey_rag",
        alias="DATABASE_URL",
    )
    database_schema: str = Field(default="defi_rating", alias="DATABASE_SCHEMA")

    # DefiLlama API
    defillama_base_url: str = "https://api.llama.fi"
    defillama_timeout: float = 30.0

    # 缓存配置
    cache_ttl_seconds: int = 3600  # TVL 缓存 1 小时


@lru_cache
def get_settings() -> Settings:
    return Settings()
