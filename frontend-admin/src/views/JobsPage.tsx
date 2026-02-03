import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Card } from "../components/Card";
import { ApiErrorBanner } from "../components/ApiErrorBanner";
import { Loading } from "../components/Loading";
import { EmptyState } from "../components/EmptyState";
import { DebouncedInput } from "../components/DebouncedInput";
import { EntityLinksBar } from "../components/EntityLinksBar";
import { ProgressPill } from "../components/ProgressPill";
import { Button } from "../components/ui/button";
import { Select } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { ConfirmDangerDialog } from "../components/ConfirmDangerDialog";
import { apiFetch } from "../lib/api";
import { useWorkspace } from "../lib/workspace";

type JobItem = {
  id: string;
  type: string;
  status: string;
  kb_id: string;
  app_id: string;
  source_id: string;
  progress: Record<string, unknown>;
  error: string;
  started_at: string | null;
  finished_at: string | null;
};

type JobsResp = {
  page: number;
  page_size: number;
  total: number;
  items: JobItem[];
};

type KbItem = {
  id: string;
  name: string;
  status: string;
};

type KbsResp = {
  items: KbItem[];
};

function statusLabel(status: string) {
  if (status === "queued") return "排队中";
  if (status === "running") return "运行中";
  if (status === "succeeded") return "成功";
  if (status === "failed") return "失败";
  return status || "-";
}

function statusBadgeVariant(status: string) {
  if (status === "failed") return "destructive";
  if (status === "succeeded") return "default";
  if (status === "running") return "secondary";
  return "outline";
}

