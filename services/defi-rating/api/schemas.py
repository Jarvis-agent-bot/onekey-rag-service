"""
API 请求响应模型
"""

from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field, field_validator
import re


# ============ 常量 ============

CATEGORIES = [
    "liquid-staking",
    "restaking",
    "lending",
    "dex",
    "dex-aggregator",
    "yield",
    "derivatives",
    "stablecoin",
    "bridge",
    "cdp",
]

CATEGORY_LABELS = {
    "liquid-staking": "流动性质押",
    "restaking": "再质押",
    "lending": "借贷协议",
    "dex": "去中心化交易所",
    "dex-aggregator": "DEX 聚合器",
    "yield": "收益优化",
    "derivatives": "衍生品",
    "stablecoin": "稳定币",
    "bridge": "跨链桥",
    "cdp": "CDP/抵押借贷",
}

RISK_LEVELS = ["low", "medium", "high", "critical"]

RISK_LABELS = {
    "low": "低风险",
    "medium": "中风险",
    "high": "高风险",
    "critical": "极高风险",
}

RISK_COLORS = {
    "low": "#22c55e",
    "medium": "#eab308",
    "high": "#f97316",
    "critical": "#ef4444",
}


# ============ 基础模型 ============

class TokenInfo(BaseModel):
    symbol: str
    address: str | None = None


class ScoreDetail(BaseModel):
    score: int = Field(..., ge=0, le=100)
    weight: int = Field(..., ge=0, le=100)
    factors: list[str] = Field(default_factory=list)


class SourceLink(BaseModel):
    type: str
    title: str
    url: str


# ============ 请求模型 ============

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=100)
    category: str
    logo_url: str | None = None
    website: str | None = None
    contract_address: str | None = None
    description: str | None = None
    defillama_id: str | None = None
    tokens: list[TokenInfo] | None = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", v):
            raise ValueError("slug 必须是小写字母、数字和连字符")
        return v

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in CATEGORIES:
            raise ValueError(f"无效分类，必须是: {CATEGORIES}")
        return v


class ProjectUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    logo_url: str | None = None
    website: str | None = None
    contract_address: str | None = None
    description: str | None = None
    defillama_id: str | None = None
    tokens: list[TokenInfo] | None = None
    status: str | None = None
    is_featured: bool | None = None
    display_order: int | None = None


class ScoreUpdate(BaseModel):
    overall_score: int | None = Field(None, ge=0, le=100)
    score_details: dict[str, ScoreDetail] | None = None
    risk_warnings: list[str] | None = None
    summary: str | None = None
    source_links: list[SourceLink] | None = None


# ============ 响应模型 ============

class ProjectResponse(BaseModel):
    id: str
    name: str
    slug: str
    category: str
    category_label: str
    logo_url: str | None
    website: str | None
    contract_address: str | None
    description: str | None
    defillama_id: str | None
    tokens: list[TokenInfo] | None

    overall_score: int | None
    risk_level: str | None
    risk_level_label: str | None
    risk_level_color: str | None
    score_details: dict[str, Any] | None
    risk_warnings: list[str] | None
    summary: str | None

    tvl: float | None
    tvl_formatted: str | None
    tvl_updated_at: datetime | None

    status: str
    is_featured: bool
    display_order: int

    source_links: list[SourceLink] | None

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    @classmethod
    def from_orm(cls, obj) -> "ProjectResponse":
        tvl_float = float(obj.tvl) if obj.tvl else None
        return cls(
            id=obj.id,
            name=obj.name,
            slug=obj.slug,
            category=obj.category,
            category_label=CATEGORY_LABELS.get(obj.category, obj.category),
            logo_url=obj.logo_url,
            website=obj.website,
            contract_address=obj.contract_address,
            description=obj.description,
            defillama_id=obj.defillama_id,
            tokens=[TokenInfo(**t) for t in obj.tokens] if obj.tokens else None,
            overall_score=obj.overall_score,
            risk_level=obj.risk_level,
            risk_level_label=RISK_LABELS.get(obj.risk_level) if obj.risk_level else None,
            risk_level_color=RISK_COLORS.get(obj.risk_level) if obj.risk_level else None,
            score_details=obj.score_details,
            risk_warnings=obj.risk_warnings,
            summary=obj.summary,
            tvl=tvl_float,
            tvl_formatted=format_tvl(tvl_float),
            tvl_updated_at=obj.tvl_updated_at,
            status=obj.status,
            is_featured=obj.is_featured,
            display_order=obj.display_order,
            source_links=[SourceLink(**s) for s in obj.source_links] if obj.source_links else None,
            created_at=obj.created_at,
            updated_at=obj.updated_at,
        )


class ProjectListItem(BaseModel):
    id: str
    name: str
    slug: str
    category: str
    category_label: str
    logo_url: str | None
    overall_score: int | None
    risk_level: str | None
    risk_level_label: str | None
    risk_level_color: str | None
    tvl: float | None
    tvl_formatted: str | None
    is_featured: bool

    @classmethod
    def from_orm(cls, obj) -> "ProjectListItem":
        tvl_float = float(obj.tvl) if obj.tvl else None
        return cls(
            id=obj.id,
            name=obj.name,
            slug=obj.slug,
            category=obj.category,
            category_label=CATEGORY_LABELS.get(obj.category, obj.category),
            logo_url=obj.logo_url,
            overall_score=obj.overall_score,
            risk_level=obj.risk_level,
            risk_level_label=RISK_LABELS.get(obj.risk_level) if obj.risk_level else None,
            risk_level_color=RISK_COLORS.get(obj.risk_level) if obj.risk_level else None,
            tvl=tvl_float,
            tvl_formatted=format_tvl(tvl_float),
            is_featured=obj.is_featured,
        )


class ProjectListResponse(BaseModel):
    items: list[ProjectListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class CategoryInfo(BaseModel):
    id: str
    label: str
    count: int


class CategoryListResponse(BaseModel):
    categories: list[CategoryInfo]


class StatsResponse(BaseModel):
    total_projects: int
    published_projects: int
    featured_projects: int
    total_tvl: float | None
    total_tvl_formatted: str | None
    category_stats: list[CategoryInfo]
    risk_distribution: dict[str, int]


class TVLSyncResult(BaseModel):
    project_id: str
    project_name: str
    defillama_id: str | None
    tvl: float | None
    success: bool
    error: str | None


class TVLSyncResponse(BaseModel):
    synced: int
    failed: int
    results: list[TVLSyncResult]


# ============ 辅助函数 ============

def format_tvl(tvl: float | None) -> str | None:
    if tvl is None:
        return None
    if tvl >= 1_000_000_000:
        return f"${tvl / 1_000_000_000:.2f}B"
    elif tvl >= 1_000_000:
        return f"${tvl / 1_000_000:.2f}M"
    elif tvl >= 1_000:
        return f"${tvl / 1_000:.2f}K"
    return f"${tvl:.2f}"


def get_risk_level(score: int | None) -> str | None:
    if score is None:
        return None
    if score >= 80:
        return "low"
    elif score >= 60:
        return "medium"
    elif score >= 40:
        return "high"
    return "critical"
