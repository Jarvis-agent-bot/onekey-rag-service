# RAG 后台管理系统前端重构计划

> 基于对 `frontend-admin` 目录下所有页面组件的详细审查

---

## 一、概述

本文档针对 RAG 后台管理系统前端进行全面审查，从以下维度进行分析：
- UI 交互问题
- 无用/冗余功能
- 流程问题
- 描述/文案问题

### 当前页面清单

| 页面 | 路径 | 功能描述 |
|------|------|----------|
| DashboardPage | `/` | 仪表盘概览 |
| AppsPage | `/apps` | 应用列表管理 |
| AppDetailPage | `/apps/:appId` | 应用详情与配置 |
| KbsPage | `/kbs` | 知识库列表 |
| KbDetailPage | `/kbs/:kbId` | 知识库详情与数据源配置 |
| PagesPage | `/pages` | 页面/文档列表 |
| PageDetailPage | `/pages/:pageId` | 页面详情 |
| JobsPage | `/jobs` | 任务列表 |
| JobDetailPage | `/jobs/:jobId` | 任务详情 |
| FeedbackPage | `/feedback` | 用户反馈管理 |
| QualityPage | `/quality` | 质量指标监控 |
| ObservabilityPage | `/observability` | 可观测性监控 |
| AuditPage | `/audit` | 审计日志 |
| SettingsPage | `/settings` | 系统设置 |
| LoginPage | `/login` | 登录页 |

---

## 二、核心问题（P0 - 必须优先解决）

### 2.0.1 导航结构混乱，用户无法理解概念关系

**严重程度**：🔴 高

**当前侧边栏导航**（AdminLayout.tsx 第14-25行）：
```
总览 → 应用 → 知识库 → 页面 → 任务 → 反馈 → 质量 → 观测 → 审计 → 设置
```

**问题分析**：

1. **概念割裂，用户不知道它们之间的关系**：
   - 「知识库」是什么？和「页面」什么关系？
   - 「任务」是什么？谁触发的？和知识库有什么关系？
   - 「应用」和「知识库」有什么关联？

2. **数据流向不清晰**：
   ```
   实际关系：应用 → 绑定知识库 → 知识库有数据源 → 数据源触发任务 → 任务产出页面 → 页面建索引
   用户理解：??? 完全看不懂
   ```

3. **命名不一致**：
   - 侧边栏叫「任务」
   - 页面标题叫「任务中心」（Task Center）
   - 是同一个东西吗？

4. **入口过多，职责重叠**：
   - 从「知识库详情」可以触发抓取
   - 从「任务」页面也可以触发抓取
   - 从「页面」列表也能触发重新抓取
   - 用户应该去哪里操作？

**建议重构方案**：

**方案 A：按数据流重组导航**
```
├── 总览（Dashboard）
├── 应用管理
│   └── 应用详情（含绑定的知识库）
├── 知识库（核心概念）
│   ├── 知识库详情
│   │   ├── 数据源管理（网站/文件）
│   │   ├── 内容列表（原「页面」）
│   │   └── 任务历史（该 KB 的任务）
├── 任务中心（全局视图，可选保留）
├── 运营
│   ├── 反馈管理
│   └── 质量监控
├── 系统
│   ├── 观测
│   ├── 审计
│   └── 设置
```

**方案 B：简化为核心三板块**
```
├── 总览
├── 内容管理（知识库 + 数据源 + 页面，合并）
├── 应用管理
├── 任务管理
├── 运营监控（反馈 + 质量 + 观测，合并）
├── 系统设置（审计 + 设置）
```

**最低限度修复**：
- [ ] 添加导航分组标题（如「内容」「运营」「系统」）
- [ ] 在每个页面顶部添加简短说明文案，解释该页面的作用和上下文
- [ ] 实现面包屑导航，显示层级关系

---

### 2.0.2 任务触发表单设计问题

**严重程度**：🔴 高

