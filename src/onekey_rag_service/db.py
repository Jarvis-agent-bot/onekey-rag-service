from __future__ import annotations

import logging

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from onekey_rag_service.config import Settings

logger = logging.getLogger(__name__)


def create_db_engine(settings: Settings) -> Engine:
    return create_engine(settings.database_url, pool_pre_ping=True)


def create_session_factory(engine: Engine) -> sessionmaker:
    return sessionmaker(bind=engine, autocommit=False, autoflush=False)


def ensure_pgvector_extension(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))


def ensure_indexes(engine: Engine, settings: Settings) -> None:
    if not settings.auto_create_indexes:
        return

    _ensure_embedding_dimension(engine, settings)
    _ensure_pgvector_index(engine, settings)
    _ensure_fts_index(engine, settings)


def _ensure_embedding_dimension(engine: Engine, settings: Settings) -> None:
    """
    兼容历史库：早期 embedding 列可能是 vector（无维度）。
    pgvector 的 HNSW/IVFFLAT 索引要求列类型带维度（vector(n)）。
    """

    with engine.begin() as conn:
        try:
            row = conn.execute(
                text(
                    """
                    SELECT format_type(a.atttypid, a.atttypmod) AS t
                    FROM pg_attribute a
                    JOIN pg_class c ON c.oid = a.attrelid
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE c.relname = 'chunks'
                      AND a.attname = 'embedding'
                      AND a.attnum > 0
                      AND NOT a.attisdropped
                    LIMIT 1
                    """
                )
            ).first()
            col_type = str(row[0]) if row and row[0] else ""
        except Exception as e:
            logger.warning("读取 chunks.embedding 列类型失败：%s", e)
            return

        dim = int(settings.pgvector_embedding_dim)

        # 仅在“无维度 vector”时自动修复
        if col_type == "vector":
            try:
                conn.execute(
                    text(
                        f"""
                        ALTER TABLE chunks
                        ALTER COLUMN embedding
                        TYPE vector({dim})
                        USING embedding::vector({dim})
                        """
                    )
                )
                logger.info("已自动修复 chunks.embedding 为 vector(%s)", dim)
            except Exception as e:
                logger.warning(
                    "自动修复 chunks.embedding 维度失败（可能需要清空并重建向量列/重建 pgdata）：%s",
                    e,
                )
        elif col_type.startswith("vector(") and col_type.endswith(")"):
            # 若维度不一致，提醒用户重建索引/重建数据
            try:
                current_dim = int(col_type[len("vector(") : -1])
                if current_dim != dim:
                    logger.warning(
                        "当前库 chunks.embedding=%s 与 PGVECTOR_EMBEDDING_DIM=%s 不一致；请重建向量数据/重建 pgdata 以避免检索异常",
                        col_type,
                        dim,
                    )
            except Exception:
                pass


def _ensure_pgvector_index(engine: Engine, settings: Settings) -> None:
    index_type = (settings.pgvector_index_type or "none").lower()
    if index_type in {"none", "off", "false", "0"}:
        return

    with engine.begin() as conn:
        try:
            if index_type == "hnsw":
                conn.execute(
                    text(
                        """
                        CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
                        ON chunks
                        USING hnsw (embedding vector_cosine_ops)
                        WITH (m = :m, ef_construction = :efc)
                        """
                    ),
                    {"m": int(settings.pgvector_hnsw_m), "efc": int(settings.pgvector_hnsw_ef_construction)},
                )
            elif index_type == "ivfflat":
                conn.execute(
                    text(
                        """
                        CREATE INDEX IF NOT EXISTS idx_chunks_embedding_ivfflat
                        ON chunks
                        USING ivfflat (embedding vector_cosine_ops)
                        WITH (lists = :lists)
                        """
                    ),
                    {"lists": int(settings.pgvector_ivfflat_lists)},
                )
            else:
                logger.warning("未知 PGVECTOR_INDEX_TYPE=%s，已跳过建索引", settings.pgvector_index_type)
        except Exception as e:
            logger.warning("创建 pgvector 索引失败：%s", e)


def _ensure_fts_index(engine: Engine, settings: Settings) -> None:
    if (settings.retrieval_mode or "").lower() != "hybrid":
        return

    raw_cfg = (settings.bm25_fts_config or "simple").strip() or "simple"
    cfg = raw_cfg if all(ch.isalnum() or ch == "_" for ch in raw_cfg) else "simple"
    idx_name = f"idx_chunks_fts_{cfg.lower()}"

    with engine.begin() as conn:
        try:
            conn.execute(
                text(
                    f"""
                    CREATE INDEX IF NOT EXISTS {idx_name}
                    ON chunks
                    USING gin (to_tsvector('{cfg}', chunk_text))
                    """
                )
            )
        except Exception as e:
            logger.warning("创建 FTS(GIN) 索引失败：%s", e)
