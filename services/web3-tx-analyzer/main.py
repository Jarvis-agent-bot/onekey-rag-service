from __future__ import annotations

import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api import router
from analyzer import TxParser
from clients import RAGClient
from config import Settings, get_settings
from logging import configure_logging, get_logger
from storage import RedisCache, create_engine_and_session, ensure_schema

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    settings: Settings = get_settings()

    # 配置日志
    configure_logging(settings.log_level, settings.log_format)
    logger.info(
        "app_starting",
        env=settings.app_env,
        port=settings.port,
    )

    # 初始化数据库
    try:
        ensure_schema(settings.database_url, settings.database_schema)
        create_engine_and_session(settings.database_url, settings.database_schema)
        logger.info("database_initialized", schema=settings.database_schema)
    except Exception as e:
        logger.error("database_init_error", error=str(e))

    # 初始化 Redis 缓存
    cache: RedisCache | None = None
    try:
        cache = RedisCache(settings.redis_url)
        await cache.connect()
        app.state.cache = cache
        logger.info("redis_connected")
    except Exception as e:
        logger.warning("redis_connect_error", error=str(e))
        app.state.cache = None

    # 初始化解析器
    parser = TxParser(settings=settings, cache=cache)
    app.state.parser = parser
    logger.info("parser_initialized")

    # 初始化 RAG 客户端
    rag_client = RAGClient(
        base_url=settings.rag_base_url,
        model=settings.rag_model,
        api_key=settings.rag_api_key,
        timeout=settings.rag_timeout_s,
    )
    app.state.rag_client = rag_client
    logger.info("rag_client_initialized", base_url=settings.rag_base_url, model=settings.rag_model)

    # 保存 settings
    app.state.settings = settings

    logger.info("app_started")

    yield

    # 清理资源
    if cache:
        await cache.close()
        logger.info("redis_disconnected")

    logger.info("app_stopped")


def create_app() -> FastAPI:
    """创建 FastAPI 应用"""
    app = FastAPI(
        title="Web3 Transaction Analyzer",
        description="Web3 交易解析与分析服务",
        version="1.0.0",
        lifespan=lifespan,
    )

    # CORS 中间件
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 异常处理
    @app.exception_handler(Exception)
    async def global_exception_handler(request, exc):
        logger.exception("unhandled_exception", path=request.url.path, error=str(exc))
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "message": "Internal server error",
                    "type": "internal_error",
                }
            },
        )

    # 注册路由
    app.include_router(router)

    return app


app = create_app()


if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=settings.app_env == "local",
        log_level=settings.log_level.lower(),
    )
