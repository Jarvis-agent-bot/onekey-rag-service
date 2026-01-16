---
name: nginx-deploy
description: 管理 onekey-rag-service 的 Nginx 部署与运维技能。用于同步 Nginx 配置、检查反代状态、验证 HTTPS 与端口映射、排查 404/502/超时问题、回滚配置等场景。
---

# Nginx Deploy

## Overview

该技能用于 onekey-rag-service 的 Nginx 部署与运维，提供标准化的同步、验证与排障流程，并配套脚本提升执行效率。

## Workflow Decision Tree

- 同步或更新 Nginx 配置 -> 使用 `scripts/nginx_sync.sh`
- 验证反代与服务健康 -> 使用 `scripts/health_check.sh`
- 线上访问异常（404/502/超时） -> 参考 `references/nginx-troubleshooting.md`
- 需要回滚配置 -> 参考 `references/nginx-rollback.md`

## Quick Tasks

- 同步 Nginx 配置并热加载
- 检查 HTTP/HTTPS 与反代接口状态
- 排查常见故障与端口映射问题
- 回滚到上一版本配置

## Resources

- `scripts/nginx_sync.sh`：Nginx 配置同步脚本
- `scripts/health_check.sh`：健康检查脚本
- `references/nginx-troubleshooting.md`：常见问题与排障流程
- `references/nginx-rollback.md`：配置回滚流程
