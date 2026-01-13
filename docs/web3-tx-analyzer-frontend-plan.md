# Web3 Transaction Analyzer 前端设计文档

## 1. 项目概述

### 1.1 目标
为 Web3 Transaction Analyzer 服务提供一个直观、专业的前端界面，让用户能够：
- 输入交易哈希快速分析链上交易
- 可视化展示交易解析结果
- 查看 RAG 生成的风险评估和解释
- 浏览历史分析记录

### 1.2 技术栈（与现有项目保持一致）
| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.x | UI 框架 |
| TypeScript | 5.x | 类型安全 |
| Vite | 5.x | 构建工具 |
| TailwindCSS | 3.x | 样式框架 |
| Radix UI | latest | 无障碍组件库 |
| React Query | 5.x | 数据获取/缓存 |
| React Router | 6.x | 路由管理 |
| Lucide React | latest | 图标库 |
| Recharts | 3.x | 图表库 |
| pnpm | 10.x | 包管理器 |

### 1.3 目录结构
```
frontend-tx-analyzer/
├── public/
│   └── favicon.ico
├── src/
│   ├── main.tsx              # 应用入口
│   ├── router.tsx            # 路由配置
│   ├── styles.css            # 全局样式
│   ├── api/                  # API 客户端
│   │   ├── client.ts         # axios/fetch 封装
│   │   ├── types.ts          # API 类型定义
│   │   └── hooks.ts          # React Query hooks
│   ├── components/           # 通用组件
│   │   ├── ui/               # 基础 UI 组件（shadcn/ui 风格）
│   │   ├── layout/           # 布局组件
│   │   └── shared/           # 业务通用组件
│   ├── features/             # 功能模块
│   │   ├── analyze/          # 交易分析
│   │   ├── history/          # 历史记录
│   │   └── chains/           # 链信息
│   ├── lib/                  # 工具函数
│   │   ├── utils.ts          # 通用工具
│   │   ├── format.ts         # 格式化函数
│   │   └── constants.ts      # 常量定义
│   └── hooks/                # 自定义 hooks
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── postcss.config.js
```

---

## 2. 页面设计

### 2.1 页面列表

| 页面 | 路由 | 功能 |
|------|------|------|
| 首页/分析 | `/` | 交易分析主界面 |
| 历史记录 | `/history` | 分析历史列表 |
| 详情页 | `/tx/:traceId` | 单笔分析详情 |
| 链信息 | `/chains` | 支持的链列表 |

### 2.2 首页/分析页面 (`/`)

这是用户的主要工作界面，包含以下区域：

