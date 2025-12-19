import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Activity, Cpu, Database, Info, ListChecks, MessageSquareText, ShieldAlert, Timer } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Card } from "../components/Card";
import { ApiErrorBanner } from "../components/ApiErrorBanner";
import { CopyableText } from "../components/CopyableText";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card as UiCard, CardContent, CardHeader } from "../components/ui/card";
import { apiFetch } from "../lib/api";
import { useWorkspace } from "../lib/workspace";

type SummaryResp = {
  pages: { total: number; failed: number; last_24h: number; last_crawled_at: string | null };
  chunks: { total: number; with_embedding: number; embedding_coverage: number; embedding_models: Record<string, number> };
  jobs: { by_type: Record<string, Record<string, number>> };
  feedback: { total: number; up: number; down: number; up_ratio: number };
  indexes: { pgvector_hnsw: boolean; pgvector_ivfflat: boolean; fts: boolean };
};
type AlertsResp = { from: string; to: string; items: Array<{ severity: string; code: string; title: string; detail: string; value: unknown }> };
type ObsSummaryResp = {
  from: string;
  to: string;
  pricing_configured: boolean;
  overall: {
    requests: number;
    errors: number;
    hits: number;
    error_ratio: number;
    hit_ratio: number;
    p95_prepare_ms: number | null;
    avg_total_ms: number | null;
    total_tokens: number;
  };
};
type SystemResp = {
  now: string;
  process: { pid: number; uptime_s: number; rss_bytes: number | null; cpu_cores_used?: number; cpu_percent_of_total?: number; open_fds?: number | null };
  system: {
    cpu_count: number | null;
    cpu_percent?: number;
    loadavg?: { "1m": number | null; "5m": number | null; "15m": number | null };
    uptime_s?: number | null;
    memory?: { total_bytes: number | null; available_bytes: number | null; used_bytes: number | null; used_percent: number | null };
    disk_root?: { total_bytes: number; used_bytes: number; free_bytes: number } | null;
  };
  cgroup?: Record<string, unknown>;
  runtime?: Record<string, unknown>;
};
type StorageResp = {
  now: string;
  postgres?: {
    db_bytes?: number;
    tables?: Array<{ name: string; total_bytes: number; table_bytes: number; index_bytes: number }>;
  };
};
type AppsResp = { items: Array<{ id: string; name: string; public_model_id: string }> };

