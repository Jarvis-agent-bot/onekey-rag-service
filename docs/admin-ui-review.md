# OneKey RAG Admin UI 评审与改进清单（对标 Dify / FastGPT）

> 目标：把“截图评审”沉淀为**可拆票、可验收、可持续维护**的 TODO 列表，并同步标注路由/代码位置/推荐组件/验收标准（DoD）。  
> 范围：Admin UI（`/admin/ui/#/*`）共 9 个页面。  
> 代码位置：`frontend-admin/src/views/*`（React + shadcn/ui + TanStack Query/Table）。

---

## 0. 使用方式（如何拆任务）

建议每条 TODO 拆成一个 Issue/PR，遵循：

1. 以本文 TODO 为准：优先处理 **P0（稳定可用/排障闭环/高频体验）**。
2. 每条 TODO 都必须满足对应 DoD 才能勾选完成（避免“看起来改了，但不可验收”）。
3. 优先做“组件化改造”而不是页面打补丁：减少重复代码，降低维护成本。

---

## 1. 路由与模块速查表

| 页面 | 路由（UI） | 前端模块 |
| --- | --- | --- |
| 总览 | `/admin/ui/#/dashboard` | `frontend-admin/src/views/DashboardPage.tsx` |
| RagApp 列表 | `/admin/ui/#/apps` | `frontend-admin/src/views/AppsPage.tsx` |
| RagApp 详情 | `/admin/ui/#/apps/:appId` | `frontend-admin/src/views/AppDetailPage.tsx` |
| 知识库列表 | `/admin/ui/#/kbs` | `frontend-admin/src/views/KbsPage.tsx` |
| 知识库详情 | `/admin/ui/#/kbs/:kbId` | `frontend-admin/src/views/KbDetailPage.tsx` |
| Pages 列表 | `/admin/ui/#/pages` | `frontend-admin/src/views/PagesPage.tsx` |
| Page 详情 | `/admin/ui/#/pages/:pageId` | `frontend-admin/src/views/PageDetailPage.tsx` |
| 任务中心 | `/admin/ui/#/jobs` | `frontend-admin/src/views/JobsPage.tsx` |
| 任务详情 | `/admin/ui/#/jobs/:jobId` | `frontend-admin/src/views/JobDetailPage.tsx` |
| 反馈 | `/admin/ui/#/feedback` | `frontend-admin/src/views/FeedbackPage.tsx` |
| 质量 | `/admin/ui/#/quality` | `frontend-admin/src/views/QualityPage.tsx` |
| 观测（Retrieval Events） | `/admin/ui/#/observability` | `frontend-admin/src/views/ObservabilityPage.tsx` |
| 观测详情 | `/admin/ui/#/observability/retrieval-events/:eventId` | `frontend-admin/src/views/RetrievalEventDetailPage.tsx` |
| 审计日志 | `/admin/ui/#/audit` | `frontend-admin/src/views/AuditPage.tsx` |
| 设置 | `/admin/ui/#/settings` | `frontend-admin/src/views/SettingsPage.tsx` |

> 说明：本文的“模块”默认指前端文件路径；如涉及后端接口，会额外标注“相关接口（后端）”。

---

## 2. 全局（跨页）问题与 TODO（优先做组件化）

### 2.1 信息架构与术语一致性

- [x] **[P0][信息架构][UI-G-001] 中英文混用与命名不一致（Pages/RagApp/质量/观测）**
  - 路由（UI）：全局（侧边栏/页面标题）
  - 模块（前端）：`frontend-admin/src/views/AdminLayout.tsx` + 各页面标题
  - 推荐组件/方案：统一“术语表 + i18n 策略（先不引入 i18n，也要统一中文/英文）”
  - DoD：
    - 侧边栏与页面标题术语统一（同一概念只出现一种叫法）
    - 对外文档/接口字段命名不强行改（仅 UI 展示层统一）

