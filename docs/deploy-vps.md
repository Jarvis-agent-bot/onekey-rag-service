# VPS 部署指南（Docker Compose 生产建议）

本文把本仓库的 `docker-compose` RAG Service 部署到远程 VPS（推荐：Ubuntu 22.04/24.04）并对外提供 `https://你的域名/` 访问的完整操作命令记录下来。

> 约定：文档中的 `YOUR_DOMAIN` / `YOUR_VPS_IP` / `YOUR_EMAIL` / `YOUR_CHAT_API_KEY` 等均为占位符，按你的实际值替换即可。

---

## 0. 你将得到什么

- 对外入口：`https://exwxyzi.cn`
- 服务端口：VPS 只对公网开放 `22/80/443`
- 反向代理：Nginx 终止 TLS + 反代（使用 Certbot 自动申请/续期证书）
- 安全加固（可选）：限制 `/admin/*` 仅内网/办公网/VPN 访问（或额外加 BasicAuth 门禁）
- 容器编排：`postgres(pgvector) + api + worker`（网关由宿主机 Nginx 承担）

---

## 1. 准备信息（部署前先确定）

请准备并记录：

- `YOUR_VPS_IP`：VPS 公网 IP
- `YOUR_DOMAIN`：域名（A 记录指向 `YOUR_VPS_IP`）
- `YOUR_EMAIL`：用于 HTTPS 证书申请的邮箱
- `YOUR_CHAT_API_KEY`：上游 OpenAI-Compatible（OpenAI/DeepSeek 等）的 Key

建议你在本地终端先导出这些变量（方便复制命令）：

```bash
export VPS_IP="YOUR_VPS_IP"
export DOMAIN="exwxyzi.cn"
export EMAIL="YOUR_EMAIL"
```

---

## 2. 本地电脑：SSH 密钥登录（推荐）

如果你已经能用 SSH Key 登录，可跳过本节。

```bash
ssh-keygen -t ed25519 -C "rag-vps" -f ~/.ssh/id_ed25519_rag_vps
ssh-copy-id -i ~/.ssh/id_ed25519_rag_vps.pub root@"$VPS_IP"
ssh -i ~/.ssh/id_ed25519_rag_vps root@"$VPS_IP"
```

---

## 3. VPS：系统初始化 + 安装 Docker/Compose

以下命令在 VPS 上执行（以 Ubuntu 为例）。

### 3.1 更新系统与基础工具

```bash
sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt-get install -y git ca-certificates curl ufw
```

### 3.2 安装 Docker Engine + Compose（官方仓库方式）

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo systemctl enable --now docker

docker --version
docker compose version
```

### 3.3（可选但推荐）创建非 root 用户运行部署

```bash
sudo adduser rag --disabled-password --gecos ""
sudo usermod -aG docker rag
sudo usermod -aG sudo rag

sudo -iu rag
docker ps
```

> 后续如果你切换到 `rag` 用户执行，所有路径和命令保持一致即可。

### 3.4 安装 Nginx + Certbot（TLS 自动续期）

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo systemctl enable --now nginx
```

> 如果已有公司统一的入口层/证书管理，可跳过本节并按现有流程配置证书。

---

## 4. VPS：防火墙（只开 22/80/443）

> 注意：Docker 发布端口可能绕过部分防火墙规则，生产更推荐“不要发布数据库端口到宿主机”，本指南会通过 Compose 配置避免对外暴露 Postgres。

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status verbose
```

---

## 5. VPS：拉取代码与准备配置文件

### 5.1 拉取仓库

```bash
sudo mkdir -p /opt/onekey-rag-service
sudo chown -R "$USER":"$USER" /opt/onekey-rag-service

