import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Card } from "../components/Card";
import { Pagination } from "../components/Pagination";
import { EmptyState } from "../components/EmptyState";
import { ApiErrorBanner } from "../components/ApiErrorBanner";
import { FilterChips, type FilterChip } from "../components/FilterChips";
import { TraceLink } from "../components/TraceLink";
import { FeedbackTriage } from "../components/FeedbackTriage";
import { apiFetch } from "../lib/api";
import { useWorkspace } from "../lib/workspace";

type AppsResp = { items: Array<{ id: string; name: string; public_model_id: string }> };
type FeedbackResp = {
  page: number;
  page_size: number;
  total: number;
  items: Array<{
    id: number;
    app_id: string;
    conversation_id: string;
    message_id: string;
    rating: string;
    reason: string;
    comment: string;
    sources: Record<string, unknown>;
    status: string;
    attribution: string;
    tags: string[];
    created_at: string | null;
    updated_at: string | null;
  }>;
};

export function FeedbackPage() {
  const { workspaceId } = useWorkspace();
  const [sp, setSp] = useSearchParams();

  const apps = useQuery({
    queryKey: ["apps", workspaceId],
    queryFn: () => apiFetch<AppsResp>(`/admin/api/workspaces/${workspaceId}/apps`),
    enabled: !!workspaceId,
  });

  const pageSize = 20;
  const page = Math.max(1, Number.parseInt(sp.get("page") || "1", 10) || 1);
  const appId = (sp.get("app_id") || "").trim();
  const rating = (sp.get("rating") || "").trim();
  const reason = (sp.get("reason") || "").trim();
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
    appId ? { key: "app_id", label: "App", value: appId, onRemove: () => updateFilter([["app_id", null]]) } : null,
    rating ? { key: "rating", label: "rating", value: rating, onRemove: () => updateFilter([["rating", null]]) } : null,
    reason ? { key: "reason", label: "reason", value: reason, onRemove: () => updateFilter([["reason", null]]) } : null,
    dateRange && dateRange !== "24h"
      ? { key: "date_range", label: "range", value: dateRange, onRemove: () => updateFilter([["date_range", "24h"]]) }
      : null,
  ].filter(Boolean) as FilterChip[];

  const list = useQuery({
    queryKey: ["feedback", workspaceId, page, pageSize, appId, rating, reason, dateRange],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      if (appId) params.set("app_id", appId);
      if (rating) params.set("rating", rating);
      if (reason) params.set("reason", reason);
      if (dateRange) params.set("date_range", dateRange);
      return apiFetch<FeedbackResp>(`/admin/api/workspaces/${workspaceId}/feedback?${params.toString()}`);
    },
    enabled: !!workspaceId,
  });

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold">反馈</div>

      <Card title="筛选" description="rating/reason/app 过滤；message_id 通常可用于关联检索事件（request_id）">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">App</div>
            <Select
              value={appId}
              onChange={(e) => {
                updateFilter([["app_id", e.target.value]]);
              }}
            >
              <option value="">全部</option>
              {(apps.data?.items || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.public_model_id})
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">rating</div>
            <Select
              value={rating}
              onChange={(e) => {
                updateFilter([["rating", e.target.value]]);
              }}
            >
              <option value="">全部</option>
              <option value="up">up</option>
              <option value="down">down</option>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">时间范围</div>
            <Select
              value={dateRange}
              onChange={(e) => {
                updateFilter([["date_range", e.target.value]]);
              }}
            >
              <option value="24h">24h</option>
              <option value="7d">7d</option>
              <option value="30d">30d</option>
            </Select>
          </div>
          <div className="space-y-1 lg:col-span-2">
            <div className="text-xs text-muted-foreground">reason（精确匹配）</div>
            <Input
              value={reason}
              onChange={(e) => {
                updateFilter([["reason", e.target.value]]);
              }}
              placeholder="例如 hallucination / not_helpful"
            />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={() => list.refetch()}>
              刷新
            </Button>
            <Button
              variant="outline"
              className="ml-2"
              onClick={() => {
                setSp(new URLSearchParams(), { replace: true });
              }}
            >
              清空
            </Button>
          </div>
        </div>
        <FilterChips items={chips} className="pt-3" />
      </Card>

      <Card title="列表" description="后续可扩展：标注、归因、运营看板、评测集回归">
        {list.isLoading ? <div className="text-sm text-muted-foreground">加载中...</div> : null}
        {list.error ? <ApiErrorBanner error={list.error} /> : null}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2">时间</th>
                <th className="py-2">App</th>
                <th className="py-2">rating</th>
                <th className="py-2">reason</th>
                <th className="py-2">comment</th>
                <th className="py-2">状态</th>
                <th className="py-2">归因</th>
                <th className="py-2">tags</th>
                <th className="py-2">conversation_id</th>
                <th className="py-2">message_id</th>
              </tr>
            </thead>
            <tbody>
              {(list.data?.items || []).length ? (
                (list.data?.items || []).map((it) => (
                  <tr key={it.id} className="border-t align-top">
                    <td className="py-2 font-mono text-xs text-muted-foreground">{it.created_at || "-"}</td>
                    <td className="py-2 font-mono text-xs">{it.app_id || "-"}</td>
                    <td className="py-2">
                      <span className={it.rating === "down" ? "text-red-300" : "text-emerald-300"}>{it.rating}</span>
                    </td>
                    <td className="py-2">{it.reason || <span className="text-muted-foreground">-</span>}</td>
                    <td className="py-2 max-w-[260px] break-words">{it.comment || <span className="text-muted-foreground">-</span>}</td>
                    <td className="py-2">
                      <FeedbackTriage feedbackId={it.id} status={it.status} attribution={it.attribution} tags={it.tags || []} />
                    </td>
                    <td className="py-2 font-mono text-xs">{it.attribution || <span className="text-muted-foreground">-</span>}</td>
                    <td className="py-2 max-w-[220px] break-words text-xs">
                      {it.tags?.length ? it.tags.map((t) => `#${t}`).join(" ") : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="py-2 max-w-[260px]">
                      {it.conversation_id ? (
                        <TraceLink
                          text={it.conversation_id}
                          textClassName="font-mono text-xs"
                          toastText="已复制 conversation_id"
                          to={`/observability?conversation_id=${encodeURIComponent(it.conversation_id)}`}
                          toLabel="去观测联查"
                        />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-2 max-w-[260px]">
                      {it.message_id ? (
                        <TraceLink
                          text={it.message_id}
                          textClassName="font-mono text-xs"
                          toastText="已复制 message_id"
                          to={`/observability?message_id=${encodeURIComponent(it.message_id)}`}
                          toLabel="去观测联查"
                        />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="border-t">
                  <td colSpan={10}>
                    <EmptyState
                      description="暂无反馈数据；请确认已接入反馈上报或扩大时间范围。"
                      actions={
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              updateFilter([["date_range", "7d"]]);
                            }}
                          >
                            查看 7d
                          </Button>
                          <Button asChild type="button" variant="outline" size="sm">
                            <Link to="/observability">去观测页</Link>
                          </Button>
                        </>
                      }
                      className="py-6"
                    />
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
