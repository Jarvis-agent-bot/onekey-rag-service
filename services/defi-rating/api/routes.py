"""
DeFi 评分 API 路由
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from api.schemas import (
    ProjectCreate,
    ProjectUpdate,
    ScoreUpdate,
    ProjectResponse,
    ProjectListResponse,
    CategoryListResponse,
    StatsResponse,
    TVLSyncResponse,
)
from storage.db import get_db
from storage.service import DefiService

logger = logging.getLogger(__name__)

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> DefiService:
    """获取服务实例"""
    return DefiService(db=db)


# ============ 公开 API ============

@router.get("/v1/projects", response_model=ProjectListResponse, tags=["public"])
def list_projects(
    category: Annotated[str | None, Query(description="按分类筛选")] = None,
    featured: Annotated[bool | None, Query(description="只看推荐项目")] = None,
    search: Annotated[str | None, Query(description="搜索关键词")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
    service: DefiService = Depends(get_service),
):
    """获取已发布的 DeFi 项目列表"""
    return service.list_published_projects(
        category=category,
        featured_only=featured or False,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.get("/v1/projects/{slug}", response_model=ProjectResponse, tags=["public"])
def get_project(
    slug: str,
    service: DefiService = Depends(get_service),
):
    """获取项目详情"""
    project = service.get_project_by_slug(slug)
    if not project or project.status != "published":
        raise HTTPException(status_code=404, detail="项目不存在")
    return ProjectResponse.from_orm(project)


@router.get("/v1/categories", response_model=CategoryListResponse, tags=["public"])
def list_categories(service: DefiService = Depends(get_service)):
    """获取分类列表"""
    return service.get_categories()


@router.get("/v1/search", tags=["public"])
def search_projects(
    q: Annotated[str, Query(min_length=1)],
    limit: Annotated[int, Query(ge=1, le=20)] = 10,
    service: DefiService = Depends(get_service),
):
    """搜索项目"""
    return service.search_projects(q, limit=limit)


@router.get("/v1/stats", response_model=StatsResponse, tags=["public"])
def get_stats(service: DefiService = Depends(get_service)):
    """获取统计数据"""
    return service.get_stats()


# ============ 管理 API ============

@router.get("/admin/projects", response_model=ProjectListResponse, tags=["admin"])
def admin_list_projects(
    category: str | None = None,
    status: str | None = None,
    risk_level: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
    service: DefiService = Depends(get_service),
):
    """管理后台：获取所有项目"""
    return service.list_projects(
        category=category,
        status=status,
        risk_level=risk_level,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.post("/admin/projects", response_model=ProjectResponse, status_code=201, tags=["admin"])
def admin_create_project(
    data: ProjectCreate,
    service: DefiService = Depends(get_service),
):
    """管理后台：创建项目"""
    try:
        project = service.create_project(data)
        return ProjectResponse.from_orm(project)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/admin/projects/{project_id}", response_model=ProjectResponse, tags=["admin"])
def admin_get_project(
    project_id: str,
    service: DefiService = Depends(get_service),
):
    """管理后台：获取项目详情"""
    project = service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return ProjectResponse.from_orm(project)


@router.patch("/admin/projects/{project_id}", response_model=ProjectResponse, tags=["admin"])
def admin_update_project(
    project_id: str,
    data: ProjectUpdate,
    service: DefiService = Depends(get_service),
):
    """管理后台：更新项目"""
    try:
        project = service.update_project(project_id, data)
        return ProjectResponse.from_orm(project)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/admin/projects/{project_id}", status_code=204, tags=["admin"])
def admin_delete_project(
    project_id: str,
    service: DefiService = Depends(get_service),
):
    """管理后台：删除项目"""
    if not service.delete_project(project_id):
        raise HTTPException(status_code=404, detail="项目不存在")


@router.patch("/admin/projects/{project_id}/score", response_model=ProjectResponse, tags=["admin"])
def admin_update_score(
    project_id: str,
    data: ScoreUpdate,
    service: DefiService = Depends(get_service),
):
    """管理后台：更新评分"""
    try:
        project = service.update_score(project_id, data)
        return ProjectResponse.from_orm(project)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/admin/projects/{project_id}/publish", response_model=ProjectResponse, tags=["admin"])
def admin_publish_project(
    project_id: str,
    service: DefiService = Depends(get_service),
):
    """管理后台：发布项目"""
    try:
        project = service.publish_project(project_id)
        return ProjectResponse.from_orm(project)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/admin/projects/{project_id}/sync-tvl", tags=["admin"])
async def admin_sync_project_tvl(
    project_id: str,
    service: DefiService = Depends(get_service),
):
    """管理后台：同步单个项目 TVL"""
    result = await service.sync_project_tvl(project_id)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/admin/sync-tvl", response_model=TVLSyncResponse, tags=["admin"])
async def admin_sync_all_tvl(service: DefiService = Depends(get_service)):
    """管理后台：批量同步 TVL"""
    return await service.sync_all_tvl()


@router.post("/admin/init-sample-data", tags=["admin"])
def admin_init_sample_data(service: DefiService = Depends(get_service)):
    """管理后台：初始化示例数据"""
    count = service.init_sample_data()
    return {"message": f"已创建 {count} 个示例项目"}