- [x] **[P0][信息架构][UI-G-002] Workspace 仅展示不支持切换，且缺少租户边界提示**
  - 路由（UI）：全局（Header/Sidebar）
  - 模块（前端）：`frontend-admin/src/views/AdminLayout.tsx`
  - 相关接口（后端）：`GET /admin/api/workspaces`、`GET /admin/api/auth/me`
  - 推荐组件/方案：`WorkspaceSwitcher`（下拉）+ `Breadcrumbs`
  - DoD：
    - 顶部/侧边栏支持切换 workspace（下拉选择）
    - 切换后：页面数据刷新且 URL/Query 状态不乱（至少回到 dashboard）
    - 明确提示“当前 workspace”（减少误操作）

### 2.2 统一状态（Loading/Empty/Error）缺失

- [x] **[P0][交互][UI-G-003] 多页面空列表无 Empty State，用户无法判断“没数据”还是“没加载成功”**
  - 路由（UI）：`/apps`、`/kbs`、`/pages`、`/jobs`、`/feedback`、`/quality`、`/observability` 等
  - 模块（前端）：各列表页（表格渲染处）
  - 推荐组件/方案：`EmptyState`（统一组件，可带 CTA：清空筛选/去创建/查看文档）
  - DoD：
    - 所有列表页在 items=0 时展示 EmptyState（含原因说明与下一步）
    - EmptyState 文案不写死“无数据”，要结合页面语义（如“暂无任务”“暂无反馈”）

- [x] **[P0][交互][UI-G-004] 错误态缺少可复制的排障上下文（request_id/trace_id）**
  - 路由（UI）：全局
  - 模块（前端）：`frontend-admin/src/lib/api.ts` + 各页面 error 展示
  - 推荐组件/方案：统一 `ApiErrorBanner`（展示 message + 可展开详情 + 复制）
  - DoD：
    - 发生接口错误时，用户能一键复制错误详情（至少包含 URL/HTTP 状态码/后端 message）
    - 不泄露敏感信息（token 不可出现在错误文案）

### 2.3 列表/表格范式不足（可维护性差）

- [x] **[P0][交互][UI-G-005] 表格缺少“长文本展示规范”（URL/ID/JSON 字段）**
  - 路由（UI）：`/pages`、`/observability`、`/feedback` 等
  - 模块（前端）：各 table cell
  - 推荐组件/方案：`TruncatedText` / `TruncatedLink`（单行省略 + title/tooltip + 复制按钮）
  - DoD：
    - URL/ID 默认单行展示（不允许竖向断行破坏可读性）
    - Hover 可查看完整值（title 或 tooltip）
    - 提供复制按钮，并有明确反馈（toast）

- [x] **[P1][交互][UI-G-006] 筛选区不统一：缺少“当前筛选条件可视化 + 一键清空”**
  - 路由（UI）：`/pages`、`/jobs`、`/feedback`、`/observability`
  - 模块（前端）：各页面筛选区
  - 推荐组件/方案：`FilterBar`（含 chips）、`useUrlState`（筛选同步到 URL query）
  - DoD：
    - 筛选条件写入 URL query，刷新/返回不丢
    - 支持一键清空（并清空 URL query）
    - 显示当前生效筛选 chips（可逐个移除）

- [x] **[P1][交互][UI-G-007] 缺少批量操作（多选/批量 recrawl/批量删除/批量重索引）**
  - 路由（UI）：优先 `/pages`
  - 模块（前端）：`PagesPage.tsx`
  - 相关接口（后端）：需补充批量 API 或复用单条 API（注意限流/并发）
  - 推荐组件/方案：`DataTable`（TanStack Table row selection）+ `BulkActionsBar`
  - DoD：
    - 支持多选与批量动作（至少批量 recrawl）
    - 批量动作有进度/结果汇总（成功/失败列表）
    - 有并发控制与二次确认（危险操作）

### 2.4 操作安全与审计

- [x] **[P0][安全][UI-G-008] 危险操作缺少统一确认范式与“影响提示”**
  - 路由（UI）：`/pages` 删除、`/kbs` 删除、`/jobs` 重入队/取消等
  - 模块（前端）：各页面 AlertDialog
  - 推荐组件/方案：统一 `ConfirmDangerDialog`（强提示 + 输入确认/二次确认）
  - DoD：
    - 删除类操作必须有明确不可逆提示与对象标识
    - 触发成功必须可追踪（返回 job_id/跳转任务详情）