**位置**：JobsPage.tsx 第551-666行「触发抓取」表单

**当前设计问题**：

1. **所有字段都标记为「可选」，但逻辑上不合理**：
   ```tsx
   // 第605行
   <div className="text-xs text-muted-foreground">base_url（可选）</div>

   // 第610行
   <div className="text-xs text-muted-foreground">sitemap_url（可选）</div>

   // 第615行
   <div className="text-xs text-muted-foreground">seed_urls（可选，每行一个）</div>
   ```

2. **核心问题**：
   - 如果都不填，爬虫从哪里开始？依赖数据源的预配置？
   - 用户不知道数据源有没有配置这些值
   - 表单没有显示数据源当前配置值作为参考

3. **字段必填逻辑应该是**：
   - `base_url`：**必填**（定义爬取的域名范围）
   - `sitemap_url` 或 `seed_urls`：**至少填一个**（定义入口点）
   - 如果数据源已有配置，可以显示「使用数据源配置」作为默认选项

4. **不应该有隐式默认值**：
   - 当前代码会回退到数据源配置（第159-167行）
   - 但用户看不到这个默认值是什么
   - 应该显式展示：「当前数据源配置的 base_url 是 xxx，要使用吗？」

**建议修改**：

```
触发抓取表单：

知识库：[选择]  ← 必填
数据源：[选择]  ← 必填

━━━ URL 配置 ━━━
○ 使用数据源已有配置
   base_url: https://example.com （来自数据源）
   sitemap_url: https://example.com/sitemap.xml

● 自定义（覆盖数据源配置）
   base_url: [必填] _______________
   入口点（至少填一项）：
   - sitemap_url: [可选] _______________
   - seed_urls: [可选，每行一个]
     _______________
     _______________

━━━ 高级选项 ━━━
max_pages: [可选，不填则无限制] ___
include_patterns: [可选] ___
exclude_patterns: [可选] ___
```

**代码修改建议**：
- [ ] 显示数据源当前配置值
- [ ] `base_url` 改为必填（或选择「使用数据源配置」）
- [ ] `sitemap_url` / `seed_urls` 至少填一个的校验
- [ ] 移除所有隐式默认值，改为显式选择

---

### 2.0.3 知识库详情页过于复杂

**严重程度**：🔴 高

**位置**：KbDetailPage.tsx（759 行代码）

**当前设计问题**：

1. **Tab 结构过多，层级深**：
   ```
   概览(overview) | 数据源(sources) | 文件(files) | 配置(config) | 调试(debug)
   ```
   - 5 个 Tab 对于普通用户信息过载
   - 「调试」Tab 是否面向运维人员？普通用户是否需要？

2. **状态管理混乱**：
   ```tsx
   // 多个独立的编辑状态
   const [isEditingKb, setIsEditingKb] = useState(false);
   const [isCreatingSource, setIsCreatingSource] = useState(false);
   const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
   ```
   - 三套独立的编辑模式，可能冲突
   - 用户同时触发多个编辑时行为不确定

3. **数据源创建表单与任务触发表单同样问题**：
   ```tsx
   const [newSourceConfigText, setNewSourceConfigText] = useState(
     JSON.stringify({
       base_url: "",
       sitemap_url: "",
       seed_urls: [],
       // ...
     }, null, 2)
   );
   ```
   - 使用 JSON 文本输入，对非技术用户不友好
   - 没有表单校验，用户可能输入无效 JSON
   - 没有字段说明

4. **「文件」Tab 功能定位不清**：
   - 与「数据源」Tab 有什么区别？
   - 文件上传和网站爬取的关系是什么？

**建议修改**：
- [ ] 减少 Tab 数量，合并相关功能
- [ ] 「调试」功能移到开发者选项或单独页面
- [ ] 数据源配置改为结构化表单，非 JSON 文本
- [ ] 添加表单校验和字段说明
- [ ] 明确「文件」和「数据源」的区别说明

