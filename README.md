# OneKey RAG Service

本仓库用于构建 OneKey 开发者文档的 RAG（Retrieval-Augmented Generation）对话服务，目标对标 Inkeep 的“文档对话 + 可追溯引用”体验。

- 需求与技术方案文档：`docs/onekey-rag-service-spec.md`
- 前端接入需求与开发规格：`docs/onekey-rag-frontend-spec.md`

## 快速开始（本地 Docker）

1. 准备环境变量：
   - `cp .env.example .env`
   - 填写 `.env` 中的 `CHAT_API_KEY`（上游 OpenAI 兼容模型的 Key）
   - 如使用 DeepSeek：配置 `CHAT_BASE_URL`、`CHAT_MODEL`，并保持 `CHAT_MODEL_PROVIDER=openai`
   - 推荐 Embedding（无需 Ollama）：
     - `EMBEDDINGS_PROVIDER=sentence_transformers`
     - `SENTENCE_TRANSFORMERS_MODEL=sentence-transformers/paraphrase-multilingual-mpnet-base-v2`
     - `PGVECTOR_EMBEDDING_DIM=768`

2. 启动后端服务（不含前端）：
   - `docker compose up -d --build`
   - API 默认地址：`http://localhost:8000`
   - 健康检查：`GET http://localhost:8000/healthz`
   - 后台任务：默认启用 `worker`（见 `JOBS_BACKEND`），抓取/索引会入队由 Worker 消费

3. 前端本地开发（非 Docker）：
   - `cd frontend-chat && corepack enable && pnpm install`
   - `pnpm dev`（默认代理后端 `http://localhost:8000`）
   - 管理后台：`cd frontend-admin && corepack enable && pnpm install`
   - `pnpm dev`（默认代理后端 `http://localhost:8000`）
   - 如需一键拉起前后端（Docker）：`docker compose --profile frontend up -d --build`
   - 如需让后端同域提供静态页面：
     - `cd frontend-chat && pnpm build` → 产物在 `frontend-chat/dist`
     - `cd frontend-admin && pnpm build` → 产物在 `frontend-admin/dist`
     - 将产物分别拷贝到 `onekey_rag_service/static/widget` 与 `onekey_rag_service/static/admin`

4. 初始化数据：抓取 + 建索引（首次建议 `full`，后续可用 `incremental`）
   - 先用 Admin 账号登录拿 JWT（账号密码来自 `.env` 的 `ADMIN_USERNAME/ADMIN_PASSWORD`）：
     - `POST http://localhost:8000/admin/api/auth/login`
   - 触发抓取（默认工作区/默认 KB/默认数据源分别为 `default`/`default`/`source_default`）：
     - `POST http://localhost:8000/admin/api/workspaces/default/jobs/crawl`
     - 示例（全站建议把 `max_pages` 调大，例如 5000 或更高；也可直接改 `.env` 的 `CRAWL_*`）：
       ```bash
       # 1) 登录拿 token（把响应里的 access_token 复制出来）
       curl -s http://localhost:8000/admin/api/auth/login \
         -H 'content-type: application/json' \
         -d '{"username":"admin","password":"<你的 ADMIN_PASSWORD>"}'

       # 2) 触发 crawl（把 <token> 替换为上一步的 access_token）
       curl -s http://localhost:8000/admin/api/workspaces/default/jobs/crawl \
         -H 'content-type: application/json' \
         -H "Authorization: Bearer <token>" \
         -d '{"kb_id":"default","source_id":"source_default","mode":"full","sitemap_url":"https://developer.onekey.so/sitemap.xml","seed_urls":["https://developer.onekey.so/"],"max_pages":5000}'
       ```
   - 触发建索引（chunk + embedding + pgvector 入库）：
     - `POST http://localhost:8000/admin/api/workspaces/default/jobs/index`
     - 示例：
       ```bash
       curl -s http://localhost:8000/admin/api/workspaces/default/jobs/index \
         -H 'content-type: application/json' \
         -H "Authorization: Bearer <token>" \
         -d '{"kb_id":"default","mode":"full"}'
       ```
   - 轮询任务状态（crawl/index 共用）：
     - `GET http://localhost:8000/admin/api/workspaces/default/jobs/<job_id>`
   - 说明：当 `JOBS_BACKEND=worker` 时，任务会先进入 `queued`，随后由 Worker 拉起为 `running` 并最终 `succeeded/failed`