- [x] **[P1][安全][UI-G-009] 缺少审计日志入口与基础留痕（谁在什么时候做了什么）**
  - 路由（UI）：新增 `/admin/ui/#/audit`（P1）
  - 模块（前端）：新增页面
  - 相关接口（后端）：新增 `GET /admin/api/workspaces/{workspace_id}/audit-logs`
  - 推荐组件/方案：`AuditLogTable` + 关键操作打点
  - DoD：
    - 删除/触发任务/修改配置等操作有审计记录
    - 审计可按时间/操作者/对象过滤

### 2.5 观测链路未闭环（从问题到修复的跳转）

- [x] **[P0][排障][UI-G-010] 缺少“联查跳转协议”：request_id / message_id / job_id 无处统一跳转**
  - 路由（UI）：`/feedback`、`/quality`、`/observability`、`/jobs`
  - 模块（前端）：各列表页行操作
  - 推荐组件/方案：统一 `TraceLink`（复制 + 跳转到观测/任务/页面详情）
  - DoD：
    - 任意出现 request_id/message_id 的地方：可复制 + 一键跳到观测页（带 query）
    - Jobs/Pages 之间可互跳（page → job、job → pages/filter）

---

## 3. 分页面评审与 TODO

> 规则：每页按 **功能 / 样式 / 布局 / 交互** 分组；每条都带路由/模块/推荐组件/DoD。

### 3.1 总览（Dashboard）

#### 功能

- [x] **[P0][功能][UI-DASH-001] 关键指标缺少口径/单位/时间窗说明（p95/命中率/错误率/覆盖率）**
  - 路由（UI）：`/admin/ui/#/dashboard`
  - 模块（前端）：`frontend-admin/src/views/DashboardPage.tsx`
  - 相关接口（后端）：`GET /admin/api/workspaces/{workspace_id}/summary`、`/health`、`/system`
  - 推荐组件/方案：`MetricCard`（统一：label/value/unit/help/empty）
  - DoD：
    - 每个指标有 tooltip/帮助文案（口径、时间窗、单位）
    - 空值展示一致（0、-、null 的规则明确）

- [x] **[P1][功能][UI-DASH-002] 缺少趋势与下钻（点击卡片无法跳到对应列表/详情）**
  - 路由（UI）：`/admin/ui/#/dashboard`
  - 模块（前端）：`DashboardPage.tsx`
  - 推荐组件/方案：指标卡可点击 + 跳转携带筛选（如 `/pages?changed=true`）
  - DoD：
    - 至少支持 3 个下钻：Pages、Jobs failed、Errors top
    - 跳转后自动带上筛选条件且可回退

#### 样式

- [x] **[P1][样式][UI-DASH-003] 告警/异常与普通信息权重一致，无法一眼识别“今日优先处理项”**
  - 路由（UI）：`/admin/ui/#/dashboard`
  - 模块（前端）：`DashboardPage.tsx`
  - 推荐组件/方案：`AlertBanner`（Top 区域固定）
  - DoD：
    - 异常存在时，在首屏顶部集中展示（红/黄语义色）
    - 提供“去处理”跳转（到 jobs/quality/observability）

#### 布局

- [x] **[P1][布局][UI-DASH-004] 信息组织不按排障路径排列（健康→规模→任务→成本）**
  - 路由（UI）：`/admin/ui/#/dashboard`
  - 模块（前端）：`DashboardPage.tsx`
  - 推荐组件/方案：按模块分区 + 可折叠
  - DoD：
    - 分区标题清晰，顺序按“健康/任务/规模/成本/模型”组织
    - 首屏能看到“是否健康 + 是否有失败任务 + 近24h请求/错误”

#### 交互

- [x] **[P0][交互][UI-DASH-005] 刷新缺少反馈（加载中/最后更新时间/失败提示）**
  - 路由（UI）：`/admin/ui/#/dashboard`
  - 模块（前端）：`DashboardPage.tsx`
  - 推荐组件/方案：`RefreshButton`（loading + lastUpdated）
  - DoD：
    - 点击刷新后按钮进入 loading
    - 成功后显示“最后更新：xx:xx:xx”

