# Web3 交易解析服务实现规划

基于 `rag-web3-trade-analysis.md` 设计文档，本文梳理服务的展现形式、架构设计和实施 TODO。

---

## 1. 服务最终展现形式

### 1.1 核心定位

**独立微服务**：`web3-tx-analyzer` 作为独立服务运行，通过 HTTP API 与 `onekey-rag-service` 通信。

| 特性 | 说明 |
|------|------|
| 独立部署 | 独立端口（8001）、独立进程、独立 Dockerfile |
| 松耦合 | 仅通过 HTTP API 调用 RAG 服务 |
| 可插拔 | RAG 解释可选，纯解析模式可独立运行 |

### 1.2 一站式 API

```
POST /v1/tx/analyze

Request:
{
  "chain_id": 1,
  "tx_hash": "0xabc...def",
  "options": {
    "include_explanation": true,   // 是否调用 RAG 生成解释
    "include_trace": false,        // 是否返回详细 trace 日志
    "language": "zh"               // 解释语言
  }
}

Response:
{
  "trace_id": "tx-20250113-abc123",
  "status": "success",
  "parse_result": {
    "version": "1.0.0",
    "tx_hash": "0xabc...def",
    "chain_id": 1,
    "behavior": {
      "type": "swap",
      "confidence": "high",
      "evidence": ["event:Swap", "method:swapExactTokensForTokens"]
    },
    "events": [...],
    "risk_flags": [...]
  },
  "explanation": {
    "summary": "这是一笔在 Uniswap V2 上的代币兑换交易...",
    "risk_level": "low",
    "actions": [...],
    "sources": [
      { "ref": 1, "url": "https://docs.uniswap.org/...", "title": "Uniswap V2 Swap" }
    ]
  },
  "timings": {
    "total_ms": 1250,
    "parse_ms": 350,
    "rag_ms": 900
  }
}
```

### 1.3 其他 API 端点

```
# 健康检查
GET /healthz

# 纯解析（不调用 RAG）
POST /v1/tx/parse

# 批量解析
POST /v1/tx/batch

# 支持的链列表
GET /v1/chains

# 解析历史查询
GET /v1/tx/history?tx_hash=0x...
```

### 1.4 使用场景

```
场景 1：钱包 App 交易解读
  用户查看交易详情 → POST /v1/tx/analyze → 展示解释 + 风险提示

场景 2：交易签名预执行
  用户签名前 → POST /v1/tx/parse → 预览行为与风险（不需要 RAG）

场景 3：开发者 Debug
  开发者输入 tx_hash → include_trace=true → 获取完整 trace 日志

场景 4：批量分析
  安全团队 → POST /v1/tx/batch → 批量扫描可疑交易
```

---

## 2. 架构设计

### 2.1 服务架构图

```
                    ┌─────────────────────────────────────────────────┐
                    │              Docker Compose 编排                 │
                    └─────────────────────────────────────────────────┘
                                          │
         ┌────────────────────────────────┼────────────────────────────────┐
         │                                │                                │
         ▼                                ▼                                ▼
┌─────────────────┐            ┌─────────────────┐            ┌─────────────────┐
│ web3-tx-analyzer│            │onekey-rag-service│           │   PostgreSQL    │
│    :8001        │───HTTP────▶│    :8000        │            │    :5432        │
│                 │            │                 │            │                 │
│ • 交易解析      │            │ • RAG 检索      │            │ • tx_analyzer   │
│ • 行为识别      │            │ • 语义生成      │            │   schema        │
│ • 风险检测      │            │ • 知识库        │            │ • rag schema    │
└────────┬────────┘            └─────────────────┘            └────────┬────────┘
         │                                                             │
         │                     ┌─────────────────┐                     │
         └────────────────────▶│     Redis       │◀────────────────────┘
                               │    :6379        │
                               │ • ABI 缓存      │
                               │ • 解析结果缓存  │
                               └─────────────────┘
                                        │
         ┌──────────────────────────────┼──────────────────────────────┐
         ▼                              ▼                              ▼
┌─────────────────┐            ┌─────────────────┐            ┌─────────────────┐
│  EVM Chains     │            │   Etherscan     │            │  4byte.directory│
│  (JSON-RPC)     │            │   API           │            │                 │
└─────────────────┘            └─────────────────┘            └─────────────────┘
```

