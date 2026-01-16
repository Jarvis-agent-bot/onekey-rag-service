# Nginx 常见问题与排障

## 404 Not Found

- 反代路径与后端路由不一致（例如 `/api/` 前缀缺失）
- 确认 Nginx `location` 与后端路由一致

## 502 Bad Gateway

- upstream 端口不可达或容器未启动
- 检查 `docker compose ps` 与 `docker compose logs`
- 检查 Nginx upstream 配置是否指向正确端口（如 8000/8001）

## 超时或连接失败

- 后端服务未启动或阻塞
- 检查服务健康 `/healthz`
- 检查容器内部连通性与 `RAG_BASE_URL`

## HSTS/HTTPS 异常

- 证书路径不正确或过期
- `server_name` 未匹配域名
