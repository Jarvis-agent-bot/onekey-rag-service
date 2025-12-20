"""
Langfuse 连接与写入自检脚本。

用法：
    LANGFUSE_PUBLIC_KEY=pk LANGFUSE_SECRET_KEY=sk LANGFUSE_BASE_URL=http://localhost:3000 \
    python examples/langfuse-verify.py
"""

from __future__ import annotations

import os
import time

from langfuse import Langfuse


def main() -> None:
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY")
    base_url = os.getenv("LANGFUSE_BASE_URL", "http://localhost:3000")
    if not public_key or not secret_key:
        raise SystemExit("请先设置 LANGFUSE_PUBLIC_KEY 与 LANGFUSE_SECRET_KEY 环境变量")

    lf = Langfuse(public_key=public_key, secret_key=secret_key, host=base_url)

    trace = lf.trace(
        name="langfuse-sanity-check",
        input={"question": "ping from onekey-rag-service"},
        metadata={"env": os.getenv("APP_ENV", "local")},
        tags=["env:" + os.getenv("APP_ENV", "local"), "service:onekey-rag"],
    )
    span = trace.span(name="retriever", input="ping", output="pong", metadata={"hit_count": 1})
    span.end()
    trace.event(name="completed", input="ping", output="pong", metadata={"latency_ms": 0})
    trace.end()

    lf.flush()
    print("已发送 sanity trace 到 Langfuse，稍后在 UI 检查是否可见。")


if __name__ == "__main__":
    main()
