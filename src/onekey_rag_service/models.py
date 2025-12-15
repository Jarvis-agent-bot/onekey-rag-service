from __future__ import annotations

import datetime as dt
import os

from pgvector.sqlalchemy import Vector
from dotenv import load_dotenv
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

load_dotenv()
_PGVECTOR_DIM = int(os.getenv("PGVECTOR_EMBEDDING_DIM", "768"))


class Base(DeclarativeBase):
    pass


class Page(Base):
    __tablename__ = "pages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    url: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    title: Mapped[str] = mapped_column(Text, default="", nullable=False)
    content_markdown: Mapped[str] = mapped_column(Text, default="", nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    indexed_content_hash: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    http_status: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_crawled_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=dt.datetime.utcnow)
    meta: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    chunks: Mapped[list["Chunk"]] = relationship(back_populates="page", cascade="all, delete-orphan")


class Chunk(Base):
    __tablename__ = "chunks"
    __table_args__ = (
        UniqueConstraint("page_id", "chunk_index", name="uq_chunks_page_chunk_index"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    page_id: Mapped[int] = mapped_column(ForeignKey("pages.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    section_path: Mapped[str] = mapped_column(Text, default="", nullable=False)
    chunk_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    chunk_hash: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    embedding: Mapped[list[float] | None] = mapped_column(Vector(_PGVECTOR_DIM), nullable=True)
    embedding_model: Mapped[str] = mapped_column(Text, default="", nullable=False)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=dt.datetime.utcnow)

    page: Mapped[Page] = relationship(back_populates="chunks")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    progress: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    error: Mapped[str] = mapped_column(Text, default="", nullable=False)
    started_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=dt.datetime.utcnow)
    finished_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Feedback(Base):
    __tablename__ = "feedback"
    __table_args__ = (
        # 企业级约束：同一 conversation/message 只保留一条反馈，避免重复插入
        UniqueConstraint("conversation_id", "message_id", name="uix_feedback_conversation_message"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[str] = mapped_column(String(128), default="", nullable=False, index=True)
    message_id: Mapped[str] = mapped_column(String(128), default="", nullable=False, index=True)
    rating: Mapped[str] = mapped_column(String(16), nullable=False)
    reason: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    comment: Mapped[str] = mapped_column(Text, default="", nullable=False)
    sources: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=dt.datetime.utcnow)