```
┌─────────────────────────────────────────────────────────────────┐
│  🔍 Web3 Transaction Analyzer                    [History] [?]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Chain: [Ethereum ▼]                                     │   │
│  │                                                          │   │
│  │  Transaction Hash:                                       │   │
│  │  ┌────────────────────────────────────────────────────┐ │   │
│  │  │ 0x...                                              │ │   │
│  │  └────────────────────────────────────────────────────┘ │   │
│  │                                                          │   │
│  │  ☐ Include RAG Explanation   ☐ Include Trace Log        │   │
│  │                                                          │   │
│  │                              [Analyze Transaction]       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ═══════════════════════════════════════════════════════════   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  📊 Analysis Result                           [Copy JSON] │   │
│  │                                                          │   │
│  │  ┌─ Overview ─────────────────────────────────────────┐ │   │
│  │  │ Status: ✅ Success    Block: 19,234,567            │ │   │
│  │  │ From: 0xabc...123     To: 0xdef...456              │ │   │
│  │  │ Value: 0.5 ETH        Gas: 0.002 ETH               │ │   │
│  │  │ Behavior: 🔄 Swap (High Confidence)                │ │   │
│  │  └────────────────────────────────────────────────────┘ │   │
│  │                                                          │   │
│  │  ┌─ Risk Assessment ──────────────────────────────────┐ │   │
│  │  │ 🟢 Low Risk                                         │ │   │
│  │  │ • No unlimited approvals detected                  │ │   │
│  │  │ • Known DEX router                                 │ │   │
│  │  └────────────────────────────────────────────────────┘ │   │
│  │                                                          │   │
│  │  [Method] [Events] [RAG Explanation] [Trace]            │   │
│  │  ┌────────────────────────────────────────────────────┐ │   │
│  │  │ Tab Content...                                     │ │   │
│  │  └────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ Timing ────────────────────────────────────────────────┐   │
│  │ Total: 1,234ms │ Parse: 456ms │ RAG: 778ms              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 2.2.1 输入区域
- **链选择器**：下拉选择支持的链（Ethereum, BSC, Polygon, Arbitrum, Optimism）
- **交易哈希输入**：支持粘贴完整哈希，自动校验格式（0x + 64 hex）
- **选项**：
  - Include RAG Explanation（默认开启）
  - Include Trace Log（默认关闭）
- **分析按钮**：点击发起请求，显示 loading 状态

#### 2.2.2 结果展示区域

**Overview 卡片**
- 交易状态（Success/Failed）
- 区块号、时间戳
- From/To 地址（可点击跳转到区块浏览器）
- Value（原生代币数量）
- Gas 费用
- 行为类型 + 置信度

**Risk Assessment 卡片**
- 风险等级指示器（🟢 Low / 🟡 Medium / 🔴 High）
- 风险原因列表
- RAG 生成的摘要

**详情 Tabs**
- **Method**：解码后的方法调用，参数表格展示
- **Events**：事件列表，分类展示（Transfer, Swap, Approval 等）
- **RAG Explanation**：RAG 生成的详细解释（Markdown 渲染）
- **Trace**：执行步骤时间线（可折叠）

#### 2.2.3 性能指标
底部显示各阶段耗时，帮助理解分析性能。

---

### 2.3 历史记录页面 (`/history`)

```
┌─────────────────────────────────────────────────────────────────┐
│  📜 Analysis History                             [← Back] [🔄]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Filter: [All Chains ▼] [All Status ▼]    Search: [________]   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Chain │ Tx Hash        │ Behavior │ Risk  │ Time       │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ 🔷 ETH │ 0xabc...123   │ Swap     │ 🟢 Low │ 2 min ago  │   │
│  │ 🟡 BSC │ 0xdef...456   │ Approve  │ 🔴 High│ 5 min ago  │   │
│  │ 🟣 POLY│ 0x789...abc   │ Transfer │ 🟢 Low │ 10 min ago │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [< Prev]  Page 1 of 10  [Next >]                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- 分页表格展示历史记录
- 支持按链、状态筛选
- 支持交易哈希搜索
- 点击行跳转到详情页

---

### 2.4 详情页面 (`/tx/:traceId`)

与首页分析结果区域相同，但：
- 从历史记录加载数据
- 显示更完整的 trace 日志
- 支持分享链接

---

### 2.5 链信息页面 (`/chains`)

```
┌─────────────────────────────────────────────────────────────────┐
│  ⛓️ Supported Chains                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ 🔷 Ethereum  │ │ 🟡 BSC       │ │ 🟣 Polygon   │            │
│  │ Chain ID: 1  │ │ Chain ID: 56 │ │ Chain ID:137 │            │
│  │ Token: ETH   │ │ Token: BNB   │ │ Token: MATIC │            │
│  │ [Explorer →] │ │ [Explorer →] │ │ [Explorer →] │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
│                                                                 │
│  ┌──────────────┐ ┌──────────────┐                             │
│  │ 🔵 Arbitrum  │ │ 🔴 Optimism  │                             │
│  │ Chain ID:42161│ │ Chain ID: 10│                             │
│  │ Token: ETH   │ │ Token: ETH   │                             │
│  │ [Explorer →] │ │ [Explorer →] │                             │
│  └──────────────┘ └──────────────┘                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

展示所有支持的链及其基本信息。

---

## 3. 组件设计

### 3.1 UI 基础组件（复用 shadcn/ui 风格）

```typescript
// 从 frontend-admin 复用或创建
components/ui/
├── button.tsx
├── input.tsx
├── select.tsx
├── checkbox.tsx
├── card.tsx
├── badge.tsx
├── tabs.tsx
├── table.tsx
├── tooltip.tsx
├── toast.tsx
├── dialog.tsx
├── skeleton.tsx
└── separator.tsx
```

### 3.2 业务组件

```typescript
components/shared/
├── AddressDisplay.tsx     // 地址展示（缩写 + 复制 + 跳转）
├── HashDisplay.tsx        // 哈希展示
├── ChainBadge.tsx         // 链标识徽章
├── RiskBadge.tsx          // 风险等级徽章
├── BehaviorBadge.tsx      // 行为类型徽章
├── TokenAmount.tsx        // 代币数量展示
├── GasDisplay.tsx         // Gas 信息展示
├── TimeAgo.tsx            // 相对时间展示
└── LoadingState.tsx       // 加载状态

