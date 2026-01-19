"""
数据库模型
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _generate_uuid() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class DefiProject(Base):
    """
    DeFi 项目表
    """
    __tablename__ = "defi_projects"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_defi_projects_slug"),
        {"schema": "defi_rating"},
    )

    id: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
        default=_generate_uuid
    )

    # 基本信息
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contract_address: Mapped[str | None] = mapped_column(String(42), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # DefiLlama 协议 ID
    defillama_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    # 代币信息
    tokens: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # 评分数据
    overall_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    risk_level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    score_details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    risk_warnings: Mapped[list | None] = mapped_column(JSON, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # TVL 数据
    tvl: Mapped[Decimal | None] = mapped_column(Numeric(precision=20, scale=2), nullable=True)
    tvl_updated_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # 状态
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # 来源链接
    source_links: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # 时间戳
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        default=dt.datetime.utcnow
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        default=dt.datetime.utcnow,
        onupdate=dt.datetime.utcnow
    )