5. 对话（OpenAI 兼容）：
   - `POST http://localhost:8000/v1/chat/completions`
   - 非流式示例：
     ```bash
     curl -s http://localhost:8000/v1/chat/completions \
       -H 'content-type: application/json' \
       -d '{"model":"onekey-docs","messages":[{"role":"user","content":"如何在项目里集成 OneKey Connect？"}],"stream":false}'
     ```
   - 流式（SSE）示例（会在结束前追加 `chat.completion.sources` 事件，最后 `data: [DONE]`）：
     ```bash
     curl -N http://localhost:8000/v1/chat/completions \
       -H 'content-type: application/json' \
       -d '{"model":"onekey-docs","messages":[{"role":"user","content":"WebUSB 权限需要注意什么？"}],"stream":true}'
     ```

6. 常用接口一览：
   - 模型列表：`GET http://localhost:8000/v1/models`
   - 反馈：`POST http://localhost:8000/v1/feedback`
   - 健康检查：`GET http://localhost:8000/healthz`
   - 前端 Widget（用于“一行 script”接入）：`GET http://localhost:8000/widget/widget.js`（iframe 页面为 `GET http://localhost:8000/widget/`）
   - 后台 Admin UI：`http://localhost:8000/admin/ui/#/login`（使用 JWT 登录，接口为 `/admin/api/*`）

## 后台管理（Admin）

本仓库内置一个轻量后台（面向企业化演进，多 RagApp/多 KB）：

- Admin UI：`/admin/ui/#/login`
- Admin API：`/admin/api/*`（Bearer JWT）

配置（见 `.env.example`）：

- `ADMIN_USERNAME`、`ADMIN_PASSWORD`
- `ADMIN_JWT_SECRET`、`ADMIN_JWT_EXPIRES_S`

## 前端 Widget（一行 script 接入）

本服务会同域提供：
- Loader 脚本：`/widget/widget.js`
- iframe 页面：`/widget/`

在 `https://developer.onekey.so/` 的站点代码中加入（示例）：
```html
<script
  src="https://你的-rag-域名/widget/widget.js"
  data-model="onekey-docs"
></script>
```

本地快速测试（模拟文档站引入一行 script）：
- 启动本地静态页：`python -m http.server 9000 --bind 127.0.0.1 --directory examples`
- 打开测试页：`http://127.0.0.1:9000/widget-host.html`

生产建议在 `.env` 配置 `WIDGET_FRAME_ANCESTORS` 限制可嵌入来源，例如：
- `WIDGET_FRAME_ANCESTORS="'self' https://developer.onekey.so"`（建议用双引号包住，内部保留 `'self'`）

## 配置说明（MVP）

- 向量库：`pgvector`（Postgres 容器：`pgvector/pgvector:pg16`）
- 对外接口：OpenAI 兼容（`/v1/chat/completions`），额外返回 `sources`
- Embedding：
  - 默认：`EMBEDDINGS_PROVIDER=fake`（仅用于链路跑通，不适合生产检索效果）
  - 推荐（本地 CPU，无需 Ollama）：`EMBEDDINGS_PROVIDER=sentence_transformers` 并配置 `SENTENCE_TRANSFORMERS_MODEL`
  - 可选（本地 Ollama）：`EMBEDDINGS_PROVIDER=ollama` 并配置 `OLLAMA_BASE_URL`、`OLLAMA_EMBEDDING_MODEL`

### 生成参数（默认值来自 env）

当客户端请求未显式传入时，服务会使用：
- `CHAT_DEFAULT_TEMPERATURE`
- `CHAT_DEFAULT_TOP_P`
- `CHAT_DEFAULT_MAX_TOKENS`

### 多 ChatModel（可选）

本服务通过 LangChain `init_chat_model` 初始化 ChatModel，并使用 OpenAI provider 的 `base_url` 适配 OpenAI-Compatible（DeepSeek 也属于该类），因此：
- 仅切换单一上游模型：改 `.env` 的 `CHAT_BASE_URL` + `CHAT_MODEL` 即可
- 同时暴露多个 `model` 给客户端选择：配置 `CHAT_MODEL_MAP_JSON`（请求的 `model` -> 上游模型名）

### 多轮对话（Query rewrite / 记忆压缩）

服务会基于 `messages` 的多轮历史，自动：
- 改写出“用于检索的独立 query”（降低多轮追问导致的召回偏移）
- 生成对话摘要（压缩记忆），用于回答时补充上下文

相关配置：`QUERY_REWRITE_ENABLED`、`MEMORY_SUMMARY_ENABLED`、`CONVERSATION_*`

