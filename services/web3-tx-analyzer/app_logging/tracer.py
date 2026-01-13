from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from .logger import get_logger

logger = get_logger(__name__)


@dataclass
class TraceStep:
    """单个追踪步骤"""

    step: int
    name: str
    started_at: str
    ended_at: str | None = None
    duration_ms: int | None = None
    status: str = "pending"  # pending / success / failed / skipped
    input: dict[str, Any] | None = None
    output: dict[str, Any] | None = None
    error: str | None = None
    metadata: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        """转换为字典"""
        result = {
            "step": self.step,
            "name": self.name,
            "started_at": self.started_at,
            "status": self.status,
        }
        if self.ended_at:
            result["ended_at"] = self.ended_at
        if self.duration_ms is not None:
            result["duration_ms"] = self.duration_ms
        if self.input:
            result["input"] = self.input
        if self.output:
            result["output"] = self.output
        if self.error:
            result["error"] = self.error
        if self.metadata:
            result["metadata"] = self.metadata
        return result


class Tracer:
    """请求追踪器"""

    def __init__(self, trace_id: str | None = None, chain_id: int | None = None, tx_hash: str | None = None):
        self.trace_id = trace_id or self._generate_trace_id()
        self.chain_id = chain_id
        self.tx_hash = tx_hash
        self.steps: list[TraceStep] = []
        self.started_at = datetime.now(timezone.utc)
        self._current_step: int = 0
        self._step_start_time: float | None = None

    @staticmethod
    def _generate_trace_id() -> str:
        """生成 trace ID"""
        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        short_uuid = uuid.uuid4().hex[:12]
        return f"tx-{date_str}-{short_uuid}"

    @staticmethod
    def _now_iso() -> str:
        """获取当前 ISO 时间"""
        return datetime.now(timezone.utc).isoformat()

    def start_step(
        self,
        name: str,
        input_data: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> TraceStep:
        """开始一个新步骤"""
        self._current_step += 1
        self._step_start_time = time.perf_counter()

        step = TraceStep(
            step=self._current_step,
            name=name,
            started_at=self._now_iso(),
            status="pending",
            input=input_data,
            metadata=metadata,
        )
        self.steps.append(step)

        logger.debug(
            "trace_step_started",
            trace_id=self.trace_id,
            step=self._current_step,
            name=name,
            input=input_data,
        )

        return step

    def end_step(
        self,
        status: str = "success",
        output_data: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> TraceStep | None:
        """结束当前步骤"""
        if not self.steps:
            return None

        step = self.steps[-1]
        step.ended_at = self._now_iso()
        step.status = status
        step.output = output_data
        step.error = error

        if self._step_start_time is not None:
            step.duration_ms = int((time.perf_counter() - self._step_start_time) * 1000)

        logger.debug(
            "trace_step_ended",
            trace_id=self.trace_id,
            step=step.step,
            name=step.name,
            status=status,
            duration_ms=step.duration_ms,
            output=output_data,
            error=error,
        )

        self._step_start_time = None
        return step

    def step(
        self,
        name: str,
        input_data: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ):
        """上下文管理器方式使用"""
        return _TracerStepContext(self, name, input_data, metadata)

    def get_total_duration_ms(self) -> int:
        """获取总耗时"""
        return int((datetime.now(timezone.utc) - self.started_at).total_seconds() * 1000)

    def to_dict(self) -> dict[str, Any]:
        """转换为字典"""
        return {
            "trace_id": self.trace_id,
            "chain_id": self.chain_id,
            "tx_hash": self.tx_hash,
            "started_at": self.started_at.isoformat(),
            "total_duration_ms": self.get_total_duration_ms(),
            "steps": [step.to_dict() for step in self.steps],
        }

    def get_steps_list(self) -> list[dict[str, Any]]:
        """获取步骤列表"""
        return [step.to_dict() for step in self.steps]

    def get_timings(self) -> dict[str, int]:
        """获取各步骤耗时汇总"""
        timings: dict[str, int] = {"total_ms": self.get_total_duration_ms()}
        for step in self.steps:
            if step.duration_ms is not None:
                timings[f"{step.name}_ms"] = step.duration_ms
        return timings


class _TracerStepContext:
    """Tracer 步骤上下文管理器"""

    def __init__(
        self,
        tracer: Tracer,
        name: str,
        input_data: dict[str, Any] | None,
        metadata: dict[str, Any] | None,
    ):
        self.tracer = tracer
        self.name = name
        self.input_data = input_data
        self.metadata = metadata
        self.output_data: dict[str, Any] | None = None
        self.error: str | None = None

    def __enter__(self):
        self.tracer.start_step(self.name, self.input_data, self.metadata)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.tracer.end_step(
                status="failed",
                output_data=self.output_data,
                error=str(exc_val),
            )
        else:
            self.tracer.end_step(
                status="success",
                output_data=self.output_data,
                error=self.error,
            )
        return False

    def set_output(self, output_data: dict[str, Any]) -> None:
        """设置输出数据"""
        self.output_data = output_data

    def set_error(self, error: str) -> None:
        """设置错误信息"""
        self.error = error