export function JobsPage() {
  const { workspaceId } = useWorkspace();
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();

  // 筛选状态
  const statusFilter = (sp.get("status") || "").trim();
  const typeFilter = (sp.get("type") || "").trim();
  const kbIdFilter = (sp.get("kb_id") || "").trim();
  const appIdFilter = (sp.get("app_id") || "").trim();
  const sourceIdFilter = (sp.get("source_id") || "").trim();

  // 展开状态
  const [expandedKbs, setExpandedKbs] = useState<Set<string>>(new Set());
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());

  // 获取知识库列表（用于显示名称）
  const kbs = useQuery({
    queryKey: ["kbs", workspaceId],
    queryFn: () => apiFetch<KbsResp>(`/admin/api/workspaces/${workspaceId}/kbs`),
    enabled: !!workspaceId,
  });

  // 获取所有任务（最近100个）
  const jobs = useQuery({
    queryKey: ["all-jobs", workspaceId, statusFilter, typeFilter, kbIdFilter, appIdFilter, sourceIdFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("page_size", "100");
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (kbIdFilter) params.set("kb_id", kbIdFilter);
      if (appIdFilter) params.set("app_id", appIdFilter);
      if (sourceIdFilter) params.set("source_id", sourceIdFilter);
      return apiFetch<JobsResp>(`/admin/api/workspaces/${workspaceId}/jobs?${params.toString()}`);
    },
    enabled: !!workspaceId,
    refetchInterval: 10000, // 每10秒刷新
  });

  // 按知识库分组任务
  const groupedJobs = useMemo(() => {
    const items = jobs.data?.items || [];
    const groups = new Map<string, { kb: KbItem | null; jobs: JobItem[]; stats: { running: number; failed: number; queued: number } }>();

    for (const job of items) {
      const kbId = job.kb_id || "__no_kb__";
      if (!groups.has(kbId)) {
        const kb = kbs.data?.items.find((k) => k.id === kbId) || null;
        groups.set(kbId, { kb, jobs: [], stats: { running: 0, failed: 0, queued: 0 } });
      }
      const group = groups.get(kbId)!;
      group.jobs.push(job);
      if (job.status === "running") group.stats.running++;
      if (job.status === "failed") group.stats.failed++;
      if (job.status === "queued") group.stats.queued++;
    }

    // 按任务数量排序，有问题的排前面
    return Array.from(groups.entries()).sort((a, b) => {
      // 有失败或运行中的排前面
      const aScore = a[1].stats.failed * 100 + a[1].stats.running * 10 + a[1].stats.queued;
      const bScore = b[1].stats.failed * 100 + b[1].stats.running * 10 + b[1].stats.queued;
      return bScore - aScore;
    });
  }, [jobs.data, kbs.data]);

  // 汇总统计
  const totalStats = useMemo(() => {
    const items = jobs.data?.items || [];
    return {
      total: items.length,
      running: items.filter((j) => j.status === "running").length,
      failed: items.filter((j) => j.status === "failed").length,
      queued: items.filter((j) => j.status === "queued").length,
      succeeded: items.filter((j) => j.status === "succeeded").length,
    };
  }, [jobs.data]);

  // 批量重试所有失败任务
  const [batchRetryProgress, setBatchRetryProgress] = useState<{ current: number; total: number } | null>(null);

  const batchRetry = useMutation({
    mutationFn: async () => {
      const failedJobs = (jobs.data?.items || []).filter((j) => j.status === "failed");
      if (failedJobs.length === 0) throw new Error("没有失败任务");

      setBatchRetryProgress({ current: 0, total: failedJobs.length });
      let success = 0;

      for (let i = 0; i < failedJobs.length; i++) {
        try {
          await apiFetch(`/admin/api/workspaces/${workspaceId}/jobs/${failedJobs[i].id}/requeue`, { method: "POST" });
          success++;
        } catch {
          // ignore individual failures
        }
        setBatchRetryProgress({ current: i + 1, total: failedJobs.length });
      }

      return { success, total: failedJobs.length };
    },
    onSuccess: (data) => {
      setBatchRetryProgress(null);
      toast.success(`已重试 ${data.success}/${data.total} 个任务`);
      jobs.refetch();
    },
    onError: (e) => {
      setBatchRetryProgress(null);
      toast.error(e instanceof Error ? e.message : "批量重试失败");
    },
  });

  // 单个任务重试
  const requeue = useMutation({
    mutationFn: async (jobId: string) => {
      return apiFetch<{ ok: boolean }>(`/admin/api/workspaces/${workspaceId}/jobs/${jobId}/requeue`, { method: "POST" });
    },
    onSuccess: () => {
      toast.success("已重新入队");
      jobs.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "重试失败"),
  });

  const toggleKb = (kbId: string) => {
    setExpandedKbs((prev) => {
      const next = new Set(prev);
      if (next.has(kbId)) next.delete(kbId);
      else next.add(kbId);
      return next;
    });
  };

  const toggleJob = (jobId: string) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedKbs(new Set(groupedJobs.map(([kbId]) => kbId)));
  };

  const collapseAll = () => {
    setExpandedKbs(new Set());
  };

  // 当从其他页面带着过滤条件跳转过来时（例如 PageDetail → Jobs），默认展开一次，减少“看不到内容”的割裂感。
  // 注意：Jobs 列表会周期性 refetch；如果每次都强制展开，会覆盖用户手动折叠。
  const hasFilter = !!(statusFilter || typeFilter || kbIdFilter || appIdFilter || sourceIdFilter);
  const prevHasFilterRef = useRef<boolean>(false);

  useEffect(() => {
    // 过滤从“无 → 有”时才触发一次自动展开
    if (hasFilter && !prevHasFilterRef.current) {
      if (groupedJobs.length) {
        setExpandedKbs(new Set(groupedJobs.map(([id]) => id)));
      }
      prevHasFilterRef.current = true;
      return;
    }

    // 过滤被清空时重置，方便下次再触发
    if (!hasFilter) {
      prevHasFilterRef.current = false;
    }
  }, [hasFilter, groupedJobs]);

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card/90 via-card/70 to-background p-6 shadow-lg shadow-black/30">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs tracking-wider text-primary">运行</div>
            <div className="text-2xl font-semibold text-foreground">运行中心</div>
            <div className="text-sm text-muted-foreground">
              全局查看各知识库的运行状态（排障/批量重试用）。日常建议从「知识库详情页 → 运行」进入。
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {kbIdFilter ? (
              <Button asChild size="sm" variant="outline">
                <Link to={`/kbs/${encodeURIComponent(kbIdFilter)}?tab=jobs${sourceIdFilter ? `&source_id=${encodeURIComponent(sourceIdFilter)}` : ""}`}>回到该知识库</Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link to="/kbs">知识库（推荐）</Link>
              </Button>
            )}
            {totalStats.failed > 0 && (
              <ConfirmDangerDialog
                trigger={
                  <Button variant="destructive" size="sm" disabled={batchRetry.isPending}>
                    {batchRetry.isPending
                      ? `重试中 ${batchRetryProgress?.current || 0}/${batchRetryProgress?.total || 0}`
                      : `批量重试失败任务 (${totalStats.failed})`}
                  </Button>
                }
                title="确认批量重试？"
                description={<>将重试所有 {totalStats.failed} 个失败任务。</>}
                confirmLabel="开始重试"
                onConfirm={() => batchRetry.mutateAsync()}
              />
            )}
            <Button size="sm" variant="outline" onClick={() => jobs.refetch()} disabled={jobs.isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${jobs.isFetching ? "animate-spin" : ""}`} />
              刷新
            </Button>
          </div>
        </div>

        <EntityLinksBar appId={appIdFilter} kbId={kbIdFilter} sourceId={sourceIdFilter} className="mt-3" />
      </div>

      {/* 汇总统计 */}
      <div className="grid gap-4 md:grid-cols-5">
        <div className="rounded-lg border border-border/50 bg-card/50 p-4">
          <div className="text-3xl font-semibold">{totalStats.total}</div>
          <div className="text-sm text-muted-foreground">总运行数</div>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/50 p-4">
          <div className="text-3xl font-semibold text-blue-500">{totalStats.running}</div>
          <div className="text-sm text-muted-foreground">运行中</div>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/50 p-4">
          <div className="text-3xl font-semibold text-amber-500">{totalStats.queued}</div>
          <div className="text-sm text-muted-foreground">排队中</div>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/50 p-4">
          <div className="text-3xl font-semibold text-emerald-500">{totalStats.succeeded}</div>
          <div className="text-sm text-muted-foreground">已完成</div>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/50 p-4">
          <div className="text-3xl font-semibold text-red-500">{totalStats.failed}</div>
          <div className="text-sm text-muted-foreground">失败</div>
        </div>
      </div>

      {/* 筛选 */}
      <Card
        title="筛选"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={expandAll}>全部展开</Button>
            <Button variant="ghost" size="sm" onClick={collapseAll}>全部收起</Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">状态</div>
            <Select
              value={statusFilter}
              onChange={(e) => {
                const next = new URLSearchParams(sp);
                if (e.target.value) next.set("status", e.target.value);
                else next.delete("status");
                setSp(next, { replace: true });
              }}
            >
              <option value="">全部</option>
              <option value="running">运行中</option>
              <option value="queued">排队中</option>
              <option value="failed">失败</option>
              <option value="succeeded">成功</option>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">类型</div>
            <Select
              value={typeFilter}
              onChange={(e) => {
                const next = new URLSearchParams(sp);
                if (e.target.value) next.set("type", e.target.value);
                else next.delete("type");
                setSp(next, { replace: true });
              }}
            >
              <option value="">全部</option>
              <option value="crawl">采集</option>
              <option value="index">构建索引</option>
            </Select>
          </div>

          <div className="space-y-2">
            <div>
              <div className="text-xs text-muted-foreground">知识库</div>
              <Select
                value={kbIdFilter}
                onChange={(e) => {
                  const next = new URLSearchParams(sp);
                  const vv = (e.target.value || "").trim();
                  if (vv) next.set("kb_id", vv);
                  else next.delete("kb_id");
                  setSp(next, { replace: true });
                }}
              >
                <option value="">全部</option>
                {(kbs.data?.items || [])
                  .slice()
                  .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))
                  .map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name || k.id}
                    </option>
                  ))}
              </Select>
            </div>

            <div>
              <div className="text-[11px] text-muted-foreground">或直接输入 KB ID</div>
              <DebouncedInput
                value={kbIdFilter}
                onChange={(v) => {
                  const next = new URLSearchParams(sp);
                  const vv = v.trim();
                  if (vv) next.set("kb_id", vv);
                  else next.delete("kb_id");
                  setSp(next, { replace: true });
                }}
                placeholder="kb_xxx"
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">App ID</div>
            <DebouncedInput
              value={appIdFilter}
              onChange={(v) => {
                const next = new URLSearchParams(sp);
                const vv = v.trim();
                if (vv) next.set("app_id", vv);
                else next.delete("app_id");
                setSp(next, { replace: true });
              }}
              placeholder="app_xxx"
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Source ID</div>
            <DebouncedInput
              value={sourceIdFilter}
              onChange={(v) => {
                const next = new URLSearchParams(sp);
                const vv = v.trim();
                if (vv) next.set("source_id", vv);
                else next.delete("source_id");
                setSp(next, { replace: true });
              }}
              placeholder="source_xxx"
            />
          </div>

          <div className="flex items-end justify-end">
            <Button variant="outline" size="sm" onClick={() => setSp(new URLSearchParams(), { replace: true })}>
              清空筛选
            </Button>
          </div>
        </div>
      </Card>

      {/* 按知识库分组的任务列表 */}
      {jobs.isLoading ? <Loading /> : null}
      {jobs.error ? <ApiErrorBanner error={jobs.error} /> : null}

      {groupedJobs.length === 0 && !jobs.isLoading && (
        <Card title="任务列表">
          <EmptyState description="暂无任务记录" />
        </Card>
      )}

      {groupedJobs.map(([kbId, group]) => {
        const isExpanded = expandedKbs.has(kbId);
        const kbName = group.kb?.name || (kbId === "__no_kb__" ? "无关联知识库" : kbId);

        return (
          <Card key={kbId} title="" className="overflow-hidden p-0">
            {/* 知识库头部 */}
            <button
              type="button"
              className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
              onClick={() => toggleKb(kbId)}
            >
              <div className="flex items-center gap-3">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <div>
                  <div className="font-medium">{kbName}</div>
                  <div className="text-xs text-muted-foreground font-mono">{kbId !== "__no_kb__" ? kbId : ""}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {group.stats.running > 0 && (
                  <Badge variant="secondary" className="bg-blue-500/20 text-blue-500">
                    {group.stats.running} 运行中
                  </Badge>
                )}
                {group.stats.queued > 0 && (
                  <Badge variant="secondary" className="bg-amber-500/20 text-amber-500">
                    {group.stats.queued} 排队
                  </Badge>
                )}
                {group.stats.failed > 0 && (
                  <Badge variant="destructive">
                    {group.stats.failed} 失败
                  </Badge>
                )}
                <Badge variant="outline">{group.jobs.length} 个任务</Badge>
                {kbId !== "__no_kb__" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      const qs = new URLSearchParams();
                      qs.set("tab", "jobs");
                      // 若当前 Jobs 列表已按 source_id 过滤，则“查看知识库”也尽量带上 source 视角，减少跳转割裂
                      if (sourceIdFilter) qs.set("source_id", sourceIdFilter);
                      navigate(`/kbs/${encodeURIComponent(kbId)}?${qs.toString()}`);
                    }}
                  >
                    查看知识库
                  </Button>
                )}
              </div>
            </button>

            {/* 任务列表 */}
            {isExpanded && (
              <div className="border-t border-border/50">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/30 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">运行 ID</th>
                      <th className="px-4 py-2 w-[80px]">类型</th>
                      <th className="px-4 py-2 w-[80px]">状态</th>
                      <th className="px-4 py-2">关联</th>
                      <th className="px-4 py-2">开始时间</th>
                      <th className="px-4 py-2 w-[140px]">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.jobs.map((job) => {
                      const isJobExpanded = expandedJobs.has(job.id);

                      return (
                        <>
                          <tr key={job.id} className="border-t border-border/30">
                            <td className="px-4 py-2 font-mono text-xs">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="hover:underline"
                                  onClick={() => toggleJob(job.id)}
                                  title={isJobExpanded ? "收起" : "展开"}
                                >
                                  {job.id}
                                </button>
                                <button
                                  type="button"
                                  className="text-[11px] text-muted-foreground underline underline-offset-2"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(job.id);
                                      toast.success("已复制运行 ID");
                                    } catch {
                                      toast.error("复制失败");
                                    }
                                  }}
                                >
                                  复制
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <Badge variant="outline">{job.type === "crawl" ? "采集" : job.type === "index" ? "构建索引" : job.type}</Badge>
                            </td>
                            <td className="px-4 py-2">
                              <Badge variant={statusBadgeVariant(job.status)}>{statusLabel(job.status)}</Badge>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                {job.app_id ? (
                                  <Link
                                    className="font-mono underline underline-offset-2"
                                    to={`/apps/${encodeURIComponent(job.app_id)}`}
                                    title="打开 App 详情"
                                  >
                                    app:{job.app_id}
                                  </Link>
                                ) : (
                                  <span className="text-muted-foreground">app:-</span>
                                )}

                                {job.kb_id && job.source_id ? (
                                  <Link
                                    className="font-mono underline underline-offset-2"
                                    to={`/kbs/${encodeURIComponent(job.kb_id)}?tab=sources&source_id=${encodeURIComponent(job.source_id)}`}
                                    title="打开 KB 详情 → 数据源"
                                  >
                                    source:{job.source_id}
                                  </Link>
                                ) : (
                                  <span className="text-muted-foreground">source:-</span>
                                )}

                                {job.kb_id || job.app_id ? (
                                  <Link
                                    className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                                    to={`/observability?${new URLSearchParams({
                                      ...(job.kb_id ? { kb_id: job.kb_id } : {}),
                                      ...(job.app_id ? { app_id: job.app_id } : {}),
                                    }).toString()}`}
                                    title="按 KB / App 过滤观测"
                                  >
                                    观测
                                  </Link>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-xs text-muted-foreground">{job.started_at?.slice(0, 19).replace("T", " ") || "-"}</td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <Button variant="ghost" size="sm" onClick={() => toggleJob(job.id)}>
                                  {isJobExpanded ? "收起" : "展开"}
                                </Button>
                                {job.status === "failed" && (
                                  <Button variant="ghost" size="sm" disabled={requeue.isPending} onClick={() => requeue.mutate(job.id)}>
                                    重试
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {isJobExpanded ? (
                            <tr className="border-t border-border/30 bg-muted/10">
                              <td colSpan={6} className="px-4 py-3">
                                <div className="flex flex-col gap-3">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <ProgressPill type={job.type} status={job.status} progress={job.progress} />
                                    <div className="text-xs text-muted-foreground">
                                      开始 {job.started_at?.slice(0, 19).replace("T", " ") || "-"}
                                      <span className="mx-2 text-border">·</span>
                                      结束 {job.finished_at?.slice(0, 19).replace("T", " ") || "-"}
                                    </div>
                                    <Button
                                      asChild
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                      }}
                                    >
                                      <Link to={`/jobs/${job.id}`} state={{ from: { kb_id: kbIdFilter || job.kb_id, source_id: sourceIdFilter || job.source_id } }}>
                                        打开详情页
                                      </Link>
                                    </Button>
                                    {job.kb_id ? (
                                      <Button asChild variant="outline" size="sm">
                                        <Link to={`/kbs/${encodeURIComponent(job.kb_id)}?tab=jobs${job.source_id ? `&source_id=${encodeURIComponent(job.source_id)}` : ""}`}>
                                          回到知识库
                                        </Link>
                                      </Button>
                                    ) : null}
                                  </div>

                                  {job.error ? (
                                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                                      <div className="text-xs font-medium text-destructive">错误信息</div>
                                      <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-destructive/90">{job.error}</pre>
                                    </div>
                                  ) : (
                                    <div className="text-xs text-muted-foreground">无错误信息（成功运行通常只需要看采集/索引产出）。</div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