---

### 2.0.4 应用详情页 KB 绑定机制复杂难懂

**严重程度**：🟡 中高

**位置**：AppDetailPage.tsx（374 行）

**当前设计问题**：

1. **权重分配概念不直观**：
   ```tsx
   <Input
     type="number"
     min={0}
     max={100}
     value={b.weight}
     onChange={(e) => {
       // ...
     }}
   />
   ```
   - 权重需要手动输入数字
   - 总和必须为 100，但没有直观提示
   - 用户如何知道权重的作用？

2. **优先级(priority)概念与权重(weight)混淆**：
   - 两个字段都会影响检索，但区别是什么？
   - 普通用户无法理解：「权重大 vs 优先级高」哪个更重要？

3. **allocateTopK 自动分配逻辑不透明**：
   ```tsx
   const { items: newItems, totalTopK } = allocateTopK(draft, app.top_k);
   ```
   - 自动分配算法用户看不到
   - 用户修改一个值，其他值自动变化，可能造成困惑

**建议修改**：
- [ ] 添加「权重」「优先级」的说明 tooltip
- [ ] 使用滑块(Slider)代替数字输入，更直观
- [ ] 显示当前权重总和，实时提示是否满足 100
- [ ] 考虑简化为单一配置项（如只保留权重或优先级）

---

### 2.0.5 页面列表批量操作无进度反馈

**严重程度**：🟡 中

**位置**：PagesPage.tsx（runBulkRecrawl 函数）

**当前设计问题**：

```tsx
async function runBulkRecrawl(pageIds: number[]) {
  setBulkProgress({ running: true, done: 0, total: pageIds.length, failed: 0 });
  // ... worker 并发处理
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  setBulkProgress((p) => ({ ...p, running: false }));
}
```

**问题**：
1. 批量操作期间 UI 可能卡顿
2. 进度显示只有数字，没有进度条
3. 失败的任务没有详细错误信息
4. 无法中途取消

**建议修改**：
- [ ] 添加可视化进度条组件
- [ ] 显示当前正在处理的页面
- [ ] 失败任务记录详细错误
- [ ] 添加「取消」按钮

---

### 2.0.6 观测页面双时间范围选择器造成混淆

**严重程度**：🟡 中

**位置**：ObservabilityPage.tsx

**当前设计问题**：

页面存在两套独立的时间范围控制：
1. 事件列表的时间范围（dateRange）
2. 资源监控图表的时间范围（metricsRange）

```tsx
// 事件时间范围
const dateRange = (sp.get("date_range") || "24h").trim();

// 指标时间范围
const [metricsRange, setMetricsRange] = useState<"1h" | "6h" | "24h">("1h");
```

**问题**：
- 两个时间选择器在不同位置，用户可能以为是同一个
- 事件用 24h/7d/30d，指标用 1h/6h/24h，不一致
- 修改一个不影响另一个，但用户可能期望联动

**建议修改**：
- [ ] 明确标注两个时间范围的作用域
- [ ] 考虑统一为全局时间范围
- [ ] 或用不同颜色/样式区分两个控件

---

## 三、UI 交互问题

### 3.1 重复组件问题

#### 问题 A：时间范围选择器重复

**涉及页面**：FeedbackPage、AuditPage、ObservabilityPage

**具体表现**：
- 页面顶部 Header 区域有一个时间范围选择器
- 筛选卡片区域又有一个相同功能的时间范围选择器
- 两个选择器绑定相同的状态，功能完全重复

**代码示例（FeedbackPage.tsx）**：
```tsx
// 顶部 Header 区域 - 第102-111行
<Select value={dateRange} onChange={(e) => updateFilter([["date_range", e.target.value]])}>
  <option value="24h">24h</option>
  <option value="7d">7d</option>
  <option value="30d">30d</option>
</Select>

// 筛选卡片区域 - 第148-159行（重复）
<Select value={dateRange} onChange={(e) => updateFilter([["date_range", e.target.value]])}>
  <option value="24h">24h</option>
  <option value="7d">7d</option>
  <option value="30d">30d</option>
</Select>
```