features/analyze/
├── AnalyzeForm.tsx        // 分析表单
├── ResultOverview.tsx     // 结果概览卡片
├── RiskAssessment.tsx     // 风险评估卡片
├── MethodDetail.tsx       // 方法详情
├── EventList.tsx          // 事件列表
├── EventItem.tsx          // 单个事件
├── RagExplanation.tsx     // RAG 解释（Markdown）
├── TraceTimeline.tsx      // Trace 时间线
├── TimingBar.tsx          // 耗时条形图
└── AnalyzeResult.tsx      // 结果容器

features/history/
├── HistoryTable.tsx       // 历史表格
├── HistoryFilters.tsx     // 筛选器
└── HistoryPagination.tsx  // 分页

features/chains/
├── ChainCard.tsx          // 链信息卡片
└── ChainGrid.tsx          // 链网格
```

### 3.3 布局组件

```typescript
components/layout/
├── AppLayout.tsx          // 应用布局
├── Header.tsx             // 顶部导航
├── Sidebar.tsx            // 侧边栏（可选）
└── Footer.tsx             // 底部信息
```

---

## 4. API 集成

### 4.1 API 类型定义

```typescript
// src/api/types.ts

// 链信息
export interface ChainInfo {
  chain_id: number;
  name: string;
  native_token: string;
  explorer_url: string;
}

// 分析选项
export interface AnalyzeOptions {
  include_explanation?: boolean;
  include_trace?: boolean;
  language?: 'zh' | 'en';
}

// 分析请求
export interface AnalyzeRequest {
  chain_id: number;
  tx_hash: string;
  options?: AnalyzeOptions;
}

// Gas 信息
export interface GasInfo {
  gas_used: string;
  gas_price: string;
  fee_paid: string;
}

// 解码方法
export interface DecodedMethod {
  signature: string;
  selector: string;
  name: string;
  inputs: Array<{
    name: string;
    type: string;
    value: unknown;
  }>;
  abi_source: 'registry' | 'explorer' | 'signature_db' | 'unknown';
}

// 解码事件
export interface DecodedEvent {
  name: string;
  address: string;
  log_index: number;
  topics: string[];
  args: Record<string, unknown>;
  event_type: string;
}

// 行为结果
export interface BehaviorResult {
  type: 'swap' | 'bridge' | 'stake' | 'transfer' | 'approve' | 'unknown' | string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  details: Record<string, unknown>;
}

// 风险标签
export interface RiskFlag {
  type: string;
  severity: 'low' | 'medium' | 'high';
  evidence: string;
  description: string;
}

// 解析结果
export interface ParseResult {
  version: string;
  tx_hash: string;
  chain_id: number;
  block_number: number | null;
  timestamp: number | null;
  from: string;
  to: string | null;
  nonce: number | null;
  tx_type: number | null;
  value: string;
  input: string;
  gas: GasInfo;
  status: 'success' | 'failed';
  method: DecodedMethod | null;
  events: DecodedEvent[];
  behavior: BehaviorResult;
  risk_flags: RiskFlag[];
}

