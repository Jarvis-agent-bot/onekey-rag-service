# Web3 Transaction Analyzer 完整指南

> 综合后端实现规划与前端设计文档，包含知识库建设建议

---

## 目录

1. [项目概述](#1-项目概述)
2. [系统架构](#2-系统架构)
3. [后端服务设计](#3-后端服务设计)
4. [前端界面设计](#4-前端界面设计)
5. [API 规范](#5-api-规范)
6. [部署配置](#6-部署配置)
7. [知识库建设](#7-知识库建设)
8. [实施进度](#8-实施进度)

---

## 1. 项目概述

### 1.1 核心定位

**Web3 Transaction Analyzer** 是一个独立的链上交易分析微服务，提供：

| 能力 | 说明 |
|------|------|
| 交易解析 | 解码方法调用、事件日志 |
| 行为识别 | 识别 Swap/Transfer/Approve 等行为 |
| 风险检测 | 检测无限授权、大额转账等风险 |
| RAG 解释 | 调用 RAG 生成自然语言解释 |

### 1.2 使用场景

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

### 1.3 技术栈

**后端**：

| 组件 | 选型 | 理由 |
|------|------|------|
| Web 框架 | FastAPI | 异步支持，OpenAPI 文档 |
| HTTP 客户端 | httpx | 异步支持 |
| ABI 解码 | eth-abi | 标准以太坊 ABI 编解码 |
| 日志 | structlog | 结构化 JSON 日志 |
| ORM | SQLAlchemy | 数据库操作 |
| 缓存 | Redis | 高性能缓存 |

**前端**：

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.x | UI 框架 |
| TypeScript | 5.x | 类型安全 |
| Vite | 5.x | 构建工具 |
| TailwindCSS | 3.x | 样式框架 |
| React Query | 5.x | 数据获取/缓存 |

---

## 2. 系统架构

### 2.1 架构图

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
├── onekey_rag_service/              # 现有 RAG 服务
├── services/                        # 独立服务目录
│   └── web3-tx-analyzer/
│       ├── main.py                  # FastAPI 入口
│       ├── config.py                # 配置管理
│       ├── Dockerfile               # 独立镜像
│       ├── api/                     # API 层
│       │   ├── routes.py            # 路由定义
│       │   └── schemas.py           # 请求/响应模型
│       ├── analyzer/                # 核心解析逻辑
│       │   ├── parser.py            # 主解析流程
│       │   ├── abi_decoder.py       # ABI 解码
│       │   ├── event_classifier.py  # 事件分类
│       │   ├── behavior_analyzer.py # 行为识别
│       │   └── risk_detector.py     # 风险检测
│       ├── integrations/            # 外部服务集成
│       │   ├── rpc_client.py        # EVM JSON-RPC
│       │   ├── etherscan_client.py  # 链浏览器 API
│       │   └── signature_db.py      # 4byte 签名库
│       ├── clients/                 # 内部服务客户端
│       │   └── rag_client.py        # RAG 服务客户端
│       ├── storage/                 # 数据存储
│       │   ├── models.py            # SQLAlchemy 模型
│       │   ├── db.py                # 数据库连接
│       │   └── cache.py             # Redis 缓存
│       └── app_logging/             # 日志模块
│           ├── logger.py            # 结构化 JSON 日志
│           └── tracer.py            # 详细 trace 追踪
│
├── frontend-tx-analyzer/            # 前端项目
│   ├── src/
│   │   ├── main.tsx                 # 应用入口
│   │   ├── router.tsx               # 路由配置
│   │   ├── api/                     # API 客户端
│   │   ├── components/              # 通用组件
│   │   ├── features/                # 功能模块
│   │   │   ├── analyze/             # 交易分析
│   │   │   ├── history/             # 历史记录
│   │   │   └── chains/              # 链信息
│   │   └── lib/                     # 工具函数
│   └── vite.config.ts
│
└── docs/
    └── web3-tx-analyzer-complete-guide.md
```

---

## 3. 后端服务设计

### 3.1 支持的链

| Chain | Chain ID | RPC | Explorer |
|-------|----------|-----|----------|
| Ethereum | 1 | https://eth.llamarpc.com | Etherscan |
| BSC | 56 | https://bsc-dataseed.binance.org | BscScan |
| Polygon | 137 | https://polygon-rpc.com | PolygonScan |
| Arbitrum | 42161 | https://arb1.arbitrum.io/rpc | Arbiscan |
| Optimism | 10 | https://mainnet.optimism.io | Optimistic Etherscan |

### 3.2 行为类型

| 行为 | 识别依据 |
|------|----------|
| `swap` | DEX Router 调用 + Swap 事件 |
| `bridge` | Bridge 合约 + Lock/Mint 事件 |
| `stake` | Staking 合约 + Stake/Deposit 事件 |
| `transfer` | ERC20/721 Transfer 事件 |
| `approve` | Approval 事件 |
| `mint` | Mint 事件 |
| `liquidity` | AddLiquidity/RemoveLiquidity |
| `unknown` | 无法识别 |

### 3.3 风险检测

| 风险类型 | 严重程度 | 说明 |
|----------|----------|------|
| `unlimited_approve` | Medium | 无限授权（接近 MAX_UINT256） |
| `nft_approval_for_all` | Medium | NFT setApprovalForAll |
| `high_value_transfer` | Low | 大额原生代币转账 |
| `transfer_to_zero` | High | 向零地址转账 |

### 3.4 数据库设计

```sql
-- 使用独立 schema 隔离
CREATE SCHEMA IF NOT EXISTS tx_analyzer;

-- 解析结果缓存表
CREATE TABLE tx_analyzer.parse_results (
    id SERIAL PRIMARY KEY,
    chain_id INTEGER NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    block_number BIGINT,
    parse_result JSONB NOT NULL,
    behavior_type VARCHAR(32),
    confidence VARCHAR(16),
    parser_version VARCHAR(16) NOT NULL,
    parsed_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(chain_id, tx_hash)
);

-- ABI 缓存表
CREATE TABLE tx_analyzer.abi_cache (
    id SERIAL PRIMARY KEY,
    chain_id INTEGER NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    abi JSONB,
    source VARCHAR(32),
    fetched_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(chain_id, contract_address)
);

-- 解析日志表
CREATE TABLE tx_analyzer.parse_logs (
    id SERIAL PRIMARY KEY,
    trace_id VARCHAR(64) NOT NULL,
    chain_id INTEGER NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    status VARCHAR(16),
    behavior_type VARCHAR(32),
    total_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 4. 前端界面设计

### 4.1 页面列表

| 页面 | 路由 | 功能 |
|------|------|------|
| 首页/分析 | `/` | 交易分析主界面 |
| 历史记录 | `/history` | 分析历史列表 |
| 链信息 | `/chains` | 支持的链列表 |

### 4.2 首页布局

```
┌─────────────────────────────────────────────────────────────────┐
│  🔍 TX Analyzer                              [History] [Chains]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Chain: [Ethereum ▼]                                     │   │
│  │  Transaction Hash: [0x...]                               │   │
│  │  ☐ Include RAG Explanation   ☐ Include Trace Log        │   │
│  │                              [Analyze Transaction]       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  📊 Analysis Result                                      │   │
│  │  ┌─ Overview ─────────────┐ ┌─ Risk Assessment ────────┐│   │
│  │  │ Status: ✅ Success      │ │ 🟢 Low Risk             ││   │
│  │  │ Behavior: 🔄 Swap       │ │ No risks detected       ││   │
│  │  └─────────────────────────┘ └─────────────────────────┘│   │
│  │                                                          │   │
│  │  [Method] [Events] [RAG Explanation] [Trace]            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ Trace Timeline ────────────────────────────────────────┐   │
│  │ Total: 1,234ms │ Parse: 456ms │ RAG: 778ms              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 主题色

```css
:root {
  /* 主色调 - OneKey 品牌色 */
  --primary: #00b894;

  /* 链颜色 */
  --chain-eth: #627eea;
  --chain-bsc: #f3ba2f;
  --chain-polygon: #8247e5;
  --chain-arbitrum: #28a0f0;
  --chain-optimism: #ff0420;

  /* 风险颜色 */
  --risk-low: #00b894;
  --risk-medium: #fdcb6e;
  --risk-high: #e74c3c;
}
```

---

## 5. API 规范

### 5.1 端点列表

| Method | Path | 说明 |
|--------|------|------|
| GET | `/healthz` | 健康检查 |
| GET | `/v1/chains` | 获取支持的链列表 |
| POST | `/v1/tx/parse` | 纯解析（不调用 RAG） |
| POST | `/v1/tx/analyze` | 完整分析（含 RAG） |

### 5.2 分析请求

```json
POST /v1/tx/analyze

{
  "chain_id": 1,
  "tx_hash": "0xabc...def",
  "options": {
    "include_explanation": true,
    "include_trace": false,
    "language": "zh"
  }
}
```

### 5.3 分析响应

```json
{
  "trace_id": "tx-20250113-abc123",
  "status": "success",
  "parse_result": {
    "version": "1.0.0",
    "tx_hash": "0xabc...def",
    "chain_id": 1,
    "block_number": 19234567,
    "from": "0x...",
    "to": "0x...",
    "value": "500000000000000000",
    "gas": {
      "gas_used": "150000",
      "gas_price": "20000000000",
      "fee_paid": "3000000000000000"
    },
    "status": "success",
    "method": {
      "name": "swapExactTokensForTokens",
      "selector": "0x38ed1739",
      "inputs": [...]
    },
    "events": [...],
    "behavior": {
      "type": "swap",
      "confidence": "high",
      "evidence": ["event:Swap", "method:swapExactTokensForTokens"]
    },
    "risk_flags": []
  },
  "explanation": {
    "summary": "这是一笔在 Uniswap V2 上的代币兑换交易...",
    "risk_level": "low"
  },
  "timings": {
    "total_ms": 1250,
    "parse_ms": 350,
    "rag_ms": 900
  }
}
```

---

## 6. 部署配置

### 6.1 Docker Compose

```yaml
# docker-compose.yml
services:
  web3-tx-analyzer:
    build:
      context: ./services/web3-tx-analyzer
      dockerfile: Dockerfile
    profiles: ["tx-analyzer"]
    ports:
      - "127.0.0.1:8001:8001"
    environment:
      - DATABASE_URL=postgresql://...
      - REDIS_URL=redis://tx-analyzer-redis:6379/0
      - RAG_BASE_URL=http://api:8000
    depends_on:
      - postgres
      - tx-analyzer-redis
      - api

  frontend-tx-analyzer:
    image: node:20-alpine
    profiles: ["frontend", "tx-analyzer"]
    ports:
      - "5175:5175"
    volumes:
      - ./frontend-tx-analyzer:/app
```

### 6.2 Nginx 配置

```nginx
# TX Analyzer 前端
location ^~ /tx-analyzer/ {
    proxy_pass http://127.0.0.1:5175;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

# TX Analyzer API
location ^~ /tx-analyzer/api/ {
    proxy_pass http://127.0.0.1:8001/;
    proxy_buffering off;
}
```

### 6.3 启动命令

```bash
# 启动 TX Analyzer 服务（含前端）
docker compose --profile tx-analyzer up -d --build

# 仅启动后端
docker compose --profile tx-analyzer up -d web3-tx-analyzer tx-analyzer-redis

# 查看日志
docker compose logs -f web3-tx-analyzer
docker compose logs -f frontend-tx-analyzer
```

---

## 7. 知识库建设

> **重要**：当前 RAG 服务使用的是 OneKey 开发者文档，对于通用的区块链交易解释效果有限。
> 为了让 TX Analyzer 的 RAG 解释更有价值，建议添加以下区块链知识文档。

### 7.1 DeFi 协议文档（优先级：高）

#### DEX 交易所

| 协议 | 文档地址 | 内容 |
|------|----------|------|
| **Uniswap V2** | https://docs.uniswap.org/contracts/v2/overview | Swap、流动性、AMM 机制 |
| **Uniswap V3** | https://docs.uniswap.org/contracts/v3/overview | 集中流动性、价格区间 |
| **Uniswap V4** | https://docs.uniswap.org/contracts/v4/overview | Hooks、单例合约 |
| **SushiSwap** | https://docs.sushi.com/api/examples/swap | 多链 DEX、Farm |
| **PancakeSwap** | https://docs.pancakeswap.finance/ | BSC DEX、IFO |
| **Curve** | https://resources.curve.fi/ | 稳定币交易、Gauge |
| **Balancer** | https://docs.balancer.fi/ | 加权池、Vault |
| **1inch** | https://docs.1inch.io/ | 聚合器、限价单 |

#### 借贷协议

| 协议 | 文档地址 | 内容 |
|------|----------|------|
| **Aave V3** | https://docs.aave.com/ | 借贷、闪电贷、E-Mode |
| **Compound** | https://docs.compound.finance/ | cToken、治理 |
| **MakerDAO** | https://docs.makerdao.com/ | DAI、CDP、清算 |
| **Spark** | https://docs.spark.fi/ | MakerDAO 借贷前端 |

#### 衍生品/永续合约

| 协议 | 文档地址 | 内容 |
|------|----------|------|
| **GMX** | https://docs.gmx.io/ | 永续合约、GLP |
| **dYdX** | https://docs.dydx.exchange/ | 订单簿、保证金 |
| **Synthetix** | https://docs.synthetix.io/ | 合成资产、Perps |

### 7.2 跨链桥文档（优先级：高）

| 协议 | 文档地址 | 内容 |
|------|----------|------|
| **LayerZero** | https://docs.layerzero.network/ | 全链互操作 |
| **Wormhole** | https://docs.wormhole.com/ | 跨链消息 |
| **Axelar** | https://docs.axelar.dev/ | 通用消息传递 |
| **Stargate** | https://stargateprotocol.gitbook.io/ | 统一流动性 |
| **Across** | https://docs.across.to/ | 意图桥 |
| **Hop Protocol** | https://docs.hop.exchange/ | Rollup 桥 |
| **Celer cBridge** | https://cbridge-docs.celer.network/ | 流动性桥 |

### 7.3 NFT/游戏协议（优先级：中）

| 协议 | 文档地址 | 内容 |
|------|----------|------|
| **OpenSea Seaport** | https://docs.opensea.io/reference/seaport | NFT 交易协议 |
| **Blur** | https://docs.blur.foundation/ | NFT 聚合市场 |
| **LooksRare** | https://docs.looksrare.org/ | NFT 市场 |
| **ERC-721** | https://eips.ethereum.org/EIPS/eip-721 | NFT 标准 |
| **ERC-1155** | https://eips.ethereum.org/EIPS/eip-1155 | 多代币标准 |

### 7.4 Staking/质押（优先级：中）

| 协议 | 文档地址 | 内容 |
|------|----------|------|
| **Lido** | https://docs.lido.fi/ | 流动性质押、stETH |
| **Rocket Pool** | https://docs.rocketpool.net/ | 去中心化质押 |
| **EigenLayer** | https://docs.eigenlayer.xyz/ | 再质押 |
| **Frax ETH** | https://docs.frax.finance/ | frxETH、sfrxETH |

### 7.5 稳定币协议（优先级：中）

| 协议 | 文档地址 | 内容 |
|------|----------|------|
| **USDC** | https://developers.circle.com/ | Circle 稳定币 |
| **USDT** | https://tether.to/en/knowledge-base | Tether |
| **DAI** | https://docs.makerdao.com/ | MakerDAO DAI |
| **FRAX** | https://docs.frax.finance/ | 算法稳定币 |
| **crvUSD** | https://docs.curve.fi/crvusd/ | Curve 稳定币 |
| **GHO** | https://docs.gho.aave.com/ | Aave 稳定币 |

### 7.6 基础设施（优先级：中）

| 协议 | 文档地址 | 内容 |
|------|----------|------|
| **Chainlink** | https://docs.chain.link/ | 预言机、CCIP |
| **The Graph** | https://thegraph.com/docs/ | 索引协议 |
| **ENS** | https://docs.ens.domains/ | 域名服务 |
| **Safe (Gnosis)** | https://docs.safe.global/ | 多签钱包 |

### 7.7 L2/Rollup（优先级：低）

| 协议 | 文档地址 | 内容 |
|------|----------|------|
| **Arbitrum** | https://docs.arbitrum.io/ | Optimistic Rollup |
| **Optimism** | https://docs.optimism.io/ | OP Stack |
| **zkSync** | https://docs.zksync.io/ | ZK Rollup |
| **Polygon zkEVM** | https://docs.polygon.technology/ | ZK Rollup |
| **Base** | https://docs.base.org/ | Coinbase L2 |
| **Linea** | https://docs.linea.build/ | ConsenSys L2 |

### 7.8 安全知识（优先级：高）

| 资源 | 地址 | 内容 |
|------|------|------|
| **常见攻击模式** | 需整理 | 重入、闪电贷攻击、价格操纵 |
| **代币授权风险** | 需整理 | Approve、Permit、setApprovalForAll |
| **钓鱼识别** | 需整理 | 假代币、恶意合约特征 |
| **Rekt Database** | https://rekt.news/ | 安全事件分析 |
| **SlowMist** | https://slowmist.medium.com/ | 安全研究 |

### 7.9 EVM 基础知识（优先级：高）

| 主题 | 内容 |
|------|------|
| **ERC-20** | 代币标准、Transfer、Approve、TransferFrom |
| **ERC-721** | NFT 标准、safeTransferFrom、setApprovalForAll |
| **ERC-1155** | 多代币标准、批量转账 |
| **ERC-2612** | Permit 签名授权 |
| **交易类型** | Legacy、EIP-1559、EIP-2930 |
| **Gas 机制** | Gas Limit、Gas Price、Priority Fee |
| **事件日志** | Topics、Data、Indexed |

### 7.10 知识库建设建议

#### 短期（1-2 周）

1. **EVM 基础文档**
   - 创建 ERC-20/721/1155 标准解释文档
   - 创建交易类型和 Gas 机制文档
   - 创建常见事件（Transfer、Approval、Swap）解释

2. **主流 DEX 文档**
   - 爬取 Uniswap V2/V3 文档
   - 爬取 PancakeSwap 文档（BSC）
   - 整理常见 Swap 方法和事件

3. **安全风险文档**
   - 创建授权风险说明文档
   - 创建常见钓鱼模式文档

#### 中期（3-4 周）

4. **借贷协议**
   - Aave V3 文档
   - Compound 文档

5. **跨链桥**
   - LayerZero 文档
   - 常见桥的交易模式

6. **质押协议**
   - Lido 文档
   - 质押/解质押流程

#### 长期（持续）

7. **协议更新追踪**
   - 定期更新协议文档
   - 添加新协议支持

8. **安全事件分析**
   - 整理重大安全事件
   - 添加攻击模式识别

### 7.11 文档格式建议

为 RAG 检索优化，建议采用以下格式：

```markdown
# [协议名称] - [功能名称]

## 概述
简短描述该功能的作用

## 方法/事件
- 方法名：`swapExactTokensForTokens`
- Selector：`0x38ed1739`
- 参数说明：
  - amountIn: 输入代币数量
  - amountOutMin: 最小输出数量
  - path: 交易路径
  - to: 接收地址
  - deadline: 截止时间

## 风险提示
- 滑点风险
- MEV 攻击风险

## 参考链接
- [官方文档](https://...)
```

---

## 8. 实施进度

### 8.1 已完成 ✅

- [x] 后端服务骨架
- [x] RPC 客户端（多链支持）
- [x] Etherscan 客户端
- [x] ABI 解码器
- [x] 事件分类器
- [x] 行为分析器
- [x] 风险检测器
- [x] RAG 客户端
- [x] 日志系统（JSON + Trace）
- [x] Redis 缓存
- [x] API 路由
- [x] Docker 部署
- [x] 前端 UI
- [x] Nginx 反向代理

### 8.2 待优化 🔧

- [ ] 知识库文档爬取（见第 7 节）
- [ ] 更多协议行为识别
- [ ] 批量分析 API
- [ ] 历史记录持久化
- [ ] 性能优化（ABI 获取慢）
- [ ] 区块时间戳获取
- [ ] 暗色模式

### 8.3 验收标准

| 里程碑 | 交付物 | 状态 |
|--------|--------|------|
| M1 | 服务骨架 | ✅ |
| M2 | 基础解析 | ✅ |
| M3 | 日志完善 | ✅ |
| M4 | RAG 集成 | ✅ |
| M5 | 多链支持 | ✅ |
| M6 | Docker 部署 | ✅ |
| M7 | 前端界面 | ✅ |
| M8 | 知识库建设 | 🔧 进行中 |

---

## 附录

### A. 环境变量

```bash
# 后端服务
APP_ENV=local
LOG_LEVEL=INFO
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
RAG_BASE_URL=http://api:8000

# 链配置
ETH_RPC_URL=https://eth.llamarpc.com
BSC_RPC_URL=https://bsc-dataseed.binance.org
POLYGON_RPC_URL=https://polygon-rpc.com

# Etherscan API Keys
ETHERSCAN_API_KEY=
BSCSCAN_API_KEY=
POLYGONSCAN_API_KEY=
```

### B. 常用命令

```bash
# 启动服务
docker compose --profile tx-analyzer up -d --build

# 查看日志
docker compose logs -f web3-tx-analyzer

# 重启前端
docker compose --profile tx-analyzer restart frontend-tx-analyzer

# 清理重建
docker compose --profile tx-analyzer down
docker compose --profile tx-analyzer up -d --build
```

### C. 参考资料

- [Etherscan API 文档](https://docs.etherscan.io/)
- [4byte.directory](https://www.4byte.directory/)
- [EVM Opcodes](https://www.evm.codes/)
- [以太坊黄皮书](https://ethereum.github.io/yellowpaper/paper.pdf)
