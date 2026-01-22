import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Card } from "../components/Card";
import { ApiErrorBanner } from "../components/ApiErrorBanner";
import { Loading } from "../components/Loading";
import { Pagination } from "../components/Pagination";
import { EmptyState } from "../components/EmptyState";
import { FilterChips, type FilterChip } from "../components/FilterChips";
import { DebouncedInput } from "../components/DebouncedInput";
import { Button } from "../components/ui/button";
import { Select } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { ConfirmDangerDialog } from "../components/ConfirmDangerDialog";
import { apiFetch } from "../lib/api";
import { useWorkspace } from "../lib/workspace";

type JobsResp = {
  page: number;
  page_size: number;
  total: number;
  items: Array<{
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
  }>;
};

function statusLabel(status: string) {
  if (status === "queued") return "排队中";
  if (status === "running") return "运行中";
  if (status === "succeeded") return "成功";
  if (status === "failed") return "失败";
  return status || "-";
}

export function JobsPage() {
  const { workspaceId } = useWorkspace();
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();

  const pageSize = 20;
  const page = Math.max(1, Number.parseInt(sp.get("page") || "1", 10) || 1);
  const kbId = (sp.get("kb_id") || "").trim();
  const appId = (sp.get("app_id") || "").trim();
  const sourceId = (sp.get("source_id") || "").trim();
  const type = (sp.get("type") || "").trim();
  const status = (sp.get("status") || "").trim();
  const q = (sp.get("q") || "").trim();

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

  const chips: FilterChip[] = [
    kbId ? { key: "kb_id", label: "知识库", value: kbId, onRemove: () => updateFilter([["kb_id", null]]) } : null,
    appId ? { key: "app_id", label: "应用", value: appId, onRemove: () => updateFilter([["app_id", null]]) } : null,
    sourceId ? { key: "source_id", label: "数据源", value: sourceId, onRemove: () => updateFilter([["source_id", null]]) } : null,
    type ? { key: "type", label: "类型", value: type, onRemove: () => updateFilter([["type", null]]) } : null,
    status ? { key: "status", label: "状态", value: statusLabel(status), onRemove: () => updateFilter([["status", null]]) } : null,
    q ? { key: "q", label: "搜索", value: q, onRemove: () => updateFilter([["q", null]]) } : null,
  ].filter(Boolean) as FilterChip[];

  const list = useQuery({
    queryKey: ["jobs", workspaceId, page, pageSize, kbId, appId, sourceId, type, status, q],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      if (kbId) params.set("kb_id", kbId);
      if (appId) params.set("app_id", appId);
      if (sourceId) params.set("source_id", sourceId);
      if (type) params.set("type", type);
      if (status) params.set("status", status);
      if (q) params.set("q", q);
      return apiFetch<JobsResp>(`/admin/api/workspaces/${workspaceId}/jobs?${params.toString()}`);
    },
    enabled: !!workspaceId,
  });

  const requeue = useMutation({
    mutationFn: async (jobId: string) => {
      return apiFetch<{ ok: boolean }>(`/admin/api/workspaces/${workspaceId}/jobs/${jobId}/requeue`, { method: "POST" });
    },
    onSuccess: () => {
      toast.success("已重新入队");
      list.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "重新入队失败"),
  });

  const cancel = useMutation({
    mutationFn: async (jobId: string) => {
      return apiFetch<{ ok: boolean }>(`/admin/api/workspaces/${workspaceId}/jobs/${jobId}/cancel`, { method: "POST" });
    },
    onSuccess: () => {
      toast.success("已取消任务");
      list.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "取消失败"),
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card/90 via-card/70 to-background p-6 shadow-lg shadow-black/30">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-primary">Jobs</div>
            <div className="text-2xl font-semibold text-foreground">任务中心</div>
            <div className="text-sm text-muted-foreground">统一查看抓取/索引任务，失败任务可直接重试。</div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateFilter([["status", "failed"]])}
            >
              只看失败
            </Button>
            <Button size="sm" variant="outline" onClick={() => list.refetch()}>
              刷新
            </Button>
          </div>
        </div>
      </div>

      <Card title="筛选" description="可按 KB/App/Source 缩小范围">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">知识库ID</div>
            <DebouncedInput value={kbId} onChange={(v) => updateFilter([["kb_id", v]])} placeholder="kb_xxx" />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">应用ID</div>
            <DebouncedInput value={appId} onChange={(v) => updateFilter([["app_id", v]])} placeholder="app_xxx" />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">数据源ID</div>
            <DebouncedInput value={sourceId} onChange={(v) => updateFilter([["source_id", v]])} placeholder="source_xxx" />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">类型</div>
            <Select value={type} onChange={(e) => updateFilter([["type", e.target.value]])}>
              <option value="">全部</option>
              <option value="crawl">抓取</option>
              <option value="index">索引</option>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">状态</div>
            <Select value={status} onChange={(e) => updateFilter([["status", e.target.value]])}>
              <option value="">全部</option>
              <option value="queued">排队中</option>
              <option value="running">运行中</option>
              <option value="succeeded">成功</option>
              <option value="failed">失败</option>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">搜索（job_id）</div>
            <DebouncedInput value={q} onChange={(v) => updateFilter([["q", v]])} placeholder="job_xxx" />
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={() => list.refetch()}>
              刷新
            </Button>
            <Button variant="outline" onClick={() => setSp(new URLSearchParams(), { replace: true })}>
              清空
            </Button>
          </div>
        </div>
        <FilterChips items={chips} className="pt-3" />
      </Card>

      <Card title="任务列表" description="失败任务支持重试；排队任务可取消">
        {list.isLoading ? <Loading /> : null}
        {list.error ? <ApiErrorBanner error={list.error} /> : null}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2">任务ID</th>
                <th className="py-2">类型</th>
                <th className="py-2">状态</th>
                <th className="py-2">知识库</th>
                <th className="py-2">数据源</th>
                <th className="py-2">开始时间</th>
                <th className="py-2">结束时间</th>
                <th className="py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {(list.data?.items || []).length ? (
                (list.data?.items || []).map((it) => (
                  <tr key={it.id} className="border-t align-top">
                    <td className="py-2 font-mono text-xs">
                      <Link className="underline underline-offset-2" to={`/jobs/${it.id}`}>
                        {it.id}
                      </Link>
                    </td>
                    <td className="py-2">
                      <Badge variant="outline">{it.type === "crawl" ? "抓取" : it.type === "index" ? "索引" : it.type}</Badge>
                    </td>
                    <td className="py-2">
                      <Badge
                        variant={it.status === "failed" ? "destructive" : it.status === "succeeded" ? "default" : "secondary"}
                      >
                        {statusLabel(it.status)}
                      </Badge>
                    </td>
                    <td className="py-2 font-mono text-xs">
                      {it.kb_id ? (
                        <Link className="underline underline-offset-2" to={`/kbs/${it.kb_id}?tab=jobs`}>
                          {it.kb_id}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-2 font-mono text-xs">{it.source_id || "-"}</td>
                    <td className="py-2 font-mono text-xs text-muted-foreground">{it.started_at || "-"}</td>
                    <td className="py-2 font-mono text-xs text-muted-foreground">{it.finished_at || "-"}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => navigate(`/jobs/${it.id}`)}>
                          详情
                        </Button>
                        <ConfirmDangerDialog
                          trigger={
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={requeue.isPending || it.status === "running"}
                            >
                              重试
                            </Button>
                          }
                          title="确认重新入队？"
                          description={
                            <>
                              将把 job_id=<span className="font-mono">{it.id}</span> 状态重置为 queued，并清空 progress/error。
                            </>
                          }
                          confirmLabel="继续重试"
                          confirmDisabled={requeue.isPending || it.status === "running"}
                          onConfirm={() => requeue.mutateAsync(it.id)}
                        />
                        <ConfirmDangerDialog
                          trigger={
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={cancel.isPending || it.status !== "queued"}
                            >
                              取消
                            </Button>
                          }
                          title="确认取消任务？"
                          description={
                            <>
                              将取消 job_id=<span className="font-mono">{it.id}</span>（仅支持 queued）。
                            </>
                          }
                          confirmLabel="继续取消"
                          confirmVariant="destructive"
                          confirmDisabled={cancel.isPending || it.status !== "queued"}
                          onConfirm={() => cancel.mutateAsync(it.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="border-t">
                  <td colSpan={8}>
                    <EmptyState description="暂无任务记录；请先触发抓取或索引任务。" className="py-6" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={list.data?.page || page}
          pageSize={list.data?.page_size || pageSize}
          total={list.data?.total || 0}
          onPageChange={(p) => {
            const next = new URLSearchParams(sp);
            next.set("page", String(p));
            setSp(next, { replace: true });
          }}
        />
      </Card>
    </div>
  );
}