### 2.2 目录结构

```
onekey-rag-service/
├── onekey_rag_service/           # 现有 RAG 服务（不改动）
├── services/                     # 【新增】独立服务目录
│   └── web3-tx-analyzer/
│       ├── main.py               # FastAPI 入口
│       ├── config.py             # 配置管理
│       ├── requirements.txt      # 独立依赖
│       ├── Dockerfile            # 独立镜像
│       ├── .env.example          # 环境变量模板
│       │
│       ├── api/                  # API 层
│       │   ├── __init__.py
│       │   ├── routes.py         # 路由定义
│       │   └── schemas.py        # 请求/响应模型
│       │
│       ├── analyzer/             # 核心解析逻辑
│       │   ├── __init__.py
│       │   ├── parser.py         # 主解析流程
│       │   ├── abi_decoder.py    # ABI 解码
│       │   ├── event_classifier.py  # 事件分类
│       │   ├── behavior_analyzer.py # 行为识别
│       │   └── risk_detector.py  # 风险检测
│       │
│       ├── integrations/         # 外部服务集成
│       │   ├── __init__.py
│       │   ├── rpc_client.py     # EVM JSON-RPC
│       │   ├── etherscan_client.py  # 链浏览器 API
│       │   └── signature_db.py   # 4byte 签名库
│       │
│       ├── clients/              # 内部服务客户端
│       │   ├── __init__.py
│       │   └── rag_client.py     # RAG 服务 HTTP 客户端
│       │
│       ├── storage/              # 数据存储
│       │   ├── __init__.py
│       │   ├── models.py         # SQLAlchemy 模型
│       │   ├── db.py             # 数据库连接
│       │   └── cache.py          # Redis 缓存
│       │
│       ├── logging/              # 日志模块
│       │   ├── __init__.py
│       │   ├── logger.py         # 结构化 JSON 日志
│       │   └── tracer.py         # 详细 trace 追踪
│       │
│       └── tests/                # 测试
│           ├── __init__.py
│           ├── test_parser.py
│           └── fixtures/
│
├── docker-compose.yml            # 【修改】添加 web3-tx-analyzer 服务
└── docs/
    └── web3-tx-analysis-implementation-plan.md
```

### 2.3 数据库设计（独立 Schema）

```sql
-- 使用独立 schema 隔离，复用同一 PostgreSQL 实例
CREATE SCHEMA IF NOT EXISTS tx_analyzer;

-- 解析结果缓存表
CREATE TABLE tx_analyzer.parse_results (
    id SERIAL PRIMARY KEY,
    chain_id INTEGER NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    block_number BIGINT,

    -- 解析结果（JSONB 存储完整 TxParseResult）
    parse_result JSONB NOT NULL,
    behavior_type VARCHAR(32),
    confidence VARCHAR(16),

    -- 元数据
    parser_version VARCHAR(16) NOT NULL,
    parsed_at TIMESTAMP DEFAULT NOW(),

    -- 索引
    UNIQUE(chain_id, tx_hash)
);

CREATE INDEX idx_parse_results_behavior ON tx_analyzer.parse_results(behavior_type);
CREATE INDEX idx_parse_results_chain_block ON tx_analyzer.parse_results(chain_id, block_number);

-- ABI 缓存表
CREATE TABLE tx_analyzer.abi_cache (
    id SERIAL PRIMARY KEY,
    chain_id INTEGER NOT NULL,
    contract_address VARCHAR(42) NOT NULL,

    abi JSONB,
    source VARCHAR(32),        -- registry / explorer / signature_db
    source_url TEXT,
    verified BOOLEAN DEFAULT FALSE,

    fetched_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,

    UNIQUE(chain_id, contract_address)
);

-- 解析日志表（用于审计和调试）
CREATE TABLE tx_analyzer.parse_logs (
    id SERIAL PRIMARY KEY,
    trace_id VARCHAR(64) NOT NULL,
    chain_id INTEGER NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,

    -- 请求信息
    request_options JSONB,
    client_ip VARCHAR(45),

    -- 结果摘要
    status VARCHAR(16),        -- success / partial / failed
    behavior_type VARCHAR(32),
    risk_flags JSONB,

    -- 耗时
    total_ms INTEGER,
    parse_ms INTEGER,
    rag_ms INTEGER,

    -- 错误信息
    error_code VARCHAR(32),
    error_message TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_parse_logs_trace ON tx_analyzer.parse_logs(trace_id);
CREATE INDEX idx_parse_logs_tx ON tx_analyzer.parse_logs(chain_id, tx_hash);
CREATE INDEX idx_parse_logs_time ON tx_analyzer.parse_logs(created_at);
```