export function DashboardPage() {
  const { workspaceId } = useWorkspace();
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  useEffect(() => {
    if (lastUpdated) return;
    setLastUpdated(new Date().toLocaleString("zh-CN"));
  }, [lastUpdated]);

  const summary = useQuery({
    queryKey: ["summary", workspaceId],
    queryFn: () => apiFetch<SummaryResp>(`/admin/api/workspaces/${workspaceId}/summary`),
    enabled: !!workspaceId,
  });

  const health = useQuery({
    queryKey: ["health", workspaceId],
    queryFn: () => apiFetch<{ status: string; dependencies: Record<string, unknown> }>(`/admin/api/workspaces/${workspaceId}/health`),
    enabled: !!workspaceId,
  });

  const settings = useQuery({
    queryKey: ["settings", workspaceId],
    queryFn: () => apiFetch<Record<string, unknown>>(`/admin/api/workspaces/${workspaceId}/settings`),
    enabled: !!workspaceId,
  });

  const alerts = useQuery({
    queryKey: ["alerts", workspaceId],
    queryFn: () => apiFetch<AlertsResp>(`/admin/api/workspaces/${workspaceId}/alerts?date_range=24h`),
    enabled: !!workspaceId,
  });

  const obs24h = useQuery({
    queryKey: ["obs-summary", workspaceId, "24h"],
    queryFn: () => apiFetch<ObsSummaryResp>(`/admin/api/workspaces/${workspaceId}/observability/summary?date_range=24h`),
    enabled: !!workspaceId,
  });

  const system = useQuery({
    queryKey: ["system", workspaceId],
    queryFn: () => apiFetch<SystemResp>(`/admin/api/workspaces/${workspaceId}/system`),
    enabled: !!workspaceId,
    refetchInterval: 5000,
  });

  const storage = useQuery({
    queryKey: ["storage", workspaceId],
    queryFn: () => apiFetch<StorageResp>(`/admin/api/workspaces/${workspaceId}/storage`),
    enabled: !!workspaceId,
    refetchInterval: 30000,
  });

  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => apiFetch<{ data: Array<{ id: string }> }>("/v1/models"),
  });

  const apps = useQuery({
    queryKey: ["apps", workspaceId],
    queryFn: () => apiFetch<AppsResp>(`/admin/api/workspaces/${workspaceId}/apps`),
    enabled: !!workspaceId,
  });

  if (summary.isLoading) return <div className="text-sm text-muted-foreground">加载中...</div>;
  if (summary.error) return <ApiErrorBanner error={summary.error} />;
  const data = summary.data!;
  const overall = obs24h.data?.overall;
  const topAlerts = (alerts.data?.items || []).slice(0, 3);
  const jobsFailed = sumJobStatus(data.jobs.by_type || {}, "failed");
  const jobsQueued = sumJobStatus(data.jobs.by_type || {}, "queued");
  const jobsRunning = sumJobStatus(data.jobs.by_type || {}, "running");
  const jobsSucceeded = sumJobStatus(data.jobs.by_type || {}, "succeeded");
  const healthStatus = health.data?.status;
  const appByPublicModelId = new Map((apps.data?.items || []).map((a) => [a.public_model_id, a]));

  async function refreshAll() {
    if (refreshing) return;
    setRefreshing(true);
    const results = await Promise.allSettled([
      summary.refetch(),
      obs24h.refetch(),
      alerts.refetch(),
      system.refetch(),
      storage.refetch(),
      health.refetch(),
      settings.refetch(),
      models.refetch(),
    ]);
    setLastUpdated(new Date().toLocaleString("zh-CN"));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed) toast.error(`刷新失败：${failed} 项`);
    setRefreshing(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">总览</div>
          <div className="mt-1 text-sm text-muted-foreground">
            workspace <span className="font-mono">{workspaceId}</span>
            <span className="mx-2">·</span>
            最近抓取 <span className="font-mono">{data.pages.last_crawled_at || "-"}</span>
            <span className="mx-2">·</span>
            最后更新 <span className="font-mono">{lastUpdated || "-"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => void refreshAll()}
          >
            {refreshing ? "刷新中..." : "刷新"}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/quality">查看质量</Link>
          </Button>
        </div>
      </div>

      {healthStatus && healthStatus !== "ok" ? (
        <UiCard className="border-red-200 bg-red-50 text-red-950">
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              <div className="text-sm font-medium">健康状态异常</div>
            </div>
            <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-red-950/80 hover:bg-red-100">
              <Link to="/settings">去处理</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="text-xs text-red-950/70">
              status=<span className="font-mono">{healthStatus}</span>（建议优先检查数据库/索引/配置）
            </div>
          </CardContent>
        </UiCard>
      ) : null}

      {jobsFailed > 0 ? (
        <UiCard className="border-amber-200 bg-amber-50 text-amber-950">
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              <div className="text-sm font-medium">存在失败任务</div>
            </div>
            <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-amber-950/80 hover:bg-amber-100">
              <Link to="/jobs?status=failed">去处理</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="text-xs text-amber-950/70">
              failed=<span className="font-mono">{formatInt(jobsFailed)}</span>（点击跳转到任务列表查看详情）
            </div>
          </CardContent>
        </UiCard>
      ) : null}

      {alerts.isLoading ? null : topAlerts.length ? (
        <UiCard className="border-amber-200 bg-amber-50 text-amber-950">
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              <div className="text-sm font-medium">告警（最近 24h）</div>
            </div>
            <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-amber-950/80 hover:bg-amber-100">
              <Link to="/quality">去处理</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {topAlerts.map((a) => (
              <div key={a.code} className="rounded-md border border-amber-200 bg-white/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{a.title}</div>
                  <span className="font-mono text-xs text-amber-950/70">{a.severity}</span>
                </div>
                <div className="mt-1 text-xs text-amber-950/70">{a.detail}</div>
              </div>
            ))}
          </CardContent>
        </UiCard>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          icon={<Activity className="h-4 w-4" />}
          title="24h 请求"
          value={overall ? formatInt(overall.requests) : "-"}
          sub={overall ? `命中率 ${pct(overall.hit_ratio)} · 错误率 ${pct(overall.error_ratio)}` : "来自质量聚合"}
          help="口径：过去 24h 的 RAG 请求数（来自观测聚合）。命中率=hits/requests；错误率=errors/requests。"
        />
        <MetricCard
          icon={<Timer className="h-4 w-4" />}
          title="p95 准备延迟"
          value={overall?.p95_prepare_ms != null ? `${Math.round(overall.p95_prepare_ms)}ms` : "-"}
          sub="prepare_rag（包含 embedding/检索/重排等）"
          help="口径：prepare_rag 阶段 p95 耗时，包含 embedding/检索/重排等。单位 ms，过去 24h。"
        />
        <MetricCard
          icon={<MessageSquareText className="h-4 w-4" />}
          title="24h Token"
          value={overall ? formatInt(overall.total_tokens) : "-"}
          sub={obs24h.data?.pricing_configured ? "已配置成本估算" : "未配置成本估算"}
          help="口径：过去 24h 的 tokens 用量（来自上游模型）。成本估算依赖 pricing 配置。"
        />
        <MetricCard
          icon={<Database className="h-4 w-4" />}
          title="Embedding 覆盖率"
          value={`${Math.round((data.chunks.embedding_coverage || 0) * 100)}%`}
          sub={`${formatInt(data.chunks.with_embedding)}/${formatInt(data.chunks.total)} chunks`}
          help="口径：chunks 中 embedding 非空的比例。覆盖率=with_embedding/total（按 workspace）。"
        />
        <MetricCard
          icon={<ListChecks className="h-4 w-4" />}
          title="失败任务"
          value={formatInt(jobsFailed)}
          sub="点击查看 failed 任务"
          help="口径：jobs 表中 status=failed 的任务数量（全类型）。"
          to="/jobs?status=failed"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="索引与健康" description="索引结构自检 + 依赖检查">
          {health.isLoading ? <div className="text-sm text-muted-foreground">加载中...</div> : null}
          {health.error ? <ApiErrorBanner error={health.error} /> : null}
          {health.data ? (
            <div className="space-y-2 text-sm">
              <Row
                k="status"
                v={
                  <Badge variant={health.data.status === "ok" ? "default" : "secondary"}>
                    {health.data.status}
                  </Badge>
                }
              />
              <Row k="postgres" v={String(health.data.dependencies?.postgres || "-")} />
              <Row k="pgvector" v={String(health.data.dependencies?.pgvector || "-")} />
              <div className="pt-2 text-xs text-muted-foreground">indexes</div>
              <Row k="HNSW" v={data.indexes.pgvector_hnsw ? "✅" : "❌"} />
              <Row k="IVFFLAT" v={data.indexes.pgvector_ivfflat ? "✅" : "❌"} />
              <Row k="FTS" v={data.indexes.fts ? "✅" : "❌"} />
            </div>
          ) : null}
        </Card>

        <Card title="任务概览" description="按 type/status 聚合（点击下钻）">
          <div className="space-y-2 text-sm">
            <Row
              k="queued"
              v={
                <Link className="underline underline-offset-2" to="/jobs?status=queued">
                  {formatInt(jobsQueued)}
                </Link>
              }
            />
            <Row
              k="running"
              v={
                <Link className="underline underline-offset-2" to="/jobs?status=running">
                  {formatInt(jobsRunning)}
                </Link>
              }
            />
            <Row
              k="failed"
              v={
                <Link className="underline underline-offset-2" to="/jobs?status=failed">
                  {formatInt(jobsFailed)}
                </Link>
              }
            />
            <Row
              k="succeeded"
              v={
                <Link className="underline underline-offset-2" to="/jobs?status=succeeded">
                  {formatInt(jobsSucceeded)}
                </Link>
              }
            />
          </div>
          <div className="pt-2 text-xs text-muted-foreground">提示：触发 crawl/index 可在“任务中心”操作。</div>
        </Card>

        <Card title="内容规模" description="抓取/索引规模（按 workspace）">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Link to="/pages?changed=true" className="block rounded-md border bg-muted/30 p-3 transition-colors hover:bg-muted/40">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">页面</span>
                </div>
                <span className="font-mono text-sm">{formatInt(data.pages.total)}</span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                近 24h 抓取 <span className="font-mono">{formatInt(data.pages.last_24h)}</span> · 失败{" "}
                <span className="font-mono">{formatInt(data.pages.failed)}</span>
              </div>
            </Link>

            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <MessageSquareText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Feedback</span>
                </div>
                <span className="font-mono text-sm">{formatInt(data.feedback.total)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  👍 <span className="font-mono">{formatInt(data.feedback.up)}</span> · 👎{" "}
                  <span className="font-mono">{formatInt(data.feedback.down)}</span>
                </span>
                <span className="font-mono">{pct(data.feedback.up_ratio)}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="系统资源" description="容器视角的 CPU/内存/磁盘（每 5s 刷新）">
          {system.isLoading ? <div className="text-sm text-muted-foreground">加载中...</div> : null}
          {system.error ? <ApiErrorBanner error={system.error} /> : null}
          {storage.error ? <ApiErrorBanner error={storage.error} /> : null}
          {system.data ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Cpu className="h-4 w-4" />
                    CPU（容器/VM）
                  </div>
                  <div className="font-mono text-sm">
                    {pickNumber((system.data.cgroup as any)?.cpu, "usage_percent_of_limit") != null
                      ? `${pickNumber((system.data.cgroup as any)?.cpu, "usage_percent_of_limit")}%`
                      : system.data.system.cpu_percent == null
                        ? "-"
                        : `${system.data.system.cpu_percent}%`}
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  本服务：≈ {system.data.process.cpu_cores_used == null ? "-" : system.data.process.cpu_cores_used} 核（单核≈{" "}
                  {system.data.process.cpu_cores_used == null ? "-" : Math.round(system.data.process.cpu_cores_used * 100)}%）
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {pickNumber((system.data.cgroup as any)?.cpu, "usage_cores_used") != null ? (
                    <>
                      cgroup：≈ {pickNumber((system.data.cgroup as any)?.cpu, "usage_cores_used")} 核 /{" "}
                      {pickNumber((system.data.cgroup as any)?.cpu, "effective_limit_cores") ??
                        pickNumber((system.data.cgroup as any)?.cpu, "limit_cores") ??
                        system.data.system.cpu_count ??
                        "-"}
                      {" "}核（更接近 `docker stats`）
                    </>
                  ) : (
                    <>说明：CPU% 来自 Linux VM 的 /proc/stat；不是 macOS 宿主机指标</>
                  )}
                </div>
              </div>

              <div className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Activity className="h-4 w-4" />
                    内存（容器/VM）
                  </div>
                  <div className="font-mono text-sm">
                    {pickNumber((system.data.cgroup as any)?.memory, "used_percent_of_effective_limit") != null
                      ? `${pickNumber((system.data.cgroup as any)?.memory, "used_percent_of_effective_limit")}%`
                      : system.data.system.memory?.used_percent == null
                        ? "-"
                        : `${system.data.system.memory.used_percent}%`}
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {pickNumber((system.data.cgroup as any)?.memory, "current_bytes") != null ? (
                    <>
                      容器 {fmtBytes(pickNumber((system.data.cgroup as any)?.memory, "current_bytes"))} /{" "}
                      {pickNumber((system.data.cgroup as any)?.memory, "effective_limit_bytes") != null
                        ? fmtBytes(pickNumber((system.data.cgroup as any)?.memory, "effective_limit_bytes"))
                        : system.data.system.memory?.total_bytes
                          ? fmtBytes(system.data.system.memory.total_bytes)
                          : "未知"}
                      {" "}· RSS {fmtBytes(system.data.process.rss_bytes)}
                    </>
                  ) : (
                    <>
                      RSS {fmtBytes(system.data.process.rss_bytes)} · VM 总计 {fmtBytes(system.data.system.memory?.total_bytes ?? null)}
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Database className="h-4 w-4" />
                    数据库存储（Postgres）
                  </div>
                  <div className="font-mono text-sm">
                    {storage.data?.postgres?.db_bytes ? fmtBytes(storage.data.postgres.db_bytes) : "-"}
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {(storage.data?.postgres?.tables || [])
                    .slice(0, 3)
                    .map((t) => `${t.name}:${fmtBytes(t.total_bytes)}`)
                    .join(" · ") || "—"}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">包含表+索引体积（pg_total_relation_size），更贴近 RAG 成本</div>
              </div>

              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-sm text-muted-foreground">运行信息</div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div>
                    pid <span className="font-mono text-foreground">{system.data.process.pid}</span> · uptime{" "}
                    <span className="font-mono text-foreground">{Math.round(system.data.process.uptime_s)}s</span>
                  </div>
                  <div>
                    open_fds <span className="font-mono text-foreground">{system.data.process.open_fds ?? "-"}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </Card>

        <Card title="对外 Models" description="来自 /v1/models（每个应用对外暴露一个 model_id）">
          {models.isLoading ? <div className="text-sm text-muted-foreground">加载中...</div> : null}
          {models.error ? <ApiErrorBanner error={models.error} /> : null}
          {apps.error ? <ApiErrorBanner error={apps.error} /> : null}
          <div className="space-y-2">
            {(models.data?.data || []).map((m) => {
              const app = appByPublicModelId.get(m.id);
              return (
                <div key={m.id} className="rounded-md border bg-muted/30 p-3">
                  <CopyableText text={m.id} toastText="已复制 model_id" textClassName="font-mono text-xs" />
                  <div className="mt-1 text-xs text-muted-foreground">
                    {app ? (
                      <>
                        映射：应用 <span className="font-medium">{app.name}</span>（app_id=<span className="font-mono">{app.id}</span>）
                      </>
                    ) : (
                      <>
                        未映射到应用：请在“应用”中配置唯一 <span className="font-mono">public_model_id</span>，并确保其对外暴露为相同的 <span className="font-mono">model_id</span>。
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {!models.data?.data?.length ? <div className="text-sm text-muted-foreground">暂无数据</div> : null}
          </div>
          <div className="pt-2 text-xs text-muted-foreground">
            提示：若对外 model_id 无法对应到应用，可在 <Link className="underline underline-offset-2" to="/apps">应用列表</Link> 调整 public_model_id。
          </div>
        </Card>
      </div>

      <UiCard>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <div className="text-sm font-medium">关键配置（脱敏）</div>
            <div className="mt-1 text-xs text-muted-foreground">只展示常用字段；完整配置见“设置”页</div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings">打开设置</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {settings.isLoading ? <div className="text-sm text-muted-foreground">加载中...</div> : null}
          {settings.error ? <ApiErrorBanner error={settings.error} /> : null}
          {settings.data ? (
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 lg:grid-cols-3">
              <KeyVal k="retrieval.mode" v={String((settings.data as any)?.retrieval?.mode ?? "-")} />
              <KeyVal k="retrieval.rag_top_k" v={String((settings.data as any)?.retrieval?.rag_top_k ?? "-")} />
              <KeyVal k="models.chat.model" v={String((settings.data as any)?.models?.chat?.model ?? "-")} />
              <KeyVal k="models.embeddings.provider" v={String((settings.data as any)?.models?.embeddings?.provider ?? "-")} />
              <KeyVal k="models.rerank.provider" v={String((settings.data as any)?.models?.rerank?.provider ?? "-")} />
              <KeyVal k="jobs.backend" v={String((settings.data as any)?.jobs?.backend ?? "-")} />
            </div>
          ) : null}
        </CardContent>
      </UiCard>
    </div>
  );
}

function formatInt(v: number): string {
  try {
    return new Intl.NumberFormat("zh-CN").format(v);
  } catch {
    return String(v);
  }
}

function pct(v: number): string {
  if (!Number.isFinite(v)) return "-";
  return `${Math.round(v * 100)}%`;
}

function fmtBytes(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let x = Math.max(0, v);
  let i = 0;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i += 1;
  }
  return `${x.toFixed(i >= 2 ? 1 : 0)}${units[i]}`;
}

function pickNumber(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as any)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function Row(props: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="text-muted-foreground">{props.k}</div>
      <div className="text-foreground">{props.v}</div>
    </div>
  );
}

function KeyVal(props: { k: string; v: ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{props.k}</div>
      <div className="mt-1 font-mono text-xs text-foreground">{props.v}</div>
    </div>
  );
}

function MetricCard(props: { icon: ReactNode; title: string; value: ReactNode; sub: ReactNode; help?: string; to?: string }) {
  const card = (
    <UiCard className={props.to ? "cursor-pointer transition-colors hover:bg-muted/40" : undefined}>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {props.icon}
          <span>{props.title}</span>
          {props.help ? (
            <span className="cursor-help" title={props.help} aria-label={props.help}>
              <Info className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{props.value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{props.sub}</div>
      </CardContent>
    </UiCard>
  );
  return props.to ? (
    <Link to={props.to} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}

function sumJobStatus(byType: Record<string, Record<string, number>>, status: string): number {
  let total = 0;
  for (const perType of Object.values(byType || {})) {
    total += Number(perType?.[status] || 0);
  }
  return total;
}