- [x] **[P1][交互][UI-DASH-006] 模型列表仅展示 model_id，缺少复制与“对应 RagApp”的映射说明**
  - 路由（UI）：`/admin/ui/#/dashboard`
  - 模块（前端）：`frontend-admin/src/views/DashboardPage.tsx`
  - 相关接口（后端）：`GET /v1/models`、`GET /admin/api/workspaces/{workspace_id}/apps`
  - 推荐组件/方案：`TruncatedText + CopyButton`、`ModelIdMappingHint`
  - DoD：
    - model_id 可复制
    - 至少能说明“该 model_id 来自哪个 RagApp/public_model_id”（无映射时提示如何配置）

### 3.2 RagApp 列表（Apps）

#### 功能

- [x] **[P0][功能][UI-APPS-001] 列表信息不足：缺少 KB 绑定数/请求量/最近错误等运营字段**
  - 路由（UI）：`/admin/ui/#/apps`
  - 模块（前端）：`frontend-admin/src/views/AppsPage.tsx`
  - 相关接口（后端）：`GET /admin/api/workspaces/{workspace_id}/apps`
  - 推荐组件/方案：`DataTable` 列扩展 + `AppStatusBadge`
  - DoD：
    - 表格至少包含：name、public_model_id、绑定 KB 数、status、updated_at
    - 后续字段（req/err/hit/p95）可按 P1 增量加入，不破坏现有列结构

- [x] **[P1][功能][UI-APPS-002] 缺少“创建向导/成功下一步”引导（对标 Dify/FastGPT）**
  - 路由（UI）：`/admin/ui/#/apps`
  - 模块（前端）：`AppsPage.tsx`
  - 推荐组件/方案：`EmptyState + CTA` / 创建向导（Step）
  - DoD：
    - 空列表时展示“创建 App → 绑定 KB → 调试 → 发布”的引导

- [x] **[P0][功能][UI-APPS-004] 列表缺少搜索/排序/分页（数据量增大后不可用）**
  - 路由（UI）：`/admin/ui/#/apps`
  - 模块（前端）：`frontend-admin/src/views/AppsPage.tsx`
  - 推荐组件/方案：`DataTable` + 基础 filter（name/model_id）+ pagination
  - DoD：
    - 支持按 name/public_model_id 搜索
    - 支持按 updated_at 排序（至少前端排序或后端分页排序二选一）

#### 样式

- [x] **[P1][样式][UI-APPS-005] “操作”列按钮占位大、信息密度偏低（首屏有效信息不足）**
  - 路由（UI）：`/admin/ui/#/apps`
  - 模块（前端）：`AppsPage.tsx`
  - 推荐组件/方案：`RowActionsDropdown`（图标按钮 + 下拉）
  - DoD：
    - 行操作收敛到右侧图标按钮（或更紧凑的 outline sm）
    - 首屏能看到更多业务字段（KB 数/状态/更新时间）

#### 交互

- [x] **[P0][交互][UI-APPS-006] Apps 列表空态缺少“下一步操作”指引（创建后该做什么）**
  - 路由（UI）：`/admin/ui/#/apps`
  - 模块（前端）：`AppsPage.tsx`、`frontend-admin/src/components/DataTable.tsx`
  - 推荐组件/方案：`EmptyState`（支持传入标题/描述/CTA）
  - DoD：
    - items=0 时展示 EmptyState，并提供“新建 App” CTA
    - DataTable 支持统一 empty 渲染（避免每页重复写）

#### 交互

- [x] **[P1][交互][UI-APPS-003] 行操作语义不清（操作按钮集合不统一）**
  - 路由（UI）：`/admin/ui/#/apps`
  - 模块（前端）：`AppsPage.tsx`
  - 推荐组件/方案：`RowActionsDropdown`（编辑/复制/禁用/删除）
  - DoD：
    - 主要操作仅保留 1 个（如“编辑”），其余进更多菜单
    - 危险操作统一二次确认

### 3.3 知识库列表（KBs）

#### 功能

