#!/bin/bash
# OneKey RAG Service 启动脚本
# 用法: ./deploy/start.sh [profile]
# 示例:
#   ./deploy/start.sh                    # 启动基础服务
#   ./deploy/start.sh tx-analyzer        # 启动 TX Analyzer
#   ./deploy/start.sh defi-rating        # 启动 DeFi Rating
#   ./deploy/start.sh frontend           # 启动前端开发服务
#   ./deploy/start.sh all                # 启动所有服务

set -e

cd "$(dirname "$0")/.."

PROFILE="${1:-}"

echo "🧹 清理残留容器和网络..."
docker compose down --remove-orphans 2>/dev/null || true
docker network prune -f

echo "🚀 启动服务..."
case "$PROFILE" in
  "tx-analyzer")
    docker compose --profile tx-analyzer up -d --build
    ;;
  "defi-rating")
    docker compose --profile defi-rating up -d --build
    ;;
  "frontend")
    docker compose --profile frontend up -d --build
    ;;
  "all")
    docker compose --profile frontend --profile tx-analyzer --profile defi-rating up -d --build
    ;;
  "")
    docker compose up -d --build
    ;;
  *)
    echo "❌ 未知的 profile: $PROFILE"
    echo "可用选项: tx-analyzer, defi-rating, frontend, all, 或留空启动基础服务"
    exit 1
    ;;
esac

echo "✅ 启动完成！"
echo ""
echo "📊 服务状态:"
docker compose ps
