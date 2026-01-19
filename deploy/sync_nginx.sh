#!/usr/bin/env bash
set -euo pipefail

# Nginx 配置同步脚本 - 直接在服务器上运行
# 用法：cd /opt/onekey-rag-service && bash deploy/sync_nginx.sh

PROJECT_ROOT="/opt/onekey-rag-service"
SOURCE_PATH="$PROJECT_ROOT/deploy/nginx.conf.example"
TARGET_NAME="onekey-rag.conf"
TARGET_PATH="/etc/nginx/sites-available/${TARGET_NAME}"
LINK_PATH="/etc/nginx/sites-enabled/${TARGET_NAME}"
BACKUP_PATH="${TARGET_PATH}.bak.$(date +%Y%m%d%H%M%S)"

echo "=========================================="
echo "  Nginx 配置同步脚本"
echo "=========================================="
echo "源文件: $SOURCE_PATH"
echo "目标:   $TARGET_PATH"
echo ""

# 检查源文件
if [[ ! -f "$SOURCE_PATH" ]]; then
  echo "[ERROR] 未找到配置文件: $SOURCE_PATH" >&2
  exit 1
fi

# 备份现有配置
if [[ -f "$TARGET_PATH" ]]; then
  echo "[INFO] 备份现有配置到: $BACKUP_PATH"
  cp "$TARGET_PATH" "$BACKUP_PATH"
fi

# 复制新配置
cp "$SOURCE_PATH" "$TARGET_PATH"
echo "[INFO] 已复制配置到: $TARGET_PATH"

# 创建软链接
ln -sf "$TARGET_PATH" "$LINK_PATH"
echo "[INFO] 已创建软链接: $LINK_PATH"

# 测试配置
echo ""
echo "[INFO] 测试 Nginx 配置..."
if nginx -t; then
  echo ""
  echo "[INFO] 重载 Nginx..."
  systemctl reload nginx
  echo ""
  echo "=========================================="
  echo "[OK] Nginx 配置同步成功！"
  echo "=========================================="
else
  echo ""
  echo "[ERROR] Nginx 配置测试失败，正在回滚..."
  if [[ -f "$BACKUP_PATH" ]]; then
    cp "$BACKUP_PATH" "$TARGET_PATH"
    echo "[INFO] 已回滚到备份配置"
  fi
  exit 1
fi