- [x] **[P0][功能][UI-KBS-001] 列表缺少规模/质量/索引时间等关键字段（无法运维）**
  - 路由（UI）：`/admin/ui/#/kbs`
  - 模块（前端）：`frontend-admin/src/views/KbsPage.tsx`
  - 相关接口（后端）：`GET /admin/api/workspaces/{workspace_id}/kbs`（必要时扩展返回 stats 摘要）
  - 推荐组件/方案：`KbStatsSummary`（chunk/page/coverage/last_indexed）
  - DoD：
    - KB 列表首屏可见：pages/chunks/embedding_coverage/last_crawled/last_indexed（至少 2-3 项）
    - 无 stats 时显示明确提示（未索引/未采集）

- [x] **[P0][交互][UI-KBS-003] KB 列表空态缺少引导（创建 KB → 配数据源 → 抓取 → 索引）**
  - 路由（UI）：`/admin/ui/#/kbs`
  - 模块（前端）：`frontend-admin/src/views/KbsPage.tsx`
  - 推荐组件/方案：`EmptyState + CTA`
  - DoD：
    - items=0 时展示 EmptyState（含“新建知识库”按钮）
    - 文案明确下一步：去 KB 详情添加数据源并触发任务

#### 交互/安全

- [x] **[P0][安全][UI-KBS-002] 删除 KB 缺少影响评估（影响哪些 App）与更强确认**
  - 路由（UI）：`/admin/ui/#/kbs`
  - 模块（前端）：`KbsPage.tsx`
  - 相关接口（后端）：建议新增 `GET /kbs/{kb_id}/referenced-by` 或在删除前提示
  - 推荐组件/方案：`ConfirmDangerDialog`（展示影响列表）
  - DoD：
    - 删除前展示：被哪些 app_id/public_model_id 引用
    - 支持“软删除/回收站”（P1）或至少二次确认（输入 KB 名称）

### 3.4 Pages 列表（Pages）

#### 功能

- [x] **[P0][功能][UI-PAGES-001] 筛选能力不足：缺少时间范围/错误原因/域名等高频运维维度**
  - 路由（UI）：`/admin/ui/#/pages`
  - 模块（前端）：`frontend-admin/src/views/PagesPage.tsx`
  - 相关接口（后端）：`GET /admin/api/workspaces/{workspace_id}/pages`（扩展参数）
  - 推荐组件/方案：`FilterBar`（timeRange/domain/httpStatus 多选）
  - DoD：
    - 至少新增：时间范围（24h/7d/30d）、http_status 多值过滤
    - 筛选写入 URL query（可分享/回退不丢）

- [x] **[P1][功能][UI-PAGES-002] 缺少批量 recrawl/删除/重索引（高频运维操作）**
  - 路由（UI）：`/admin/ui/#/pages`
  - 模块（前端）：`PagesPage.tsx`
  - 推荐组件/方案：TanStack Table selection + `BulkActionsBar`
  - DoD：
    - 支持多选与批量 recrawl（P0 先做）
    - 批量删除/重索引作为 P1 增量

#### 样式

- [x] **[P0][样式][UI-PAGES-003] URL 列使用 break-all 导致竖向断行，表格可读性严重下降**
  - 路由（UI）：`/admin/ui/#/pages`
  - 模块（前端）：`frontend-admin/src/views/PagesPage.tsx`
  - 推荐组件/方案：`TruncatedLink`（单行省略 + title + 复制）
  - DoD：
    - URL 单行展示，不竖向断行
    - 支持复制 URL（toast 提示）

#### 交互/安全

- [x] **[P0][交互][UI-PAGES-004] 空列表缺少 EmptyState（当前筛选可能过严/数据未采集）**
  - 路由（UI）：`/admin/ui/#/pages`
  - 模块（前端）：`PagesPage.tsx`
  - 推荐组件/方案：`EmptyState`
  - DoD：
    - items=0 时展示 EmptyState（含“清空筛选/去任务中心抓取”入口）