### Inline citation（更像 Inkeep）

- 默认开启 `INLINE_CITATIONS_ENABLED=true`：回答正文会生成类似 `[1][2]` 的引用编号，并在 `sources[]` 中返回对应 `ref/url/snippet`。
- 若你的客户端只展示 `content`，可设置 `ANSWER_APPEND_SOURCES=true` 在正文末尾追加“参考”列表。

### 检索策略（Hybrid 默认开启）

- 默认：`RETRIEVAL_MODE=hybrid`（BM25/FTS + 向量），对代码/术语/精确匹配的召回更稳
- 启动时自动建索引：`AUTO_CREATE_INDEXES=true`（可通过 `PGVECTOR_INDEX_TYPE` 选择 `hnsw/ivfflat/none`）

### 使用本地 sentence-transformers Embeddings（推荐）

前提：无（不需要运行 Ollama）。

推荐使用 `sentence-transformers` 在本地 CPU 上跑 embedding（首次会自动下载模型到 HuggingFace 缓存）。

- `.env` 建议：
  - `EMBEDDINGS_PROVIDER=sentence_transformers`
  - `SENTENCE_TRANSFORMERS_MODEL=sentence-transformers/paraphrase-multilingual-mpnet-base-v2`
  - `PGVECTOR_EMBEDDING_DIM=768`（需与你的 embedding 模型输出维度一致）

可选：如果你不希望容器内联网下载模型，把模型文件预下载后挂载到容器并设置 `SENTENCE_TRANSFORMERS_MODEL=/models/...`。

### 使用 bge-reranker 做重排（推荐）

对标 Inkeep 的引用质量，建议开启本地 cross-encoder 重排（bge-reranker）。

- `.env` 示例：
  - `RERANK_PROVIDER=bge_reranker`
  - `BGE_RERANKER_MODEL=BAAI/bge-reranker-large`
  - `RERANK_DEVICE=cpu`

## Web3 Transaction Analyzer（可选服务）

本仓库还包含一个独立的 Web3 交易分析服务，用于解析和解释区块链交易。

### 功能特性

- **多链支持**：Ethereum、BSC、Polygon、Arbitrum、Optimism
- **智能解析**：自动获取 ABI、解码合约调用、识别代币转账
- **AI 解释**：基于 RAG 服务生成人类可读的交易说明
- **历史记录**：支持查询历史分析记录

### 快速启动脚本（推荐）

使用 `deploy/start.sh` 脚本可以自动清理残留网络并启动服务，避免 Docker 网络冲突问题：

```bash
# 启动基础服务
./deploy/start.sh

# 启动 TX Analyzer 服务
./deploy/start.sh tx-analyzer

# 启动前端开发服务
./deploy/start.sh frontend

# 启动所有服务
./deploy/start.sh all

# 停止服务
./deploy/stop.sh

# 停止并清理数据卷（慎用）
./deploy/stop.sh --clean
```

### Docker Compose 构建命令

本项目使用 Docker Compose profiles 管理不同服务组合：

```bash
# ========== 基础服务（默认启动） ==========
# 启动核心服务：postgres + api + worker + langfuse
docker compose up -d --build

# ========== 前端开发服务 ==========
# 启动前端开发服务（Widget + Admin）
docker compose --profile frontend up -d --build

# ========== TX Analyzer 服务 ==========
# 仅启动 TX Analyzer（后端 + Redis + 前端）
docker compose --profile tx-analyzer up -d --build

# ========== DeFi Rating 服务 ==========
# 仅启动 DeFi Rating（后端 + 前端）
docker compose --profile defi-rating up -d --build

# ========== 完整服务 ==========
# 启动所有服务（核心 + 前端 + TX Analyzer + DeFi Rating）
docker compose --profile frontend --profile tx-analyzer --profile defi-rating up -d --build

# ========== 常用运维命令 ==========
# 查看服务状态
docker compose ps
docker compose --profile tx-analyzer ps

# 查看日志
docker compose logs -f api worker
docker compose logs -f web3-tx-analyzer frontend-tx-analyzer

# 停止服务
docker compose down
docker compose --profile tx-analyzer down

# 停止并清理数据卷（慎用，会删除数据库数据）
docker compose down -v

# 重新构建单个服务
docker compose build api
docker compose --profile tx-analyzer build web3-tx-analyzer

# 重启单个服务
docker compose restart api
docker compose --profile tx-analyzer restart web3-tx-analyzer
```