**建议**：
- [ ] 移除筛选卡片内的时间范围选择器，仅保留顶部 Header 的
- [ ] 或者将顶部改为"快捷切换"样式（如 Tab/按钮组），筛选区保留完整下拉

---

#### 问题 B：筛选逻辑代码重复

**涉及页面**：几乎所有列表页面

**具体表现**：
每个页面都独立实现了相似的 `updateFilter` 函数和 `FilterChips` 生成逻辑：

```tsx
// 多个页面都有类似代码
function updateFilter(nextKV: Array<[string, string | null]>) {
  const next = new URLSearchParams(sp);
  next.set("page", "1");
  for (const [k, v] of nextKV) {
    const vv = (v || "").trim();
    if (!vv) next.delete(k);
    else next.set(k, vv);
  }
  setSp(next, { replace: true });
}
```

**建议**：
- [ ] 抽取通用的 `useFilterParams` Hook
- [ ] 创建统一的筛选组件封装

---

### 2.2 加载状态体验不佳

**涉及页面**：所有数据请求页面

**具体表现**：
```tsx
{q.isLoading ? <div className="text-sm text-muted-foreground">加载中...</div> : null}
```

加载状态只是简单的文字提示，没有：
- 骨架屏（Skeleton）
- 加载动画/Spinner
- 局部加载指示器

**建议**：
- [ ] 实现统一的 Loading 组件（带 Spinner 或骨架屏）
- [ ] 针对表格实现 Table Skeleton
- [ ] 考虑使用 React Query 的 `placeholderData` 优化体验

---

### 2.3 表格响应式问题

**涉及页面**：FeedbackPage、AuditPage、JobsPage、PagesPage

**具体表现**：
- 表格只使用 `overflow-x-auto` 处理溢出
- 列宽使用固定 `max-w-[xxxpx]` 限制
- 在小屏幕上需要大量横向滚动

**代码示例**：
```tsx
<td className="py-2 max-w-[260px] break-words">...</td>
```

**建议**：
- [ ] 对于移动端考虑卡片式布局替代表格
- [ ] 实现可折叠的表格行
- [ ] 允许用户选择显示哪些列

---

### 2.4 空状态处理不一致

**涉及页面**：多个列表页面

**具体表现**：
- 部分页面使用 `EmptyState` 组件
- 部分页面只显示空表格
- EmptyState 的 actions 内容不统一

**建议**：
- [ ] 统一空状态组件的使用方式
- [ ] 定义标准的空状态消息和操作按钮

---

### 2.5 表单交互问题

#### 问题 A：Input 无即时反馈

**涉及页面**：FeedbackPage、AuditPage、JobsPage

**具体表现**：
Input 的 onChange 直接触发 URL 参数更新并刷新数据，没有 debounce：
```tsx
<Input
  value={reason}
  onChange={(e) => {
    updateFilter([["reason", e.target.value]]);  // 每次输入都触发
  }}
/>
```

**建议**：
- [ ] 添加防抖（debounce）机制
- [ ] 或改为 "回车/确认按钮" 触发筛选

#### 问题 B：Select 组件样式

**现象**：使用自定义 Select 组件但样式较为简单

**建议**：
- [ ] 考虑使用 Radix Select 或 Headless UI 的 Listbox 增强体验
- [ ] 支持搜索功能（当选项较多时）

---

## 三、无用/冗余功能

### 3.1 QualityPage 统计范围限制

**位置**：QualityPage.tsx

**问题描述**：
页面描述称"统计最近 7 天"，但 7 天的时间范围是硬编码的，用户无法调整：
```tsx
<div className="text-sm text-muted-foreground">统计最近 7 天 · 可用于召回质量判断。</div>
```