- [x] **[P1][布局][UI-PAGES-005] 筛选区不粘性（长列表滚动时无法快速调整筛选）**
  - 路由（UI）：`/admin/ui/#/pages`
  - 模块（前端）：`PagesPage.tsx`
  - 推荐组件/方案：筛选卡片 sticky + 表格区域独立滚动（或回到顶部按钮）
  - DoD：
    - 当列表滚动超过首屏时，仍可快速调整筛选（sticky 或快捷回到筛选区）

- [x] **[P1][交互][UI-PAGES-006] 单页 recrawl/删除缺少“动作结果回执”（进入任务/失败原因）**
  - 路由（UI）：`/admin/ui/#/pages`
  - 模块（前端）：`PagesPage.tsx`
  - 相关接口（后端）：`POST /pages/{page_id}/recrawl`、`DELETE /pages/{page_id}`
  - 推荐组件/方案：统一 toast 文案 + 可点击跳转 job_id
  - DoD：
    - recrawl 成功 toast 包含 job_id，并可点击跳转任务详情
    - 删除失败/recrawl 失败必须展示后端错误信息（可复制）

### 3.5 Page 详情（Page Detail）

#### 样式/交互

- [x] **[P0][样式][UI-PAGE-DETAIL-001] URL 使用 break-all，影响阅读与复制**
  - 路由（UI）：`/admin/ui/#/pages/:pageId`
  - 模块（前端）：`frontend-admin/src/views/PageDetailPage.tsx`
  - 推荐组件/方案：`TruncatedLink + CopyButton`
  - DoD：
    - URL 单行展示 + 可复制
    - 保留“在新标签打开”能力

- [x] **[P1][功能][UI-PAGE-DETAIL-002] 缺少与 Jobs/Source 的联动入口（排障链路断裂）**
  - 路由（UI）：`/admin/ui/#/pages/:pageId`
  - 模块（前端）：`frontend-admin/src/views/PageDetailPage.tsx`
  - 推荐组件/方案：增加快捷跳转按钮（去任务中心按 kb_id/source_id 过滤）
  - DoD：
    - 一键跳转到 Jobs 列表，并自动带上 `kb_id/source_id` 筛选
    - 详情页展示“最近一次相关 crawl/index job（若可取）”（P1）

### 3.6 任务中心（Jobs）

#### 功能

- [x] **[P0][功能][UI-JOBS-001] 触发 crawl/index 为高危操作，但缺少范围预估与执行提示（成本/耗时/影响）**
  - 路由（UI）：`/admin/ui/#/jobs`
  - 模块（前端）：`frontend-admin/src/views/JobsPage.tsx`
  - 相关接口（后端）：`POST /admin/api/workspaces/{workspace_id}/jobs/crawl`、`/jobs/index`
  - 推荐组件/方案：表单分组 + 高级选项折叠 + 提交前确认
  - DoD：
    - full crawl 触发前必须二次确认（提示可能抓取大量页面）
    - 提交后明确返回 job_id，并自动跳转任务详情

#### 交互

- [x] **[P1][交互][UI-JOBS-002] 表单缺少字段级校验与错误提示（URL/正则/max_pages）**
  - 路由（UI）：`/admin/ui/#/jobs`
  - 模块（前端）：`JobsPage.tsx`
  - 推荐组件/方案：`zod + react-hook-form`（或最小校验函数）
  - DoD：
    - 提交前校验（必填/格式/范围）
    - 校验失败明确提示到字段级

- [x] **[P0][交互][UI-JOBS-003] 任务列表空态缺少引导（没有任务/筛选过严）**
  - 路由（UI）：`/admin/ui/#/jobs`
  - 模块（前端）：`frontend-admin/src/views/JobsPage.tsx`
  - 推荐组件/方案：`EmptyState`（提供清空筛选/去触发任务）
  - DoD：
    - items=0 时展示 EmptyState（包含“清空筛选”与“触发抓取/索引”指引）

- [x] **[P1][样式][UI-JOBS-004] 进度字段可读性弱（字符串拼接不直观，缺少百分比/阶段）**
  - 路由（UI）：`/admin/ui/#/jobs`
  - 模块（前端）：`JobsPage.tsx`（`formatProgress`）
  - 推荐组件/方案：`ProgressPill`（阶段化、可 tooltip 展开原始 progress JSON）
  - DoD：
    - crawl/index 进度至少展示“已处理/总量/失败数”（如可得）
    - 提供展开查看原始 progress（JSON）

