"""
DeFi 评分服务
"""

from __future__ import annotations

import datetime as dt
import logging
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from api.schemas import (
    CategoryInfo,
    CategoryListResponse,
    ProjectCreate,
    ProjectListItem,
    ProjectListResponse,
    ProjectUpdate,
    ScoreUpdate,
    StatsResponse,
    TVLSyncResponse,
    TVLSyncResult,
    CATEGORIES,
    CATEGORY_LABELS,
    get_risk_level,
)
from integrations.defillama import DefiLlamaClient
from storage.models import DefiProject

logger = logging.getLogger(__name__)


class DefiService:
    """DeFi 评分服务"""

    def __init__(self, db: Session):
        self.db = db
        self._defillama: DefiLlamaClient | None = None

    @property
    def defillama(self) -> DefiLlamaClient:
        if self._defillama is None:
            self._defillama = DefiLlamaClient()
        return self._defillama

    # ============ CRUD ============

    def create_project(self, data: ProjectCreate) -> DefiProject:
        """创建项目"""
        existing = self.db.execute(
            select(DefiProject).where(DefiProject.slug == data.slug)
        ).scalar_one_or_none()

        if existing:
            raise ValueError(f"项目 slug '{data.slug}' 已存在")

        project = DefiProject(
            name=data.name,
            slug=data.slug,
            category=data.category,
            logo_url=data.logo_url,
            website=data.website,
            contract_address=data.contract_address,
            description=data.description,
            defillama_id=data.defillama_id,
            tokens=[t.model_dump() for t in data.tokens] if data.tokens else None,
        )

        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)

        logger.info(f"创建项目: {project.name}")
        return project

    def get_project(self, project_id: str) -> DefiProject | None:
        return self.db.get(DefiProject, project_id)

    def get_project_by_slug(self, slug: str) -> DefiProject | None:
        return self.db.execute(
            select(DefiProject).where(DefiProject.slug == slug)
        ).scalar_one_or_none()

    def update_project(self, project_id: str, data: ProjectUpdate) -> DefiProject:
        project = self.get_project(project_id)
        if not project:
            raise ValueError("项目不存在")

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            if key == "tokens" and value is not None:
                value = [t.model_dump() if hasattr(t, "model_dump") else t for t in value]
            setattr(project, key, value)

        project.updated_at = dt.datetime.utcnow()
        self.db.commit()
        self.db.refresh(project)

        logger.info(f"更新项目: {project.name}")
        return project

    def delete_project(self, project_id: str) -> bool:
        project = self.get_project(project_id)
        if not project:
            return False

        self.db.delete(project)
        self.db.commit()

        logger.info(f"删除项目: {project.name}")
        return True

    def publish_project(self, project_id: str) -> DefiProject:
        project = self.get_project(project_id)
        if not project:
            raise ValueError("项目不存在")

        project.status = "published"
        project.updated_at = dt.datetime.utcnow()
        self.db.commit()
        self.db.refresh(project)

        return project

    # ============ 评分 ============

    def update_score(self, project_id: str, data: ScoreUpdate) -> DefiProject:
        project = self.get_project(project_id)
        if not project:
            raise ValueError("项目不存在")

        update_data = data.model_dump(exclude_unset=True)

        if "score_details" in update_data and update_data["score_details"]:
            score_details = {}
            for key, detail in update_data["score_details"].items():
                if hasattr(detail, "model_dump"):
                    score_details[key] = detail.model_dump()
                else:
                    score_details[key] = detail
            update_data["score_details"] = score_details

        if "source_links" in update_data and update_data["source_links"]:
            source_links = []
            for link in update_data["source_links"]:
                if hasattr(link, "model_dump"):
                    source_links.append(link.model_dump())
                else:
                    source_links.append(link)
            update_data["source_links"] = source_links

        for key, value in update_data.items():
            setattr(project, key, value)

        # 自动计算风险等级
        if project.overall_score is not None:
            project.risk_level = get_risk_level(project.overall_score)

        project.updated_at = dt.datetime.utcnow()
        self.db.commit()
        self.db.refresh(project)

        logger.info(f"更新评分: {project.name} - {project.overall_score}")
        return project

    # ============ 列表查询 ============

    def list_projects(
        self,
        category: str | None = None,
        status: str | None = None,
        risk_level: str | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> ProjectListResponse:
        query = select(DefiProject)

        if category:
            query = query.where(DefiProject.category == category)
        if status:
            query = query.where(DefiProject.status == status)
        if risk_level:
            query = query.where(DefiProject.risk_level == risk_level)
        if search:
            pattern = f"%{search}%"
            query = query.where(
                or_(
                    DefiProject.name.ilike(pattern),
                    DefiProject.slug.ilike(pattern),
                    DefiProject.description.ilike(pattern),
                )
            )

        # 计算总数
        count_query = select(func.count()).select_from(query.subquery())
        total = self.db.execute(count_query).scalar() or 0

        # 排序和分页
        query = query.order_by(DefiProject.display_order, DefiProject.created_at.desc())
        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        projects = self.db.execute(query).scalars().all()
        items = [ProjectListItem.from_orm(p) for p in projects]
        total_pages = (total + page_size - 1) // page_size

        return ProjectListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    def list_published_projects(
        self,
        category: str | None = None,
        featured_only: bool = False,
        search: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> ProjectListResponse:
        query = select(DefiProject).where(DefiProject.status == "published")

        if category:
            query = query.where(DefiProject.category == category)
        if featured_only:
            query = query.where(DefiProject.is_featured == True)
        if search:
            pattern = f"%{search}%"
            query = query.where(
                or_(
                    DefiProject.name.ilike(pattern),
                    DefiProject.slug.ilike(pattern),
                )
            )

        count_query = select(func.count()).select_from(query.subquery())
        total = self.db.execute(count_query).scalar() or 0

        query = query.order_by(DefiProject.display_order, DefiProject.overall_score.desc().nullslast())
        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        projects = self.db.execute(query).scalars().all()
        items = [ProjectListItem.from_orm(p) for p in projects]
        total_pages = (total + page_size - 1) // page_size

        return ProjectListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    def search_projects(self, query: str, limit: int = 10) -> list[ProjectListItem]:
        pattern = f"%{query}%"
        stmt = (
            select(DefiProject)
            .where(
                and_(
                    DefiProject.status == "published",
                    or_(
                        DefiProject.name.ilike(pattern),
                        DefiProject.slug.ilike(pattern),
                    ),
                )
            )
            .order_by(DefiProject.overall_score.desc().nullslast())
            .limit(limit)
        )

        projects = self.db.execute(stmt).scalars().all()
        return [ProjectListItem.from_orm(p) for p in projects]

    # ============ 统计 ============

    def get_categories(self) -> CategoryListResponse:
        query = (
            select(
                DefiProject.category,
                func.count(DefiProject.id).label("count"),
            )
            .where(DefiProject.status == "published")
            .group_by(DefiProject.category)
        )

        results = self.db.execute(query).all()
        counts = {r[0]: r[1] for r in results}

        categories = [
            CategoryInfo(
                id=cat_id,
                label=CATEGORY_LABELS.get(cat_id, cat_id),
                count=counts.get(cat_id, 0),
            )
            for cat_id in CATEGORIES
        ]

        return CategoryListResponse(categories=categories)

    def get_stats(self) -> StatsResponse:
        total = self.db.execute(select(func.count(DefiProject.id))).scalar() or 0
        published = self.db.execute(
            select(func.count(DefiProject.id)).where(DefiProject.status == "published")
        ).scalar() or 0
        featured = self.db.execute(
            select(func.count(DefiProject.id)).where(DefiProject.is_featured == True)
        ).scalar() or 0

        total_tvl_decimal = self.db.execute(
            select(func.sum(DefiProject.tvl)).where(DefiProject.status == "published")
        ).scalar()
        total_tvl = float(total_tvl_decimal) if total_tvl_decimal else None

        def format_tvl(tvl):
            if tvl is None:
                return None
            if tvl >= 1_000_000_000:
                return f"${tvl / 1_000_000_000:.2f}B"
            elif tvl >= 1_000_000:
                return f"${tvl / 1_000_000:.2f}M"
            return f"${tvl:,.2f}"

        categories = self.get_categories().categories

        risk_query = (
            select(
                DefiProject.risk_level,
                func.count(DefiProject.id).label("count"),
            )
            .where(
                and_(
                    DefiProject.status == "published",
                    DefiProject.risk_level.isnot(None),
                )
            )
            .group_by(DefiProject.risk_level)
        )
        risk_results = self.db.execute(risk_query).all()
        risk_distribution = {r[0]: r[1] for r in risk_results}

        return StatsResponse(
            total_projects=total,
            published_projects=published,
            featured_projects=featured,
            total_tvl=total_tvl,
            total_tvl_formatted=format_tvl(total_tvl),
            category_stats=categories,
            risk_distribution=risk_distribution,
        )

    # ============ TVL 同步 ============

    async def sync_project_tvl(self, project_id: str) -> dict:
        project = self.get_project(project_id)
        if not project:
            return {"success": False, "error": "项目不存在"}

        if not project.defillama_id:
            return {"success": False, "error": "未设置 DefiLlama ID"}

        try:
            tvl = await self.defillama.get_protocol_tvl(project.defillama_id)

            if tvl is not None:
                project.tvl = tvl
                project.tvl_updated_at = dt.datetime.utcnow()
                project.updated_at = dt.datetime.utcnow()
                self.db.commit()

                logger.info(f"同步 TVL: {project.name} = ${tvl:,.2f}")
                return {
                    "success": True,
                    "project_id": project.id,
                    "tvl": float(tvl),
                }
            else:
                return {"success": False, "error": "无法获取 TVL"}
        except Exception as e:
            logger.error(f"同步 TVL 失败: {project.name} - {e}")
            return {"success": False, "error": str(e)}

    async def sync_all_tvl(self) -> TVLSyncResponse:
        projects = self.db.execute(
            select(DefiProject).where(DefiProject.defillama_id.isnot(None))
        ).scalars().all()

        results = []
        synced = 0
        failed = 0

        for project in projects:
            try:
                tvl = await self.defillama.get_protocol_tvl(project.defillama_id)

                if tvl is not None:
                    project.tvl = tvl
                    project.tvl_updated_at = dt.datetime.utcnow()
                    synced += 1
                    results.append(TVLSyncResult(
                        project_id=project.id,
                        project_name=project.name,
                        defillama_id=project.defillama_id,
                        tvl=float(tvl),
                        success=True,
                        error=None,
                    ))
                else:
                    failed += 1
                    results.append(TVLSyncResult(
                        project_id=project.id,
                        project_name=project.name,
                        defillama_id=project.defillama_id,
                        tvl=None,
                        success=False,
                        error="无法获取 TVL",
                    ))
            except Exception as e:
                failed += 1
                results.append(TVLSyncResult(
                    project_id=project.id,
                    project_name=project.name,
                    defillama_id=project.defillama_id,
                    tvl=None,
                    success=False,
                    error=str(e),
                ))

        self.db.commit()

        return TVLSyncResponse(synced=synced, failed=failed, results=results)

    # ============ 初始化数据 ============

    def init_sample_data(self) -> int:
        """初始化示例数据"""
        from storage.sample_data import SAMPLE_PROJECTS

        count = 0
        for data in SAMPLE_PROJECTS:
            existing = self.db.execute(
                select(DefiProject).where(DefiProject.slug == data["slug"])
            ).scalar_one_or_none()

            if existing:
                continue

            project = DefiProject(**data)
            project.risk_level = get_risk_level(data.get("overall_score"))
            self.db.add(project)
            count += 1

        self.db.commit()
        logger.info(f"初始化了 {count} 个示例项目")
        return count