### 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| RAG API | 8000 | 主 RAG 后端 API |
| TX Analyzer API | 8001 | 交易分析后端 API |
| DeFi Rating API | 8002 | DeFi 评级后端 API |
| frontend-chat | 5173 | 聊天 Widget 前端 |
| frontend-admin | 5174 | 管理后台前端 |
| frontend-tx-analyzer | 5175 | 交易分析前端 |
| frontend-defi-rating | 5176 | DeFi 评级前端 |
| Langfuse | 5177 | 可观测性平台 |

### API 端点

- 健康检查：`GET http://localhost:8001/healthz`
- 解析交易：`POST http://localhost:8001/api/v1/tx/parse`
- 分析交易：`POST http://localhost:8001/api/v1/tx/analyze`
- 支持的链：`GET http://localhost:8001/api/v1/chains`
- 历史记录：`GET http://localhost:8001/api/v1/history`

### 使用示例

```bash
# 解析交易（不含 AI 解释）
curl -s http://localhost:8001/api/v1/tx/parse \
  -H 'content-type: application/json' \
  -d '{"tx_hash":"0x123...","chain_id":1}'

# 分析交易（含 AI 解释）
curl -s http://localhost:8001/api/v1/tx/analyze \
  -H 'content-type: application/json' \
  -d '{"tx_hash":"0x123...","chain_id":1}'
```

### 配置说明

TX Analyzer 使用独立的数据库 schema（`tx_analyzer`）和 Redis 实例（`tx-analyzer-redis`）。

主要环境变量（见 `.env.example`）：
- `TX_ANALYZER_DATABASE_SCHEMA`：数据库 schema 名称
- `TX_ANALYZER_REDIS_URL`：Redis 连接地址
- `TX_ANALYZER_RAG_BASE_URL`：RAG 服务地址（用于 AI 解释）
- `ETH_RPC_URL`、`BSC_RPC_URL` 等：各链 RPC 端点
- `ETHERSCAN_API_KEY` 等：区块链浏览器 API Key（用于获取 ABI）

## DeFi Rating Service（可选服务）

本仓库还包含一个独立的 DeFi 项目安全评级服务，用于评估和展示 DeFi 协议的安全风险。

### 功能特性

- **多维度评分**：合约安全、团队背景、代币经济、运营历史
- **风险等级**：低/中/高/极高四级风险分类
- **TVL 集成**：从 DefiLlama 获取实时 TVL 数据
- **项目分类**：流动性质押、借贷、DEX、收益聚合等多种类别

### 快速启动

```bash
# 启动 DeFi Rating 服务
docker compose --profile defi-rating up -d --build

# 查看服务状态
docker compose --profile defi-rating ps
```

### API 端点

- 健康检查：`GET http://localhost:8002/healthz`
- 项目列表：`GET http://localhost:8002/v1/projects`
- 项目详情：`GET http://localhost:8002/v1/projects/{slug}`
- 分类列表：`GET http://localhost:8002/v1/categories`
- 搜索项目：`GET http://localhost:8002/v1/search?q={keyword}`
- 统计数据：`GET http://localhost:8002/v1/stats`

### 配置说明

DeFi Rating 使用独立的数据库 schema（`defi_rating`）。

主要环境变量（见 `.env.example`）：
- `DEFI_RATING_DATABASE_SCHEMA`：数据库 schema 名称（默认 `defi_rating`）
- `DEFILLAMA_BASE_URL`：DefiLlama API 地址
- `DEFILLAMA_TIMEOUT`：API 请求超时时间

## TODO（对标 Inkeep 的产品化差距）

- 持久化任务队列/Worker（已实现 MVP）：`jobs` 表持久化队列 + `worker` 容器消费 + 重试（attempts）+ 超时重入队；后续补齐：心跳/断点续跑的细粒度进度、定时调度、并发配额与优先级队列。
- 可观测与评测回归（进行中）：已支持 `debug=true` 返回检索信息与 `timings_ms`；后续补齐：结构化 trace/metrics、离线评测集与自动回归（答案/引用相关性）。
- 容量与并发治理（进行中）：已支持并发上限 `MAX_CONCURRENT_CHAT_REQUESTS`、RAG 超时 `RAG_*_TIMEOUT_S`、query embedding 缓存；后续补齐：限流、结果缓存、熔断/降级与慢查询保护。
- 抽取与引用对齐（进行中）：已支持 inline citation + sources(ref/url)；并尝试基于标题生成 anchor（`url#anchor`）；后续补齐：段落级定位/高亮、snippet 更准确、去重合并策略。