### 2.4 日志系统设计

#### 2.4.1 结构化 JSON 日志

```python
# logging/logger.py
import structlog

# 日志格式
{
    "timestamp": "2025-01-13T10:00:00.123Z",
    "level": "info",
    "logger": "web3_tx_analyzer.parser",
    "trace_id": "tx-20250113-abc123",
    "chain_id": 1,
    "tx_hash": "0xabc...def",
    "event": "parse_started",
    "context": {
        "client_ip": "192.168.1.1",
        "options": {"include_explanation": true}
    }
}
```

#### 2.4.2 详细 Trace 追踪

```python
# logging/tracer.py
# 每个请求生成完整的执行链路

trace_log = [
    {
        "step": 1,
        "name": "fetch_transaction",
        "started_at": "2025-01-13T10:00:00.000Z",
        "ended_at": "2025-01-13T10:00:00.120Z",
        "duration_ms": 120,
        "status": "success",
        "input": {"tx_hash": "0xabc...def"},
        "output": {"block_number": 12345678, "from": "0x...", "to": "0x..."},
        "metadata": {"rpc_url": "https://eth.llamarpc.com"}
    },
    {
        "step": 2,
        "name": "fetch_receipt",
        "duration_ms": 85,
        "status": "success",
        "output": {"logs_count": 5, "status": 1}
    },
    {
        "step": 3,
        "name": "fetch_abi",
        "duration_ms": 45,
        "status": "success",
        "input": {"contract": "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"},
        "output": {"source": "explorer", "method_count": 23},
        "metadata": {"cache_hit": false, "source_url": "https://api.etherscan.io/..."}
    },
    {
        "step": 4,
        "name": "decode_input",
        "duration_ms": 5,
        "status": "success",
        "output": {"method": "swapExactTokensForTokens", "args_count": 5}
    },
    {
        "step": 5,
        "name": "decode_events",
        "duration_ms": 12,
        "status": "success",
        "output": {"decoded_count": 5, "events": ["Transfer", "Transfer", "Swap"]}
    },
    {
        "step": 6,
        "name": "analyze_behavior",
        "duration_ms": 8,
        "status": "success",
        "output": {"type": "swap", "confidence": "high", "evidence_count": 2}
    },
    {
        "step": 7,
        "name": "detect_risks",
        "duration_ms": 3,
        "status": "success",
        "output": {"risk_count": 0}
    },
    {
        "step": 8,
        "name": "call_rag",
        "duration_ms": 850,
        "status": "success",
        "input": {"model": "web3-tx-analysis", "context_chars": 2400},
        "output": {"sources_count": 3},
        "metadata": {"rag_url": "http://onekey-rag-service:8000"}
    }
]
```

#### 2.4.3 日志配置

