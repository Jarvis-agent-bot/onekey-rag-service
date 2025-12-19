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
import { apiFetch } from "../lib/api";
import { useWorkspace } from "../lib/workspace";

type RetrievalEventsResp = {
  page: number;
  page_size: number;
  total: number;
  items: Array<{
    id: number;
    app_id: string;
    kb_ids: string[];
    request_id: string;
    conversation_id: string;
    message_id: string;
    timings_ms: Record<string, unknown>;
    created_at: string | null;
    has_error: boolean;
    error_code: string;
  }>;
};

function pickNumber(obj: Record<string, unknown> | undefined, key: string): number | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function ObservabilityPage() {
  const { workspaceId } = useWorkspace();
  const [sp, setSp] = useSearchParams();

  const pageSize = 20;
  const page = Math.max(1, Number.parseInt(sp.get("page") || "1", 10) || 1);
  const appId = (sp.get("app_id") || "").trim();
  const kbId = (sp.get("kb_id") || "").trim();
  const conversationId = (sp.get("conversation_id") || "").trim();
  const messageId = (sp.get("message_id") || "").trim();
  const requestId = (sp.get("request_id") || "").trim();
  const errorCode = (sp.get("error_code") || "").trim();
  const hasError = (sp.get("has_error") || "").trim(); // "", "true", "false"
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
    appId ? { key: "app_id", label: "app", value: appId, onRemove: () => updateFilter([["app_id", null]]) } : null,
    kbId ? { key: "kb_id", label: "KB", value: kbId, onRemove: () => updateFilter([["kb_id", null]]) } : null,
    conversationId
      ? { key: "conversation_id", label: "conversation", value: conversationId, onRemove: () => updateFilter([["conversation_id", null]]) }
      : null,
    messageId ? { key: "message_id", label: "message", value: messageId, onRemove: () => updateFilter([["message_id", null]]) } : null,
    requestId ? { key: "request_id", label: "request", value: requestId, onRemove: () => updateFilter([["request_id", null]]) } : null,
    errorCode ? { key: "error_code", label: "error_code", value: errorCode, onRemove: () => updateFilter([["error_code", null]]) } : null,
    hasError ? { key: "has_error", label: "error", value: hasError, onRemove: () => updateFilter([["has_error", null]]) } : null,
    dateRange && dateRange !== "24h"
      ? { key: "date_range", label: "range", value: dateRange, onRemove: () => updateFilter([["date_range", "24h"]]) }
      : null,
  ].filter(Boolean) as FilterChip[];

  const list = useQuery({
    queryKey: ["retrieval-events", workspaceId, page, pageSize, appId, kbId, conversationId, messageId, requestId, errorCode, hasError, dateRange],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      if (appId) params.set("app_id", appId);
      if (kbId) params.set("kb_id", kbId);
      if (conversationId) params.set("conversation_id", conversationId);
      if (messageId) params.set("message_id", messageId);
      if (requestId) params.set("request_id", requestId);
      if (errorCode) params.set("error_code", errorCode);
      if (hasError === "true") params.set("has_error", "true");
      if (hasError === "false") params.set("has_error", "false");
      if (dateRange) params.set("date_range", dateRange);
      return apiFetch<RetrievalEventsResp>(`/admin/api/workspaces/${workspaceId}/retrieval-events?${params.toString()}`);
    },
    enabled: !!workspaceId,
  });

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold">观测（Retrieval Events）</div>

      {list.error ? <ApiErrorBanner error={list.error} /> : null}

      <Card title="筛选" description="仅存检索调试元数据（hash/len/chunk_ids/scores/timings），不存原文">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">app_id</div>
            <Input
              value={appId}
              onChange={(e) => {
                updateFilter([["app_id", e.target.value]]);
              }}
              placeholder="例如 app_default"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">kb_id</div>
            <Input
              value={kbId}
              onChange={(e) => {
                updateFilter([["kb_id", e.target.value]]);
              }}
              placeholder="例如 default"
            />
          </div>
          <div className="space-y-1 lg:col-span-2">
            <div className="text-xs text-muted-foreground">conversation_id</div>
            <Input
              value={conversationId}
              onChange={(e) => {
                updateFilter([["conversation_id", e.target.value]]);
              }}
              placeholder="精确匹配"
            />
          </div>
          <div className="space-y-1 lg:col-span-2">
            <div className="text-xs text-muted-foreground">message_id</div>
            <Input
              value={messageId}
              onChange={(e) => {
                updateFilter([["message_id", e.target.value]]);
              }}
              placeholder="精确匹配"
            />
          </div>
          <div className="space-y-1 lg:col-span-2">
            <div className="text-xs text-muted-foreground">request_id</div>
            <Input
              value={requestId}
              onChange={(e) => {
                updateFilter([["request_id", e.target.value]]);
              }}
              placeholder="chatcmpl_xxx"
            />
          </div>
          <div className="space-y-1 lg:col-span-2">
            <div className="text-xs text-muted-foreground">error_code</div>
            <Input
              value={errorCode}
              onChange={(e) => {
                updateFilter([["error_code", e.target.value]]);
              }}
              placeholder="例如 prepare_timeout"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">has_error</div>
            <Select
              value={hasError}
              onChange={(e) => {
                updateFilter([["has_error", e.target.value]]);
              }}
            >
              <option value="">全部</option>
              <option value="true">true</option>
              <option value="false">false</option>
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
          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              onClick={() => list.refetch()}
            >
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

      <Card title="列表" description="点击 event_id 查看详情（timings / chunk_ids / sources 等）">
        {list.isLoading ? <div className="text-sm text-muted-foreground">加载中...</div> : null}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2">event_id</th>
                <th className="py-2">时间</th>
                <th className="py-2">app_id</th>
                <th className="py-2">kb_ids</th>
                <th className="py-2">request_id</th>
                <th className="py-2">message_id</th>
                <th className="py-2">total_ms</th>
                <th className="py-2">error</th>
              </tr>
            </thead>
            <tbody>
              {(list.data?.items || []).length ? (
                (list.data?.items || []).map((it) => {
                const totalMs = pickNumber(it.timings_ms || {}, "total") ?? pickNumber(it.timings_ms || {}, "total_prepare");
                return (
                  <tr key={it.id} className="border-t align-top">
                      <td className="py-2 font-mono text-xs">
                        <Link className="underline underline-offset-2" to={`/observability/retrieval-events/${it.id}`}>
                          {it.id}
                        </Link>
                      </td>
                    <td className="py-2 font-mono text-xs text-muted-foreground">{it.created_at || "-"}</td>
                    <td className="py-2 font-mono text-xs">{it.app_id || "-"}</td>
                    <td className="py-2 font-mono text-xs">{(it.kb_ids || []).join(",")}</td>
                    <td className="py-2 max-w-[340px]">
                      {it.request_id ? (
                        <TraceLink
                          text={it.request_id}
                          textClassName="font-mono text-xs"
                          toastText="已复制 request_id"
                          to={`/observability/retrieval-events/${it.id}`}
                          toLabel="事件详情"
                        />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-2 max-w-[340px]">
                      {it.message_id ? (
                        <TraceLink
                          text={it.message_id}
                          textClassName="font-mono text-xs"
                          toastText="已复制 message_id"
                          to={`/observability?message_id=${encodeURIComponent(it.message_id)}&date_range=${encodeURIComponent(dateRange)}`}
                          toLabel="按 message_id 过滤"
                        />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-2 font-mono text-xs">{totalMs != null ? totalMs : "-"}</td>
                    <td className="py-2 font-mono text-xs">
                      {it.has_error ? <span className="text-red-300">{it.error_code || "error"}</span> : <span className="text-muted-foreground">{it.error_code || "ok"}</span>}
                    </td>
                  </tr>
                );
              })
              ) : (
                <tr className="border-t">
                  <td colSpan={8}>
                    <EmptyState
                      description="暂无观测数据；请确认已产生请求或调整筛选条件。"
                      actions={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSp(new URLSearchParams(), { replace: true });
                          }}
                        >
                          清空筛选
                        </Button>
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
