# ==================== Stage 1: Build Admin UI ====================
FROM node:20-alpine AS frontend-builder

WORKDIR /build

# 启用 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 复制前端依赖文件
COPY frontend-admin/package.json frontend-admin/pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制前端源码并构建
COPY frontend-admin/ ./
RUN pnpm build

# ==================== Stage 2: Python Backend ====================
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/root/.cache/huggingface

ARG SENTENCE_TRANSFORMERS_MODEL=sentence-transformers/paraphrase-multilingual-mpnet-base-v2
ENV SENTENCE_TRANSFORMERS_MODEL=${SENTENCE_TRANSFORMERS_MODEL}

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY onekey_rag_service /app/onekey_rag_service

# 从第一阶段复制前端构建产物到静态目录
COPY --from=frontend-builder /build/dist /app/onekey_rag_service/static/admin

ENV PYTHONPATH=/app

EXPOSE 8000

CMD ["uvicorn", "onekey_rag_service.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