### 3.7 反馈（Feedback）

#### 功能

- [x] **[P1][功能][UI-FEEDBACK-001] 仅列表缺少处理闭环：状态/归因/标签/评测集沉淀**
  - 路由（UI）：`/admin/ui/#/feedback`
  - 模块（前端）：`frontend-admin/src/views/FeedbackPage.tsx`
  - 相关接口（后端）：需扩展 `PATCH /feedback/{id}`（status/tags/attribution）
  - 推荐组件/方案：`FeedbackTriage`（状态、归因下拉、标签）
  - DoD：
    - 支持至少 3 态：未处理/已确认/已修复
    - 支持归因字段（retrieval/rerank/model/content/other）

#### 交互

- [x] **[P0][交互][UI-FEEDBACK-002] 空列表缺少 EmptyState，且缺少“如何产生反馈/如何联查”引导**
  - 路由（UI）：`/admin/ui/#/feedback`
  - 模块（前端）：`FeedbackPage.tsx`
  - 推荐组件/方案：`EmptyState + DocsLink`
  - DoD：
    - items=0 时展示 EmptyState（说明如何接入反馈）
    - 提供“去观测页联查”入口（带 query）

- [x] **[P1][交互][UI-FEEDBACK-003] conversation_id/message_id 缺少复制按钮，联查成本高**
  - 路由（UI）：`/admin/ui/#/feedback`
  - 模块（前端）：`frontend-admin/src/views/FeedbackPage.tsx`
  - 推荐组件/方案：`TruncatedText + CopyButton`
  - DoD：
    - conversation_id/message_id 可复制（toast 提示）
    - 复制按钮不破坏表格对齐与信息密度

### 3.8 质量（Quality）

#### 功能

- [x] **[P0][功能][UI-QUALITY-001] 多数指标为 null/- 时缺少解释（无数据/未开启/时间窗太小）**
  - 路由（UI）：`/admin/ui/#/quality`
  - 模块（前端）：`frontend-admin/src/views/QualityPage.tsx`
  - 相关接口（后端）：`GET /admin/api/workspaces/{workspace_id}/observability/summary`
  - 推荐组件/方案：`MetricEmptyHint`（无数据原因）
  - DoD：
    - null/- 必须带“原因提示”（例如：无请求/未配置 pricing）
    - 提供“如何开启/如何配置”的跳转或文档链接

- [x] **[P1][功能][UI-QUALITY-002] 缺少趋势与下钻（从错误 Top 到具体请求/事件）**
  - 路由（UI）：`/admin/ui/#/quality`
  - 模块（前端）：`QualityPage.tsx`
  - 推荐组件/方案：Top 列表可点击跳转 `/observability?has_error=true`
  - DoD：
    - 错误 Top 每行可跳转到观测列表（带 error_code/request_id 等筛选）

#### 样式/布局

- [x] **[P0][布局][UI-QUALITY-003] 表格在无数据时“空白”且没有解释（易误判为加载失败）**
  - 路由（UI）：`/admin/ui/#/quality`
  - 模块（前端）：`frontend-admin/src/views/QualityPage.tsx`
  - 推荐组件/方案：`EmptyState` / 表格空行占位
  - DoD：
    - 各表格在数组为空时显示“暂无数据 + 原因提示”（如：时间窗内无请求）

- [x] **[P1][功能][UI-QUALITY-004] Token/成本提示不够可行动：缺少配置入口与示例**
  - 路由（UI）：`/admin/ui/#/quality`
  - 模块（前端）：`QualityPage.tsx`
  - 相关接口（后端）：依赖 `MODEL_PRICING_JSON` 或配置项（见后端实现）
  - 推荐组件/方案：当 pricing 未配置时，展示“去设置页/文档”入口
  - DoD：
    - pricing 未配置时，明确提示“成本仅展示 tokens”并提供“如何配置”的链接
    - 配置完成后可看到 cost_usd_estimate 非空（若后端支持）

### 3.9 观测（Observability）

