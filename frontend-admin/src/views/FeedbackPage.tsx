import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "../components/ui/button";
import { DebouncedInput } from "../components/DebouncedInput";
import { Select } from "../components/ui/select";
import { Card } from "../components/Card";
import { Loading } from "../components/Loading";
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
  const appById = useMemo(() => new Map((apps.data?.items || []).map((a) => [a.id, a])), [apps.data?.items]);

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
    appId ? { key: "app_id", label: "应用", value: appId, onRemove: () => updateFilter([["app_id", null]]) } : null,
    rating ? { key: "rating", label: "评分", value: rating === "up" ? "好评" : rating === "down" ? "差评" : rating, onRemove: () => updateFilter([["rating", null]]) } : null,
    reason ? { key: "reason", label: "原因", value: reason, onRemove: () => updateFilter([["reason", null]]) } : null,
    dateRange && dateRange !== "24h"
      ? { key: "date_range", label: "时间", value: dateRange, onRemove: () => updateFilter([["date_range", "24h"]]) }
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
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card/90 via-card/70 to-background p-6 shadow-lg shadow-black/30">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-primary">Feedback</div>
            <div className="text-2xl font-semibold text-foreground">用户反馈</div>
            <div className="text-sm text-muted-foreground">按应用/评分/原因过滤，便于聚合问题与运营决策。</div>
          </div>
          <div className="flex items-center gap-2">
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
        </div>
      </div>

      <Card title="筛选" description="按应用、评分、原因分类筛选反馈记录">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">应用</div>
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
            <div className="text-xs text-muted-foreground">评分</div>
            <Select
              value={rating}
              onChange={(e) => {
                updateFilter([["rating", e.target.value]]);
              }}
            >
              <option value="">全部</option>
              <option value="up">好评</option>
              <option value="down">差评</option>
            </Select>
          </div>
          <div className="space-y-1 lg:col-span-2">
            <div className="text-xs text-muted-foreground">原因分类</div>
            <DebouncedInput
              value={reason}
              onChange={(v) => updateFilter([["reason", v]])}
              placeholder="如：幻觉、答非所问、不够详细"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={() => list.refetch()}>
              刷新
            </Button>
            <Button
              variant="outline"
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

      <Card title="反馈列表" description="点击会话ID或消息ID可跳转到观测页查看完整上下文">
        {list.isLoading ? <Loading /> : null}
        {list.error ? <ApiErrorBanner error={list.error} /> : null}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2">时间</th>
                <th className="py-2">应用</th>
                <th className="py-2">评分</th>
                <th className="py-2">原因</th>
                <th className="py-2">用户评论</th>
                <th className="py-2">状态</th>
                <th className="py-2">归因</th>
                <th className="py-2">标签</th>
                <th className="py-2">会话ID</th>
                <th className="py-2">消息ID</th>
              </tr>
            </thead>
            <tbody>
              {(list.data?.items || []).length ? (
                (list.data?.items || []).map((it) => (
                  <tr key={it.id} className="border-t align-top">
                    <td className="py-2 font-mono text-xs text-muted-foreground">{it.created_at || "-"}</td>
                    <td className="py-2 font-mono text-xs">
                      {it.app_id ? (
                        <Link className="underline underline-offset-2" to={`/apps/${it.app_id}`}>
                          {appById.get(it.app_id)?.name || it.app_id}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-2">
                      <span className={it.rating === "down" ? "text-red-300" : "text-emerald-300"}>{it.rating}</span>
                    </td>
                    <td className="py-2">{it.reason || <span className="text-muted-foreground">-</span>}</td>
                    <td className="py-2 max-w-[260px] break-words">{it.comment || <span className="text-muted-foreground">-</span>}</td>
                    <td className="py-2">
                      <FeedbackTriage feedbackId={it.id} status={it.status} attribution={it.attribution} tags={it.tags || []} conversationId={it.conversation_id} />
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