**建议**：
- [ ] 如果确定只支持 7 天，可以保持现状但优化文案
- [ ] 如果需要灵活性，应添加时间范围选择器

---

### 3.2 部分 FilterChips 逻辑可能无用

**位置**：FeedbackPage.tsx 第71-73行

**代码**：
```tsx
dateRange && dateRange !== "24h"
  ? { key: "date_range", label: "range", value: dateRange, onRemove: () => updateFilter([["date_range", "24h"]]) }
  : null,
```

**问题**：当时间范围是默认值 "24h" 时不显示 chip，但用户可能不理解为什么 24h 不显示标签

**建议**：
- [ ] 统一：要么始终显示时间范围 chip，要么完全不使用 chip 显示时间范围

---

### 3.3 Login 页面的 Checkbox

**位置**：LoginPage.tsx

**问题**：页面有"记住密码"相关的 UI 暗示，但实际功能可能未实现或依赖浏览器自动填充

**建议**：
- [ ] 确认是否需要"记住我"功能
- [ ] 如果不需要，移除相关 UI 元素

---

### 3.4 SettingsPage 只读配置

**位置**：SettingsPage.tsx

**问题**：页面标题写着"上游模型配置（可读）"，暗示这是只读视图，但用户可能期望能够编辑

**建议**：
- [ ] 明确告知用户配置需要在哪里修改（后端配置文件/环境变量）
- [ ] 或者提供编辑功能入口

---

### 3.5 QualityPage 专业术语过多

**位置**：QualityPage.tsx

**问题**：
页面展示了大量技术指标，对非技术用户不友好：
- `tokens_by_model`：什么是 token？
- `rerank_effect`：rerank 是什么意思？
- `retrieval_count`、`avg_latency_ms`：技术术语

**当前文案示例**：
```tsx
<Card title="Rerank 效果分布" description="rerank 后分数分布；可用于调整 top-k 与阈值策略">
```

**建议**：
- [ ] 为技术指标添加通俗解释 tooltip
- [ ] 考虑提供「简洁模式」和「专业模式」切换
- [ ] 关键指标配合可视化图表展示趋势

---

### 3.6 PageDetailPage 功能单薄

**位置**：PageDetailPage.tsx（198 行）

**问题**：
页面详情页功能较少，主要是只读展示：
- 查看页面元数据
- 查看 chunk 统计
- 查看 markdown 内容
- 操作：重新抓取、删除

**缺失功能**：
- 无法编辑页面内容
- 无法手动调整 chunk 切分
- 无法查看该页面被哪些查询命中过
- 无法查看 embedding 向量质量

**建议**：
- [ ] 明确该页面的定位（只读展示还是内容管理）
- [ ] 如需编辑功能，添加内容编辑器
- [ ] 添加「查询命中历史」关联功能

---

### 3.7 FeedbackPage Triage 操作缺乏上下文

**位置**：FeedbackPage.tsx + FeedbackTriage 组件

**问题**：
FeedbackTriage 组件允许修改状态、归因和标签，但：
```tsx
<FeedbackTriage
  feedbackId={it.id}
  status={it.status}
  attribution={it.attribution}
  tags={it.tags || []}
/>
```

- 用户看不到触发反馈的完整对话
- 无法判断归因是否正确
- `attribution` 字段值来源不清楚

**建议**：
- [ ] 添加「查看完整对话」按钮，跳转或弹窗展示
- [ ] attribution 改为下拉选择（预定义归因类型）
- [ ] 添加批量 Triage 功能

---

### 3.8 表格列过多导致横向滚动

**涉及页面**：FeedbackPage、AuditPage、JobsPage、PagesPage

**问题**：
多个列表页表格列数过多，在普通显示器上需要横向滚动：

| 页面 | 列数 | 问题列 |
|------|------|--------|
| FeedbackPage | 10 列 | conversation_id, message_id 占用大量空间 |
| PagesPage | 多列 | 筛选项过多 |
| JobsPage | 多列 | 状态、时间、配置信息 |