```python
# config.py
class LogConfig:
    # 日志级别
    LOG_LEVEL: str = "INFO"                    # DEBUG / INFO / WARNING / ERROR

    # 输出格式
    LOG_FORMAT: str = "json"                   # json / human（开发用）

    # Trace 配置
    TRACE_ENABLED: bool = True                 # 是否记录详细 trace
    TRACE_STORE_DB: bool = True                # 是否存入数据库
    TRACE_INCLUDE_RESPONSE: bool = False       # 响应中是否包含 trace（需 include_trace=true）

    # 敏感信息脱敏
    LOG_MASK_KEYS: list = ["api_key", "private_key", "password"]
```

### 2.5 与 RAG 服务通信

```python
# clients/rag_client.py
import httpx

class RAGClient:
    def __init__(self, base_url: str, model: str, api_key: str = None):
        self.base_url = base_url
        self.model = model
        self.api_key = api_key

    async def explain(
        self,
        parse_result: dict,
        question: str = None,
        language: str = "zh"
    ) -> dict:
        """调用 RAG 服务生成交易解释"""

        # 构建 prompt
        system_prompt = self._build_system_prompt(language)
        user_prompt = self._build_user_prompt(parse_result, question)

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{self.base_url}/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"} if self.api_key else {},
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "response_format": {"type": "json_object"},
                    "metadata": {
                        "trace_id": parse_result.get("trace_id"),
                        "tx_hash": parse_result.get("tx_hash")
                    }
                }
            )
            response.raise_for_status()
            return response.json()
```

### 2.6 Docker Compose 配置

```yaml
# docker-compose.yml 新增部分

services:
  # ... 现有服务 ...

  web3-tx-analyzer:
    build:
      context: ./services/web3-tx-analyzer
      dockerfile: Dockerfile
    container_name: web3-tx-analyzer
    ports:
      - "8001:8001"
    environment:
      - APP_ENV=${APP_ENV:-local}
      - LOG_LEVEL=${TX_ANALYZER_LOG_LEVEL:-INFO}
      - LOG_FORMAT=${TX_ANALYZER_LOG_FORMAT:-json}

      # 数据库（复用 PostgreSQL，独立 schema）
      - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      - DATABASE_SCHEMA=tx_analyzer

      # Redis 缓存
      - REDIS_URL=redis://redis:6379/1

      # RAG 服务连接
      - RAG_BASE_URL=http://onekey-rag-service:8000
      - RAG_MODEL=web3-tx-analysis
      - RAG_API_KEY=${RAG_API_KEY:-}

      # 链配置
      - ETH_RPC_URL=${ETH_RPC_URL:-https://eth.llamarpc.com}
      - BSC_RPC_URL=${BSC_RPC_URL:-https://bsc-dataseed.binance.org}
      - POLYGON_RPC_URL=${POLYGON_RPC_URL:-https://polygon-rpc.com}

      # Etherscan API Keys
      - ETHERSCAN_ETH_API_KEY=${ETHERSCAN_ETH_API_KEY:-}
      - ETHERSCAN_BSC_API_KEY=${ETHERSCAN_BSC_API_KEY:-}
      - ETHERSCAN_POLYGON_API_KEY=${ETHERSCAN_POLYGON_API_KEY:-}

    depends_on:
      - postgres
      - redis
      - onekey-rag-service
    networks:
      - rag-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

## 3. TODO 任务清单

### Phase 1: 项目初始化

```
[ ] 1.1 创建服务目录结构
    [ ] services/web3-tx-analyzer/
    [ ] main.py + config.py
    [ ] requirements.txt
    [ ] Dockerfile
    [ ] .env.example

[ ] 1.2 日志系统
    [ ] logging/logger.py - structlog 配置
    [ ] logging/tracer.py - trace 追踪器
    [ ] 日志格式切换（json/human）
    [ ] 敏感信息脱敏

[ ] 1.3 数据库初始化
    [ ] storage/models.py - SQLAlchemy 模型
    [ ] storage/db.py - 连接管理
    [ ] 数据库迁移脚本（创建 tx_analyzer schema）
