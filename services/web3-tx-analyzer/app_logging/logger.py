from __future__ import annotations

import logging
import sys
from typing import Any

import structlog
from structlog.types import Processor


# 敏感字段列表
SENSITIVE_KEYS = {"api_key", "private_key", "password", "secret", "token", "authorization"}


def _mask_sensitive_data(data: Any, depth: int = 0) -> Any:
    """递归脱敏敏感数据"""
    if depth > 10:
        return data

    if isinstance(data, dict):
        return {
            k: "***MASKED***" if k.lower() in SENSITIVE_KEYS else _mask_sensitive_data(v, depth + 1)
            for k, v in data.items()
        }
    elif isinstance(data, list):
        return [_mask_sensitive_data(item, depth + 1) for item in data]
    return data


def _mask_sensitive_processor(
    logger: logging.Logger, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """structlog 处理器：脱敏敏感数据"""
    return _mask_sensitive_data(event_dict)


def _add_service_info(
    logger: logging.Logger, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """添加服务信息"""
    event_dict["service"] = "web3-tx-analyzer"
    return event_dict


def configure_logging(log_level: str = "INFO", log_format: str = "json") -> None:
    """配置日志系统"""

    # 设置标准库日志级别
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper(), logging.INFO),
    )

    # 共享处理器
    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        _add_service_info,
        _mask_sensitive_processor,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if log_format.lower() == "json":
        # JSON 格式（生产环境）
        structlog.configure(
            processors=shared_processors
            + [
                structlog.processors.format_exc_info,
                structlog.processors.JSONRenderer(),
            ],
            wrapper_class=structlog.make_filtering_bound_logger(
                getattr(logging, log_level.upper(), logging.INFO)
            ),
            context_class=dict,
            logger_factory=structlog.PrintLoggerFactory(),
            cache_logger_on_first_use=True,
        )
    else:
        # 人类可读格式（开发环境）
        structlog.configure(
            processors=shared_processors
            + [
                structlog.dev.ConsoleRenderer(colors=True),
            ],
            wrapper_class=structlog.make_filtering_bound_logger(
                getattr(logging, log_level.upper(), logging.INFO)
            ),
            context_class=dict,
            logger_factory=structlog.PrintLoggerFactory(),
            cache_logger_on_first_use=True,
        )


def get_logger(name: str | None = None) -> structlog.BoundLogger:
    """获取 logger 实例"""
    return structlog.get_logger(name)


def bind_context(**kwargs: Any) -> None:
    """绑定上下文变量到当前请求"""
    structlog.contextvars.bind_contextvars(**kwargs)


def clear_context() -> None:
    """清除当前请求的上下文变量"""
    structlog.contextvars.clear_contextvars()
