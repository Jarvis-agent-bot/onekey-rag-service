#!/bin/bash
# OneKey RAG Service 停止脚本
# 用法: ./deploy/stop.sh [--clean]
# 示例:
#   ./deploy/stop.sh           # 停止所有服务
#   ./deploy/stop.sh --clean   # 停止并清理数据卷（慎用）

set -e

cd "$(dirname "$0")/.."

CLEAN="${1:-}"

echo "🛑 停止服务..."

if [ "$CLEAN" = "--clean" ]; then
  echo "⚠️  警告：将清理所有数据卷（数据库数据将丢失）"
  read -p "确认继续？(y/N) " confirm
  if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    docker compose --profile frontend --profile tx-analyzer down -v --remove-orphans
    docker network prune -f
    docker volume prune -f
    echo "✅ 服务已停止，数据卷已清理"
  else
    echo "❌ 已取消"
    exit 1
  fi
else
  docker compose --profile frontend --profile tx-analyzer down --remove-orphans
  docker network prune -f
  echo "✅ 服务已停止"
fi