```

### Phase 2: 外部集成

```
[ ] 2.1 RPC 客户端
    [ ] integrations/rpc_client.py
    [ ] eth_getTransactionByHash
    [ ] eth_getTransactionReceipt
    [ ] eth_getLogs
    [ ] 多链配置支持
    [ ] 重试与超时处理

[ ] 2.2 Etherscan 客户端
    [ ] integrations/etherscan_client.py
    [ ] getabi / getsourcecode
    [ ] 多链支持（Etherscan/BscScan/PolygonScan）
    [ ] 请求限流（5/min）
    [ ] 缓存集成

[ ] 2.3 签名库客户端
    [ ] integrations/signature_db.py
    [ ] 4byte.directory 查询
    [ ] 本地签名缓存

[ ] 2.4 RAG 客户端
    [ ] clients/rag_client.py
    [ ] /v1/chat/completions 调用
    [ ] Prompt 模板管理
    [ ] 错误处理与降级
```

### Phase 3: 解析核心

```
[ ] 3.1 ABI 解码器
    [ ] analyzer/abi_decoder.py
    [ ] 方法签名解码
    [ ] 事件日志解码
    [ ] 参数类型处理（uint256, address, bytes 等）

[ ] 3.2 事件分类器
    [ ] analyzer/event_classifier.py
    [ ] ERC-20 Transfer/Approval
    [ ] ERC-721 Transfer
    [ ] Uniswap V2/V3 Swap/Mint/Burn
    [ ] WETH Deposit/Withdrawal

[ ] 3.3 行为分析器
    [ ] analyzer/behavior_analyzer.py
    [ ] 规则引擎
    [ ] 行为类型识别（swap/bridge/stake/...）
    [ ] 置信度计算
    [ ] 证据收集

[ ] 3.4 风险检测器
    [ ] analyzer/risk_detector.py
    [ ] unlimited approve 检测
    [ ] 大额授权检测
    [ ] 可疑合约检测

[ ] 3.5 主解析流程
    [ ] analyzer/parser.py
    [ ] 整合上述模块
    [ ] 错误处理与降级
    [ ] Trace 记录
```

### Phase 4: API 实现

```
[ ] 4.1 API 路由
    [ ] api/routes.py
    [ ] POST /v1/tx/analyze（一站式）
    [ ] POST /v1/tx/parse（纯解析）
    [ ] GET /v1/chains
    [ ] GET /healthz

[ ] 4.2 请求/响应模型
    [ ] api/schemas.py
    [ ] TxAnalyzeRequest
    [ ] TxAnalyzeResponse
    [ ] TxParseResult（完整 JSON Schema）

[ ] 4.3 中间件
    [ ] 请求 ID / Trace ID 注入
    [ ] 请求日志
    [ ] 错误处理
```

### Phase 5: 缓存与存储

```
[ ] 5.1 Redis 缓存
    [ ] storage/cache.py
    [ ] ABI 缓存（TTL 7天）
    [ ] 解析结果缓存（TTL 1天）
    [ ] 缓存命中率统计

[ ] 5.2 数据库存储
    [ ] 解析结果持久化
    [ ] 解析日志记录
    [ ] 查询接口
```

### Phase 6: Docker 部署

```
[ ] 6.1 Dockerfile
    [ ] 多阶段构建
    [ ] 依赖安装
    [ ] 健康检查

[ ] 6.2 docker-compose.yml
    [ ] 添加 web3-tx-analyzer 服务
    [ ] 环境变量配置
    [ ] 网络与依赖配置

[ ] 6.3 .env.example 更新
    [ ] 新增所有配置项
```

### Phase 7: 测试

```
[ ] 7.1 单元测试
    [ ] test_rpc_client.py
    [ ] test_etherscan_client.py
    [ ] test_abi_decoder.py
    [ ] test_behavior_analyzer.py