// RAG 解释结果
export interface ExplanationResult {
  summary: string;
  risk_level: 'low' | 'medium' | 'high' | 'unknown';
  risk_reasons: string[];
  actions: Array<Record<string, unknown>>;
  sources: Array<Record<string, unknown>>;
}

// Trace 步骤
export interface TraceStep {
  name: string;
  start_time: string;
  end_time: string | null;
  duration_ms: number | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
}

// 分析响应
export interface AnalyzeResponse {
  trace_id: string;
  status: 'success' | 'partial' | 'failed';
  parse_result: ParseResult | null;
  explanation: ExplanationResult | null;
  timings: Record<string, number>;
  error: string | null;
  trace_log: TraceStep[] | null;
}

// 健康检查响应
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  version: string;
  dependencies: Record<string, string>;
}
```

### 4.2 API Hooks

```typescript
// src/api/hooks.ts
import { useQuery, useMutation } from '@tanstack/react-query';

// 获取支持的链
export function useChains() {
  return useQuery({
    queryKey: ['chains'],
    queryFn: () => api.getChains(),
    staleTime: 5 * 60 * 1000, // 5 分钟
  });
}

// 分析交易
export function useAnalyzeTransaction() {
  return useMutation({
    mutationFn: (request: AnalyzeRequest) => api.analyzeTransaction(request),
  });
}

// 获取历史记录
export function useHistory(params: HistoryParams) {
  return useQuery({
    queryKey: ['history', params],
    queryFn: () => api.getHistory(params),
  });
}

// 获取单条分析详情
export function useAnalysisDetail(traceId: string) {
  return useQuery({
    queryKey: ['analysis', traceId],
    queryFn: () => api.getAnalysisDetail(traceId),
    enabled: !!traceId,
  });
}

// 健康检查
export function useHealthCheck() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api.healthCheck(),
    refetchInterval: 30 * 1000, // 30 秒
  });
}
```

---

## 5. 状态管理

使用 React Query 管理服务端状态，使用 React Context 管理少量客户端状态：

```typescript
// src/context/SettingsContext.tsx
interface Settings {
  defaultChain: number;
  includeExplanation: boolean;
  includeTrace: boolean;
  language: 'zh' | 'en';
}

// 持久化到 localStorage
```

---

## 6. 样式设计

### 6.1 主题色
```css
:root {
  /* 主色调 - OneKey 品牌色 */
  --primary: #00b894;
  --primary-hover: #00a884;

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

  /* 状态颜色 */
  --status-success: #00b894;
  --status-failed: #e74c3c;
  --status-pending: #fdcb6e;
}
```

### 6.2 响应式断点
```css
/* Mobile first */
sm: 640px   /* 小屏 */
md: 768px   /* 平板 */
lg: 1024px  /* 桌面 */
xl: 1280px  /* 大屏 */
```

---

## 7. 部署配置

### 7.1 Docker 配置

```yaml
# docker-compose.yml 新增
frontend-tx-analyzer:
  image: node:20-alpine
  profiles: ["frontend"]
  working_dir: /app
  command: ["sh", "-c", "corepack enable && pnpm install --frozen-lockfile && pnpm dev -- --host 0.0.0.0"]
  environment:
    VITE_TX_ANALYZER_API_URL: http://web3-tx-analyzer:8001
  ports:
    - "5175:5175"
  volumes:
    - ./frontend-tx-analyzer:/app
    - frontend-tx-analyzer-node-modules:/app/node_modules
  depends_on:
    web3-tx-analyzer:
      condition: service_started