**建议**：
- [ ] 实现可折叠的列显示
- [ ] 默认隐藏不常用列，允许用户自定义
- [ ] ID 类长字段使用省略显示 + 点击复制

---

## 四、流程问题

### 4.1 路由守卫缺失/不明显

**位置**：router.tsx

**问题**：
- Login 页面独立于 AdminLayout
- 但没有明显的路由守卫逻辑来保护需要登录的页面
- 用户未登录时直接访问 `/apps` 等页面的行为不明确

**建议**：
- [ ] 实现显式的 AuthGuard 组件
- [ ] 未登录用户访问受保护路由时自动跳转到登录页
- [ ] 登录后跳转回原目标页面

---

### 4.2 Workspace 切换流程不清晰

**位置**：多个页面（useWorkspace hook）

**问题**：
- workspaceId 来自 `useWorkspace` hook
- 但 workspace 切换的入口不明显
- 用户如何知道当前在哪个 workspace？如何切换？

**建议**：
- [ ] 在 Header 或 Sidebar 添加明显的 Workspace 选择器
- [ ] 显示当前 Workspace 名称而不仅仅是 ID

---

### 4.3 详情页导航割裂

**涉及页面**：KbDetailPage、AppDetailPage

**问题**：
从 KbDetailPage 可以跳转到 PagesPage 查看该 KB 下的文档，但：
- 跳转后失去了"返回知识库详情"的上下文
- 用户需要手动返回

**建议**：
- [ ] 实现面包屑导航
- [ ] 或在筛选后的列表页顶部显示当前筛选上下文和快速返回链接

---

### 4.4 Job 触发流程

**位置**：JobsPage.tsx、KbDetailPage.tsx

**问题**：
- 有多个入口可以触发 Job（Jobs 列表页、KB 详情页、Pages 列表页）
- 触发 Job 的参数和选项在不同入口可能不一致
- 用户可能不清楚哪里是最佳触发入口

**建议**：
- [ ] 统一 Job 触发组件
- [ ] 明确不同触发场景的差异

---

### 4.5 反馈 Triage 流程

**位置**：FeedbackPage.tsx + FeedbackTriage 组件

**问题**：
- FeedbackTriage 组件内嵌在表格中
- 但 Triage 操作（修改状态、归因、标签）的上下文信息不足
- 用户需要查看对话详情才能正确归因，但当前流程中这一步不够直观

**建议**：
- [ ] 添加"查看对话上下文"的快捷入口
- [ ] 或实现详情抽屉/弹窗展示完整对话

---

## 五、描述/文案问题

### 5.1 中英文混用

**涉及页面**：几乎所有页面

**具体表现**：

| 位置 | 当前文案 | 问题 |
|------|----------|------|
| FeedbackPage 表头 | `rating`, `reason`, `comment` | 表头使用英文，但其他地方用中文 |
| FeedbackPage 筛选标签 | `rating`/`reason` 直接作为 label | 应统一为中文 |
| AuditPage 表头 | `meta` | 技术术语，普通用户可能不理解 |
| JobsPage | `kind`, `scope`, `status` | 混用技术术语 |

**建议**：
- [ ] 制定统一的术语表
- [ ] UI 文案统一使用中文
- [ ] 技术字段在必要时提供中文说明

**示例修改**：
```
rating → 评分
reason → 原因分类
comment → 用户评论
meta → 详细信息
kind → 任务类型
scope → 范围
status → 状态
```

---

### 5.2 描述文案不一致

**示例**：

| 页面 | 卡片标题 | description |
|------|----------|-------------|
| FeedbackPage | 筛选 | "rating/reason/app 过滤；message_id 通常可用于关联检索事件（request_id）" |
| FeedbackPage | 列表 | "后续可扩展：标注、归因、运营看板、评测集回归" |