[ ] 7.2 集成测试
    [ ] 真实交易解析测试
    [ ] RAG 解释测试
    [ ] 多链测试

[ ] 7.3 测试数据
    [ ] fixtures/ 目录
    [ ] 典型交易样本（Swap/Transfer/Approve 等）
```

### Phase 8: 知识库配置（RAG 服务侧）

```
[ ] 8.1 创建知识库
    [ ] web3-tx-analysis KB
    [ ] 配置 prompt 模板（JSON 输出约束）

[ ] 8.2 协议文档爬取
    [ ] Uniswap 文档
    [ ] Aave 文档
    [ ] 其他主要协议

[ ] 8.3 行为模板
    [ ] Swap 解释模板
    [ ] Bridge 解释模板
    [ ] Stake 解释模板
```

---

## 4. 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| Web 框架 | FastAPI | 异步支持，与现有服务一致 |
| HTTP 客户端 | httpx | 异步支持，用于 RPC/Etherscan/RAG 调用 |
| ABI 解码 | eth-abi | 标准以太坊 ABI 编解码库 |
| 日志 | structlog | 结构化日志，支持 JSON 输出 |
| ORM | SQLAlchemy | 与现有服务一致 |
| 缓存 | Redis | 高性能，与现有服务共享 |
| 数据校验 | Pydantic | 与 FastAPI 集成 |

---

## 5. 配置项清单

```bash
# .env.example

# ========== 基础配置 ==========
APP_ENV=local                          # local / staging / production
LOG_LEVEL=INFO                         # DEBUG / INFO / WARNING / ERROR
LOG_FORMAT=json                        # json / human

# ========== 数据库 ==========
DATABASE_URL=postgresql://user:pass@localhost:5432/onekey_rag
DATABASE_SCHEMA=tx_analyzer

# ========== Redis ==========
REDIS_URL=redis://localhost:6379/1

# ========== RAG 服务 ==========
RAG_BASE_URL=http://localhost:8000
RAG_MODEL=web3-tx-analysis
RAG_API_KEY=

# ========== 链 RPC ==========
ETH_RPC_URL=https://eth.llamarpc.com
BSC_RPC_URL=https://bsc-dataseed.binance.org
POLYGON_RPC_URL=https://polygon-rpc.com
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
OPTIMISM_RPC_URL=https://mainnet.optimism.io

# ========== Etherscan API Keys ==========
ETHERSCAN_ETH_API_KEY=
ETHERSCAN_BSC_API_KEY=
ETHERSCAN_POLYGON_API_KEY=
ETHERSCAN_ARBITRUM_API_KEY=
ETHERSCAN_OPTIMISM_API_KEY=

# ========== 缓存 TTL ==========
ABI_CACHE_TTL_SECONDS=604800           # 7 天
PARSE_RESULT_CACHE_TTL_SECONDS=86400   # 1 天

# ========== 限流 ==========
ETHERSCAN_RATE_LIMIT_PER_MIN=5
RPC_RATE_LIMIT_PER_SEC=10
```

---

## 6. 里程碑

| 里程碑 | 交付物 | 验收标准 |
|--------|--------|----------|
| M1 | 服务骨架 | 能启动，/healthz 正常 |
| M2 | 基础解析 | 能解析 ETH 主网 Uniswap V2 Swap |
| M3 | 日志完善 | JSON 日志 + 详细 Trace |
| M4 | RAG 集成 | 调用 RAG 生成交易解释 |
| M5 | 多链支持 | 支持 ETH/BSC/Polygon |
| M6 | Docker 部署 | docker-compose up 一键启动 |
| M7 | 生产就绪 | 测试覆盖，监控完备 |

---

## 7. 下一步行动

1. **创建服务目录** - `services/web3-tx-analyzer/`
2. **实现日志模块** - 优先保证可观测性
3. **实现 RPC 客户端** - 能拉取交易数据
4. **实现基础解析** - 能识别 Swap 行为
5. **集成 RAG 调用** - 生成解释文本