```

### 7.2 Nginx 配置（生产）
```nginx
server {
    listen 80;
    server_name tx-analyzer.example.com;

    location / {
        root /var/www/tx-analyzer;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://web3-tx-analyzer:8001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 8. TODO List

### Phase 1: 基础框架（MVP）
- [ ] 初始化项目（Vite + React + TypeScript）
- [ ] 配置 TailwindCSS
- [ ] 创建基础 UI 组件
- [ ] 实现 API 客户端
- [ ] 实现首页分析表单
- [ ] 实现结果展示（Overview + Risk）
- [ ] 基本响应式布局

### Phase 2: 完善功能
- [ ] 实现 Method/Events/Trace Tabs
- [ ] 实现 RAG Explanation 渲染（Markdown）
- [ ] 实现历史记录页面
- [ ] 实现链信息页面
- [ ] 添加 Toast 通知

### Phase 3: 优化体验
- [ ] 添加骨架屏加载状态
- [ ] 实现暗色模式
- [ ] 优化移动端体验
- [ ] 添加键盘快捷键
- [ ] 性能优化（虚拟列表等）

### Phase 4: 部署上线
- [ ] 配置生产构建
- [ ] 更新 docker-compose
- [ ] 配置 Nginx
- [ ] 编写部署文档

---

## 9. 交互细节

### 9.1 输入校验
- 交易哈希格式：`/^0x[a-fA-F0-9]{64}$/`
- 输入时实时校验，显示错误提示
- 支持粘贴时自动清理空格和换行

### 9.2 Loading 状态
- 分析按钮显示 spinner
- 结果区域显示骨架屏
- 预计耗时提示（首次约 2-5 秒）

### 9.3 错误处理
- 网络错误：显示重试按钮
- 交易不存在：友好提示
- 服务降级：显示可用功能

### 9.4 复制功能
- 地址/哈希点击复制
- 完整 JSON 结果复制
- Toast 提示复制成功

### 9.5 外部链接
- 地址/交易哈希链接到区块浏览器
- 新标签页打开
- 根据链选择正确的浏览器

---

## 10. 示例数据

### 10.1 成功的 Swap 交易
```json
{
  "trace_id": "tx_abc123",
  "status": "success",
  "parse_result": {
    "tx_hash": "0x1234...abcd",
    "chain_id": 1,
    "block_number": 19234567,
    "from": "0xuser...addr",
    "to": "0xrouter...addr",
    "value": "500000000000000000",
    "status": "success",
    "method": {
      "name": "swapExactTokensForTokens",
      "inputs": [
        {"name": "amountIn", "type": "uint256", "value": "1000000000000000000"},
        {"name": "amountOutMin", "type": "uint256", "value": "990000000"}
      ]
    },
    "behavior": {
      "type": "swap",
      "confidence": "high",
      "evidence": ["DEX router call", "Swap events detected"]
    },
    "risk_flags": []
  },
  "explanation": {
    "summary": "这是一笔通过 Uniswap V2 进行的代币交换交易...",
    "risk_level": "low",
    "risk_reasons": []
  },
  "timings": {
    "total_ms": 1234,
    "fetch_tx_ms": 156,
    "decode_ms": 78,
    "call_rag_ms": 890
  }
}
```

### 10.2 高风险的 Approve 交易
```json
{
  "trace_id": "tx_def456",
  "status": "success",
  "parse_result": {
    "method": {
      "name": "approve",
      "inputs": [
        {"name": "spender", "type": "address", "value": "0xunknown..."},
        {"name": "amount", "type": "uint256", "value": "115792089237316195423570985008687907853269984665640564039457584007913129639935"}
      ]
    },
    "behavior": {
      "type": "approve",
      "confidence": "high"
    },
    "risk_flags": [
      {
        "type": "unlimited_approve",
        "severity": "high",
        "description": "无限授权给未知地址"
      }
    ]
  },
  "explanation": {
    "summary": "这笔交易将无限量的代币授权给一个未知地址...",
    "risk_level": "high",
    "risk_reasons": [
      "无限授权（Max uint256）",
      "接收地址无法验证身份"
    ]
  }
}
```

---

## 11. 附录

### 11.1 链图标 SVG
建议使用各链官方图标，或使用 lucide-react 中的通用图标。

### 11.2 参考设计
- Etherscan Transaction Detail
- BlockScout Transaction View
- DeBank Transaction Analysis
- Tenderly Transaction Trace

### 11.3 无障碍要求
- 支持键盘导航
- 正确的 ARIA 标签
- 足够的颜色对比度
- 屏幕阅读器友好