**问题**：
- description 混杂了功能说明和未来规划
- 包含技术术语（message_id、request_id）
- 对普通运营人员不够友好

**建议**：
- [ ] 区分"用户指南"和"开发备注"
- [ ] UI 中只显示用户指南
- [ ] 开发备注放到代码注释中

---

### 5.3 Placeholder 文案

**涉及页面**：多个筛选区域

**具体表现**：
```tsx
placeholder="例如 hallucination / not_helpful"
```

**问题**：
- Placeholder 使用了英文专业术语
- 普通用户可能不知道可选值有哪些

**建议**：
- [ ] 如果值是枚举的，改用 Select 组件
- [ ] 如果是自由输入，提供更友好的示例

---

### 5.4 页面标题层级

**问题**：
页面顶部 Header 区域有三层信息：
1. 英文标签（如 "Feedback"）
2. 中文标题（如 "用户反馈"）
3. 描述文案

**建议**：
- [ ] 考虑简化为两层：主标题 + 描述
- [ ] 英文标签可作为设计元素保留，但应确保样式一致

---

## 六、技术债务

### 6.1 类型定义分散

**问题**：每个页面文件内部定义了大量类型（如 `FeedbackResp`、`AuditLogsResp`）

**建议**：
- [ ] 创建统一的 `types/` 目录
- [ ] 按领域组织类型定义
- [ ] 考虑从后端 OpenAPI schema 自动生成类型

---

### 6.2 API 调用模式

**问题**：
- 使用 `apiFetch` 直接构造 URL
- URL 路径字符串硬编码在各处

**建议**：
- [ ] 创建统一的 API 层（如 `api/feedback.ts`、`api/jobs.ts`）
- [ ] 封装请求参数构造逻辑

---

### 6.3 组件粒度

**问题**：
- 部分页面组件过大（如 JobDetailPage 超过 400 行）
- 内部 Helper 组件（如 `Row`、`TestResult`）定义在同一文件

**建议**：
- [ ] 拆分大型页面组件
- [ ] 将通用 Helper 组件移到 `components/` 目录

---

## 七、优先级建议

### P0 - 最高优先级（核心问题，阻碍用户使用）

1. **🔴 重构导航结构**：用户完全无法理解「知识库」「页面」「任务」之间的关系（2.0.1）
2. **🔴 修复任务触发表单**：字段不应全部可选，需显示数据源配置、添加必填校验（2.0.2）
3. **🔴 简化知识库详情页**：Tab 过多、JSON 配置不友好、状态管理混乱（2.0.3）
4. **实现路由守卫逻辑**（4.1）
5. **统一中英文术语**（5.1）

### P1 - 高优先级（影响用户体验）

6. **简化 App KB 绑定机制**：权重/优先级概念不清，需添加说明或简化（2.0.4）
7. **移除重复的时间范围选择器**（3.1A）
8. **修复 Input 筛选无 debounce 问题**（2.5A）
9. **添加面包屑导航**（4.3）
10. **实现统一的加载状态组件**（2.2）
11. **优化观测页面双时间范围**：明确标注或统一（2.0.6）

### P2 - 中优先级（提升体验）

12. **批量操作进度反馈**：添加进度条和取消功能（2.0.5）
13. **提取通用的筛选 Hook**（3.1B）
14. **优化反馈 Triage 流程**：添加对话上下文查看（3.7）
15. **QualityPage 术语优化**：添加通俗解释（3.5）
16. **表格列优化**：可折叠、自定义显示（3.8）

### P3 - 低优先级（技术优化）

17. **整理类型定义**（6.1）
18. **创建统一 API 层**（6.2）
19. **组件拆分重构**（6.3）
20. **响应式表格优化**（2.3）
21. **PageDetailPage 功能扩展**：按需添加编辑功能（3.6）

---

## 八、实施路线图

