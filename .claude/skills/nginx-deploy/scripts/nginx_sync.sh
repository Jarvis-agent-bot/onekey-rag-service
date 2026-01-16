#!/usr/bin/env bash
set -euo pipefail

# 同步 Nginx 配置并热加载
# 用法：./nginx_sync.sh /opt/onekey-rag-service/deploy/nginx.conf.example [onekey-rag.conf]

SOURCE_PATH="${1:-}"
TARGET_NAME="${2:-onekey-rag.conf}"

if [[ -z "$SOURCE_PATH" ]]; then
  echo "用法: $0 <nginx.conf.example 路径> [target_name]" >&2
  exit 1
fi

if [[ ! -f "$SOURCE_PATH" ]]; then
  echo "未找到配置文件: $SOURCE_PATH" >&2
  exit 1
fi

TARGET_PATH="/etc/nginx/sites-available/${TARGET_NAME}"
LINK_PATH="/etc/nginx/sites-enabled/${TARGET_NAME}"

sudo cp "$SOURCE_PATH" "$TARGET_PATH"
sudo ln -sf "$TARGET_PATH" "$LINK_PATH"

sudo nginx -t
sudo systemctl reload nginx

echo "[OK] 已同步并重载 Nginx: $TARGET_PATH"