#### 交互

- [x] **[P0][交互][UI-OBS-001] 列表空态缺失，无法判断是“无数据”还是“筛选过严”**
  - 路由（UI）：`/admin/ui/#/observability`
  - 模块（前端）：`frontend-admin/src/views/ObservabilityPage.tsx`
  - 推荐组件/方案：`EmptyState`
  - DoD：
    - items=0 时展示 EmptyState（提供清空筛选按钮）

- [x] **[P1][交互][UI-OBS-002] request_id/message_id 缺少复制与联查快捷入口**
  - 路由（UI）：`/admin/ui/#/observability`
  - 模块（前端）：`ObservabilityPage.tsx`
  - 推荐组件/方案：`TraceLink`（复制 + 深链）
  - DoD：
    - request_id 一键复制
    - 一键跳转到“事件详情”或过滤列表

- [x] **[P1][交互][UI-OBS-003] 列表筛选与 URL query 的同步不完整（部分条件不持久化）**
  - 路由（UI）：`/admin/ui/#/observability`
  - 模块（前端）：`frontend-admin/src/views/ObservabilityPage.tsx`
  - 推荐组件/方案：`useUrlState`（把 app_id/kb_id/has_error/date_range 同步到 URL）
  - DoD：
    - 刷新/回退后筛选条件不丢（包含 date_range/has_error）
    - “清空”会清空 URL query

### 3.10 观测详情（Retrieval Event Detail）（补充）

#### 交互

- [x] **[P1][交互][UI-OBS-DETAIL-001] request_id/conversation_id/message_id 仅展示不可复制，排障效率低**
  - 路由（UI）：`/admin/ui/#/observability/retrieval-events/:eventId`
  - 模块（前端）：`frontend-admin/src/views/RetrievalEventDetailPage.tsx`
  - 推荐组件/方案：`TruncatedText + CopyButton`、联查按钮（回到列表并带 query）
  - DoD：
    - request_id/conversation_id/message_id 可复制
    - 一键返回列表并自动带上 request_id 筛选（减少手动复制粘贴）

### 3.11 设置（Settings）

#### 功能/交互

- [x] **[P1][功能][UI-SETTINGS-001] 模型配置仅可读，缺少“连接测试/错误提示/可用性探测”**
  - 路由（UI）：`/admin/ui/#/settings`
  - 模块（前端）：`frontend-admin/src/views/SettingsPage.tsx`
  - 相关接口（后端）：建议新增 `POST /admin/api/workspaces/{workspace_id}/settings/test-llm`
  - 推荐组件/方案：`TestConnectionPanel`
  - DoD：
    - 支持测试 Chat/Embeddings/Rerank（至少 1 个）
    - 失败时给出可行动建议（超时/鉴权/模型名错误）

- [x] **[P0][交互][UI-SETTINGS-002] 关键字段缺少复制（base_url/model_id/provider），不利于排障与支持**
  - 路由（UI）：`/admin/ui/#/settings`
  - 模块（前端）：`frontend-admin/src/views/SettingsPage.tsx`
  - 推荐组件/方案：`TruncatedText + CopyButton`
  - DoD：
    - base_url/model/provider 可复制（toast 提示）
    - 不引入过多按钮噪声（仅对关键字段提供复制）

---

## 4. 里程碑建议（按维护收益排序）

### P0（1～3 天：立刻降低维护成本）

1. 统一 EmptyState + 长文本规范（URL/ID 省略 + 复制）
2. 危险操作统一确认范式（删除/触发任务）
3. Dashboard 指标口径提示 + 下钻跳转（最少 2-3 条链路）

### P1（1～2 周：形成排障与运营闭环）

1. Workspace 切换器 + 面包屑
2. FilterBar（URL query 持久化 + chips）
3. Feedback 处理闭环（状态/归因/标签）
4. Quality/Observability 下钻联动

---

## 5. 对标参考（落地时可直接对齐）

- Dify：App 创建向导、数据集管理、运行日志/事件下钻、可操作的 Empty State。
- FastGPT：应用-知识库绑定直观、列表筛选与批量操作成熟、运维入口清晰。