### 阶段零：核心问题修复（P0）
- **重构导航结构**：添加分组、简化层级、增加说明文案
- **修复任务触发表单**：显示数据源配置、添加必填校验
- **简化知识库详情页**：减少 Tab、结构化配置表单
- 实现路由守卫
- 统一中英文术语

### 阶段一：用户体验修复（P1）
- 简化 App KB 绑定机制
- 移除重复组件
- 添加 Input debounce
- 实现面包屑导航
- 优化观测页面时间范围控件

### 阶段二：体验提升（P2）
- 批量操作进度反馈
- 提取通用 Hook
- 优化反馈 Triage 流程
- 技术术语优化
- 表格列自定义

### 阶段三：架构优化（P3）
- 创建 API 层
- 整理类型定义
- 组件拆分重构
- 响应式改进

---

## 附录：代码位置索引

| 问题 | 文件 | 行号/位置 |
|------|------|-----------|
| **🔴 导航结构定义** | AdminLayout.tsx | 14-25 |
| **🔴 任务触发表单** | JobsPage.tsx | 551-666 |
| **🔴 字段全部可选** | JobsPage.tsx | 605, 610, 615 |
| **🔴 KB详情页复杂** | KbDetailPage.tsx | 全文件(759行) |
| **🔴 KB详情多Tab** | KbDetailPage.tsx | Tabs 组件 |
| **🔴 数据源JSON配置** | KbDetailPage.tsx | newSourceConfigText |
| App KB绑定权重 | AppDetailPage.tsx | binding 表格部分 |
| allocateTopK逻辑 | AppDetailPage.tsx | allocateTopK 调用 |
| 批量recrawl进度 | PagesPage.tsx | runBulkRecrawl 函数 |
| 观测页双时间范围 | ObservabilityPage.tsx | dateRange + metricsRange |
| 重复时间选择器 | FeedbackPage.tsx | 102-111, 148-159 |
| 重复时间选择器 | AuditPage.tsx | 92-101, 110-119 |
| Input 无 debounce | FeedbackPage.tsx | 162-166 |
| 中英文混用表头 | FeedbackPage.tsx | 196-206 |
| 只读配置无入口 | SettingsPage.tsx | 132 |
| 硬编码 7 天统计 | QualityPage.tsx | description |
| 技术术语过多 | QualityPage.tsx | 各 Card 组件 |
| Triage缺上下文 | FeedbackPage.tsx | FeedbackTriage 组件 |
| 页面详情功能少 | PageDetailPage.tsx | 全文件(198行) |
| 表格列过多 | FeedbackPage.tsx | 表头10列 |

---

## 九、问题分类汇总

### 按严重程度

| 级别 | 问题数 | 关键问题 |
|------|--------|----------|
| 🔴 P0 | 5 | 导航混乱、任务表单、KB详情复杂、路由守卫、术语混用 |
| 🟡 P1 | 6 | KB绑定、重复组件、debounce、面包屑、加载状态、双时间范围 |
| 🟢 P2 | 5 | 进度反馈、通用Hook、Triage、术语、表格列 |
| ⚪ P3 | 5 | 类型定义、API层、组件拆分、响应式、页面详情 |

### 按影响范围

| 范围 | 问题 |
|------|------|
| 全局 | 导航结构、术语不统一、路由守卫、加载状态 |
| 多页面 | 重复组件、Input debounce、表格列过多 |
| 单页面 | KB详情、任务表单、App绑定、观测页时间、批量操作 |

### 按修复难度

| 难度 | 问题 |
|------|------|
| 简单 | 移除重复组件、添加debounce、术语修改、tooltip |
| 中等 | 面包屑、路由守卫、表单校验、进度条 |
| 复杂 | 导航重构、KB详情简化、配置表单结构化 |

---

*文档生成时间：2026-01-14*
*审查范围：frontend-admin/src/views/ 下所有页面组件*
*更新版本：v2 - 完整审查所有页面，新增 8 个核心问题*
