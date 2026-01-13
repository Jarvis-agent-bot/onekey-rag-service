from __future__ import annotations

import logging
from typing import Any

from onekey_rag_service.config import Settings
from onekey_rag_service.utils import sha256_text

logger = logging.getLogger(__name__)


def build_langfuse_callback(
    settings: Settings,
    *,
    request_id: str | None = None,
    workspace_id: str | None = None,
    app_id: str | None = None,
    user_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    extra_tags: dict[str, str] | None = None,
):
    """
    构建 Langfuse 的 LangChain CallbackHandler，若配置缺失或导入失败则返回 None。
    """

    if not settings.langfuse_enabled:
        return None

    secret_key = (settings.langfuse_secret_key or "").strip()
    public_key = (settings.langfuse_public_key or "").strip()
    if not secret_key or not public_key:
        logger.debug("Langfuse 未配置公钥/私钥，跳过回调")
        return None

    try:
        from langfuse.callback import CallbackHandler  # type: ignore
    except Exception as e:  # pragma: no cover
        logger.warning("导入 Langfuse 失败，将跳过回调 err=%s", e)
        return None

    tags: list[str] = [f"env:{settings.app_env}", "service:onekey-rag"]
    if workspace_id:
        tags.append(f"ws:{workspace_id}")
    if app_id:
        tags.append(f"app:{app_id}")
    if extra_tags:
        for k, v in extra_tags.items():
            if not k:
                continue
            tags.append(f"{k}:{v}")

    meta: dict[str, Any] = {
        "request_id": request_id,
        "workspace_id": workspace_id,
        "app_id": app_id,
        "langfuse_project": settings.langfuse_project_name,
        "langfuse_dataset": settings.langfuse_dataset_name,
    }
    if user_id:
        meta["user_id_hash"] = sha256_text(user_id)
    if metadata:
        # 仅透传简单可序列化内容，避免将大对象放入 metadata
        for k, v in metadata.items():
            if isinstance(v, (str, int, float, bool)) or v is None:
                meta[k] = v

    try:
        handler = CallbackHandler(
            public_key=public_key,
            secret_key=secret_key,
            host=settings.langfuse_base_url,
            tags=tags,
            metadata=meta,
        )
    except Exception as e:  # pragma: no cover
        logger.warning("创建 Langfuse 回调失败，将跳过 err=%s", e)
        return None

    return handler