cd /opt/onekey-rag-service
**git** clone https://github.com/wabicai/onekey-rag-service.git .
git rev-parse --short HEAD
```

如果 VPS 没有配置 GitHub SSH Key，也可以用 HTTPS：

```bash
cd /opt/onekey-rag-service
git clone https://github.com/wabicai/onekey-rag-service.git .
```

### 5.2 配置 `.env`

```bash
cd /opt/onekey-rag-service
cp .env.example .env
```

编辑 `.env`（示例用 `nano`，你也可以用 `vim`）：

```bash
nano .env
```

至少需要填写：

- `CHAT_API_KEY=YOUR_CHAT_API_KEY`
- （推荐）`WIDGET_FRAME_ANCESTORS="'self' https://developer.onekey.so"`
- 后台登录与 JWT（生产必填）：
  - `ADMIN_PASSWORD=强密码`
  - `ADMIN_JWT_SECRET=强随机密钥`（用于签发/校验 JWT）

> 另外建议同步补全以下几组配置，以配合后台质量监控与多模型能力：
>
- `CHAT_DEFAULT_TEMPERATURE/TOP_P/MAX_TOKENS`：控制在客户端未传参时的默认生成参数，确保生成稳定且不会超时。
- `CHAT_MODEL_MAP_JSON` + `CHAT_MODEL_PASSTHROUGH`：如果要把外部 `model` 映射到多个上游模型（比如 DeepSeek、自建网关），在 `.env` 里写一个 JSON 映射并决定是否允许“Passthrough”。
- `QUERY_EMBED_CACHE_SIZE` / `QUERY_EMBED_CACHE_TTL_S`：在多实例部署中开启查询 embedding 缓存有助于降低重复计算，默认 `512 / 600s`。
- `RETRIEVAL_EVENTS_ENABLED=true` + `MODEL_PRICING_JSON`：前者只存检索事件的 metadata（不存原文），方便配合 `GET /admin/api/workspaces/default/observability/summary` 做命中率/错误率分析；后者可以把上游模型的 token/cost 计价配置上传到 `.env`（如 `{"gpt-4o-mini":{"prompt_usd_per_1k":0.00015,"completion_usd_per_1k":0.0006}}`），Admin UI 的质量页会展示对应的成本估算（详见 `docs/onekey-rag-admin-spec.md` 的观测章节）。

（强烈建议）修改 Postgres 默认口令（并同步更新 `DATABASE_URL`）：

```bash
nano .env
```

在 `.env` 里新增/修改（示例）：

```bash
POSTGRES_PASSWORD=请替换为强密码
DATABASE_URL=postgresql+psycopg2://postgres:请替换为强密码@postgres:5432/onekey_rag
```

> 说明：`.env.example` 默认启用 `sentence_transformers` embedding + `bge-reranker`，首次启动会下载模型（耗时/耗流量）。如果你的 VPS 不方便联网下载模型，可把 `EMBEDDINGS_PROVIDER` 临时改成 `fake` 先跑通链路，或把模型文件预下载后挂载进容器再切回本地模型。

---

## 6. VPS：生产用 Compose + Nginx（推荐）

本仓库默认的 `docker-compose.yml` 已包含生产所需服务（api/worker/postgres/langfuse/langfuse-redis）。生产部署使用宿主机 Nginx 终止 TLS 并反代到容器（80/443 暴露给公网，应用端口仅暴露给本机或内部网络）。

后台管理说明：

- Admin UI：`https://YOUR_DOMAIN/admin/ui/#/login`（使用应用层 JWT 登录）
- Admin API：`/admin/api/*`（需要 `Authorization: Bearer <token>`）

### 6.1 写入 `deploy/nginx.conf`

```bash
cd /opt/onekey-rag-service
mkdir -p deploy
cp deploy/nginx.conf.example deploy/nginx.conf
nano deploy/nginx.conf   # 替换域名、证书路径、反代端口
```

`deploy/nginx.conf.example` 示例（关键段落说明如下）：

- `your-domain.com`：替换为你的域名；确保 DNS 已指向服务器。
- 证书路径：示例为 Certbot 默认路径，可按实际修改。
- `location /langfuse/`：把前缀反代到 Langfuse（默认宿主机 3000）。
- `location /`：其余路径反代到主 API（默认宿主机 8000），关闭 `proxy_buffering` 以支持流式/SSE。
- 可选：在 `/admin/` 段落开启 BasicAuth 或 IP 白名单。

把配置安装到系统 Nginx，并检查：

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/onekey-rag.conf
sudo ln -sf /etc/nginx/sites-available/onekey-rag.conf /etc/nginx/sites-enabled/onekey-rag.conf
sudo nginx -t
sudo systemctl reload nginx
```

> compose 中已将 api/langfuse 端口绑定到 `127.0.0.1`（仅宿主机可访问），Postgres 只通过 `expose` 提供内部访问，不对公网开放。如需临时远程排障数据库，可按需做 SSH 隧道或临时端口映射，完毕后记得关闭。

### 6.2 申请/续期证书（使用 Certbot）

```bash
sudo certbot --nginx -d YOUR_DOMAIN -m YOUR_EMAIL --agree-tos --redirect
sudo systemctl reload nginx
```

> Certbot 会自动写入/更新 SSL 配置并定期续期。若使用自签名或已有证书，直接替换 Nginx 配置中的证书路径即可。

### 6.3 使用主 `docker-compose.yml`

```bash
docker compose up -d --build
docker compose ps
```
