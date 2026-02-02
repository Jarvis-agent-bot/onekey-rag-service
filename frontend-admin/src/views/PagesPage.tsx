import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Card } from "../components/Card";
import { ApiErrorBanner } from "../components/ApiErrorBanner";
import { Loading } from "../components/Loading";
import { Pagination } from "../components/Pagination";
import { EmptyState } from "../components/EmptyState";
import { FilterChips, type FilterChip } from "../components/FilterChips";
import { CopyableText } from "../components/CopyableText";
import { DebouncedInput } from "../components/DebouncedInput";
import { Button } from "../components/ui/button";
import { Select } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { apiFetch } from "../lib/api";
import { useWorkspace } from "../lib/workspace";

type PagesResp = {
  page: number;
  page_size: number;
  total: number;
  items: Array<{
    id: number;
    kb_id: string;
    source_id: string;
    url: string;
    title: string;
    http_status: number;
    last_crawled_at: string | null;
    indexed: boolean;
    changed: boolean;
  }>;
};

export function PagesPage() {
  const { workspaceId } = useWorkspace();
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();

  const pageSize = 20;
  const page = Math.max(1, Number.parseInt(sp.get("page") || "1", 10) || 1);
  const kbId = (sp.get("kb_id") || "").trim();
  const sourceId = (sp.get("source_id") || "").trim();
  const indexed = (sp.get("indexed") || "").trim();
  const httpStatus = (sp.get("http_status") || "").trim();
  const q = (sp.get("q") || "").trim();
  const dateRange = (sp.get("date_range") || "24h").trim() || "24h";

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
    sourceId ? { key: "source_id", label: "数据源", value: sourceId, onRemove: () => updateFilter([["source_id", null]]) } : null,
    indexed ? { key: "indexed", label: "已索引", value: indexed === "true" ? "是" : "否", onRemove: () => updateFilter([["indexed", null]]) } : null,
    httpStatus ? { key: "http_status", label: "HTTP", value: httpStatus, onRemove: () => updateFilter([["http_status", null]]) } : null,
    q ? { key: "q", label: "搜索", value: q, onRemove: () => updateFilter([["q", null]]) } : null,
    dateRange && dateRange !== "24h"
      ? { key: "date_range", label: "时间", value: dateRange, onRemove: () => updateFilter([["date_range", "24h"]]) }
      : null,
  ].filter(Boolean) as FilterChip[];

  const list = useQuery({
    queryKey: ["pages", workspaceId, page, pageSize, kbId, sourceId, indexed, httpStatus, q, dateRange],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      if (kbId) params.set("kb_id", kbId);
      if (sourceId) params.set("source_id", sourceId);
      if (indexed) params.set("indexed", indexed);
      if (httpStatus) params.set("http_status", httpStatus);
      if (q) params.set("q", q);
      if (dateRange) params.set("date_range", dateRange);
      return apiFetch<PagesResp>(`/admin/api/workspaces/${workspaceId}/pages?${params.toString()}`);
    },
    enabled: !!workspaceId,
  });

  const recrawl = useMutation({
    mutationFn: async (pageId: number) => {
      return apiFetch<{ job_id: string }>(`/admin/api/workspaces/${workspaceId}/pages/${pageId}/recrawl`, { method: "POST" });
    },
    onSuccess: (data) => {
      toast.success("已触发抓取任务，正在跳转详情");
      navigate(`/jobs/${data.job_id}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "触发失败"),
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card/90 via-card/70 to-background p-6 shadow-lg shadow-black/30">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-primary">Pages</div>
            <div className="text-2xl font-semibold text-foreground">内容列表</div>
            <div className="text-sm text-muted-foreground">跨知识库统一查看内容，支持按 KB/来源/索引状态过滤。</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground">时间范围</div>
            <Select value={dateRange} onChange={(e) => updateFilter([["date_range", e.target.value]])}>
              <option value="24h">24h</option>
              <option value="7d">7d</option>
              <option value="30d">30d</option>
            </Select>
          </div>
        </div>

        {(kbId || sourceId) ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>快捷跳转：</span>
            {kbId ? (
              <>
                <Link className="underline underline-offset-2" to={`/kbs/${encodeURIComponent(kbId)}?tab=pages`}>
                  KB 内容
                </Link>
                <Link className="underline underline-offset-2" to={`/kbs/${encodeURIComponent(kbId)}?tab=jobs`}>
                  KB 任务
                </Link>
                <Link className="underline underline-offset-2" to={`/observability?kb_id=${encodeURIComponent(kbId)}`}>
                  观测（按 KB）
                </Link>
              </>
            ) : null}
            {kbId && sourceId ? <span className="text-border">·</span> : null}
            {kbId && sourceId ? (
              <>
                <Link
                  className="underline underline-offset-2"
                  to={`/kbs/${encodeURIComponent(kbId)}?tab=pages&source_id=${encodeURIComponent(sourceId)}`}
                  title="跳到该 KB 的内容 Tab，并自动筛选 source_id"
                >
                  该数据源内容
                </Link>
                <Link
                  className="underline underline-offset-2"
                  to={`/kbs/${encodeURIComponent(kbId)}?tab=jobs&source_id=${encodeURIComponent(sourceId)}`}
                  title="跳到该 KB 的任务 Tab，并自动筛选 source_id"
                >
                  该数据源任务
                </Link>
              </>
            ) : null}
            {kbId ? (
              <>
                <span className="text-border">·</span>
                <Link
                  className="underline underline-offset-2"
                  to={`/jobs?kb_id=${encodeURIComponent(kbId)}${sourceId ? `&source_id=${encodeURIComponent(sourceId)}` : ""}`}
                >
                  任务中心（带筛选）
                </Link>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <Card title="筛选" description="常用：按 KB 或 URL 关键字定位问题页面">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">知识库ID</div>
            <DebouncedInput value={kbId} onChange={(v) => updateFilter([["kb_id", v]])} placeholder="kb_xxx" />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">数据源ID</div>
            <DebouncedInput value={sourceId} onChange={(v) => updateFilter([["source_id", v]])} placeholder="source_xxx" />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">已索引</div>
            <Select value={indexed} onChange={(e) => updateFilter([["indexed", e.target.value]])}>
              <option value="">全部</option>
              <option value="true">是</option>
              <option value="false">否</option>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">HTTP</div>
            <DebouncedInput value={httpStatus} onChange={(v) => updateFilter([["http_status", v]])} placeholder="例如 200/404" />
          </div>
          <div className="space-y-1 lg:col-span-2">
            <div className="text-xs text-muted-foreground">搜索（URL/标题）</div>
            <DebouncedInput value={q} onChange={(v) => updateFilter([["q", v]])} placeholder="关键词" />
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

      <Card title="内容列表" description="点击 ID 进入详情，支持快速重抓取">
        {list.isLoading ? <Loading /> : null}
        {list.error ? <ApiErrorBanner error={list.error} /> : null}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2">ID</th>
                <th className="py-2">知识库</th>
                <th className="py-2">标题</th>
                <th className="py-2">URL</th>
                <th className="py-2">HTTP</th>
                <th className="py-2">已索引</th>
                <th className="py-2">最近抓取</th>
                <th className="py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {(list.data?.items || []).length ? (
                (list.data?.items || []).map((it) => (
                  <tr key={it.id} className="border-t align-top">
                    <td className="py-2 font-mono text-xs">
                      <Link className="underline underline-offset-2" to={`/pages/${it.id}`}>
                        {it.id}
                      </Link>
                    </td>
                    <td className="py-2 font-mono text-xs">
                      {it.kb_id ? (
                        <Link
                          className="underline underline-offset-2"
                          to={`/kbs/${it.kb_id}?tab=pages`}
                          title="打开该知识库的『内容』Tab"
                        >
                          {it.kb_id}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-2 max-w-[220px] truncate">{it.title || <span className="text-muted-foreground">-</span>}</td>
                    <td className="py-2 max-w-[320px]">
                      <CopyableText text={it.url} href={it.url} />
                    </td>
                    <td className="py-2">
                      <span className={it.http_status >= 400 ? "text-red-400" : ""}>{it.http_status || "-"}</span>
                    </td>
                    <td className="py-2">
                      <Badge variant={it.indexed ? "default" : "secondary"}>{it.indexed ? "是" : "否"}</Badge>
                    </td>
                    <td className="py-2 font-mono text-xs text-muted-foreground">{it.last_crawled_at || "-"}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => navigate(`/pages/${it.id}`)}>
                          详情
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={recrawl.isPending}
                          onClick={() => recrawl.mutate(it.id)}
                        >
                          重抓取
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="border-t">
                  <td colSpan={8}>
                    <EmptyState description="暂无内容数据；请先配置数据源并触发抓取。" className="py-6" />
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
