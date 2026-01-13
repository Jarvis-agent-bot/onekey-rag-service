from __future__ import annotations

from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from .models import Base


_engine = None
_SessionLocal = None


def create_engine_and_session(database_url: str, schema: str = "tx_analyzer"):
    """创建数据库引擎和会话工厂"""
    global _engine, _SessionLocal

    _engine = create_engine(
        database_url,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        connect_args={"options": f"-c search_path={schema},public"},
    )
    _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

    return _engine, _SessionLocal


def ensure_schema(database_url: str, schema: str = "tx_analyzer") -> None:
    """确保 schema 和表存在"""
    engine = create_engine(database_url)

    with engine.connect() as conn:
        # 创建 schema
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
        conn.commit()

    # 设置 search_path 并创建表
    engine_with_schema = create_engine(
        database_url,
        connect_args={"options": f"-c search_path={schema},public"},
    )

    Base.metadata.create_all(bind=engine_with_schema)


def get_db() -> Generator[Session, None, None]:
    """获取数据库会话"""
    if _SessionLocal is None:
        raise RuntimeError("Database not initialized. Call create_engine_and_session first.")

    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """上下文管理器方式获取数据库会话"""
    if _SessionLocal is None:
        raise RuntimeError("Database not initialized. Call create_engine_and_session first.")

    db = _SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
