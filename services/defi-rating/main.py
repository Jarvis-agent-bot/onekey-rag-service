"""
DeFi 项目安全评分服务

独立的 FastAPI 微服务，提供 DeFi 项目评分查询和管理功能。
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import Settings, get_settings
from api.routes import router
from storage.db import init_db, close_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    settings = get_settings()
    logger.info(f"启动 DeFi Rating Service, env={settings.app_env}")

    # 初始化数据库
    init_db(settings)

    yield

    # 关闭数据库连接
    close_db()
    logger.info("DeFi Rating Service 已关闭")


app = FastAPI(
    title="DeFi Rating Service",
    description="DeFi 项目安全评分 API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(router)


@app.get("/healthz")
def healthz():
    """健康检查"""
    return {"status": "ok", "service": "defi-rating"}


if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.app_env == "development",
    )
