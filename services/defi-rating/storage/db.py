"""
数据库连接管理
"""

import logging
from typing import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from config import Settings

logger = logging.getLogger(__name__)

# 全局变量
_engine = None
_SessionLocal = None
_schema = None


def init_db(settings: Settings) -> None:
    """初始化数据库连接"""
    global _engine, _SessionLocal, _schema

    _schema = settings.database_schema

    _engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )

    _SessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=_engine,
    )

    # 创建 schema (如果不存在)
    with _engine.connect() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {_schema}"))
        conn.commit()
        logger.info(f"Schema '{_schema}' 已就绪")

    # 创建表
    from storage.models import Base
    Base.metadata.create_all(bind=_engine)

    logger.info("数据库初始化完成")


def close_db() -> None:
    """关闭数据库连接"""
    global _engine
    if _engine:
        _engine.dispose()
        logger.info("数据库连接已关闭")


def get_db() -> Generator[Session, None, None]:
    """获取数据库会话"""
    if _SessionLocal is None:
        raise RuntimeError("数据库未初始化")

    db = _SessionLocal()
    try:
        # 设置 search_path 到指定 schema
        if _schema:
            db.execute(text(f"SET search_path TO {_schema}"))
        yield db
    finally:
        db.close()


def get_schema() -> str:
    """获取当前 schema 名称"""
    return _schema or "defi_rating"
