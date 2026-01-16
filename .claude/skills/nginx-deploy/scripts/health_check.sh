#!/usr/bin/env bash
set -euo pipefail

# onekey-rag-service 健康检查脚本
# 用法：./health_check.sh [--host 127.0.0.1] [--rag-port 8000] [--tx-port 8001]

HOST="127.0.0.1"
RAG_PORT="8000"
TX_PORT="8001"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      HOST="$2"
      shift 2
      ;;
    --rag-port)
      RAG_PORT="$2"
      shift 2
      ;;
    --tx-port)
      TX_PORT="$2"
      shift 2
      ;;
    *)
      echo "未知参数: $1" >&2
      exit 1
      ;;
  esac
done

check() {
  local name="$1"
  local url="$2"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" "$url" || true)
  if [[ "$code" == "200" ]]; then
    echo "[OK] $name -> $url (200)"
  else
    echo "[FAIL] $name -> $url ($code)"
  fi
}

check "RAG /healthz" "http://${HOST}:${RAG_PORT}/healthz"
check "TX /healthz" "http://${HOST}:${TX_PORT}/healthz"
