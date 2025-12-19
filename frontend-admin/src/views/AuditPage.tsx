import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { Card } from "../components/Card";
import { ApiErrorBanner } from "../components/ApiErrorBanner";
import { CopyableText } from "../components/CopyableText";
import { EmptyState } from "../components/EmptyState";
import { FilterChips, type FilterChip } from "../components/FilterChips";
import { Pagination } from "../components/Pagination";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { apiFetch } from "../lib/api";
import { useWorkspace } from "../lib/workspace";

type AuditLogsResp = {
  page: number;
  page_size: number;
  total: number;
  items: Array<{
    id: number;
    actor: string;
    action: string;
    object_type: string;
    object_id: string;
    meta: Record<string, unknown>;
    created_at: string | null;
  }>;
};

export function AuditPage() {
  const { workspaceId } = useWorkspace();
  const [sp, setSp] = useSearchParams();

  const pageSize = 20;
  const page = Math.max(1, Number.parseInt(sp.get("page") || "1", 10) || 1);
  const dateRange = (sp.get("date_range") || "24h").trim();
  const actor = (sp.get("actor") || "").trim();
  const action = (sp.get("action") || "").trim();
  const objectType = (sp.get("object_type") || "").trim();
  const objectId = (sp.get("object_id") || "").trim();

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
    dateRange && dateRange !== "24h"
      ? { key: "date_range", label: "范围", value: dateRange, onRemove: () => updateFilter([["date_range", null]]) }
      : null,
    actor ? { key: "actor", label: "操作者", value: actor, onRemove: () => updateFilter([["actor", null]]) } : null,
    action ? { key: "action", label: "动作", value: action, onRemove: () => updateFilter([["action", null]]) } : null,
    objectType ? { key: "object_type", label: "对象类型", value: objectType, onRemove: () => updateFilter([["object_type", null]]) } : null,
    objectId ? { key: "object_id", label: "对象", value: objectId, onRemove: () => updateFilter([["object_id", null]]) } : null,
  ].filter(Boolean) as FilterChip[];

  const q = useQuery({
    queryKey: ["audit-logs", workspaceId, page, pageSize, dateRange, actor, action, objectType, objectId],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      if (dateRange) params.set("date_range", dateRange);
      if (actor) params.set("actor", actor);
      if (action) params.set("action", action);
      if (objectType) params.set("object_type", objectType);
      if (objectId) params.set("object_id", objectId);
      return apiFetch<AuditLogsResp>(`/admin/api/workspaces/${workspaceId}/audit-logs?${params.toString()}`);
    },
    enabled: !!workspaceId,
  });

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold">审计日志</div>

      <Card title="筛选" description="用于追踪关键操作：删除/触发任务/修改配置等">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
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
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">操作者</div>
            <Input
              value={actor}
              onChange={(e) => updateFilter([["actor", e.target.value]])}
              placeholder="例如 admin"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">动作</div>
            <Input
              value={action}
              onChange={(e) => updateFilter([["action", e.target.value]])}
              placeholder="例如 page.delete / job.trigger"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">对象类型</div>
            <Select value={objectType} onChange={(e) => updateFilter([["object_type", e.target.value]])}>
              <option value="">全部</option>
              <option value="kb">kb</option>
              <option value="source">source</option>
              <option value="app">app</option>
              <option value="page">page</option>
              <option value="job">job</option>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">对象 ID</div>
            <Input
              value={objectId}
              onChange={(e) => updateFilter([["object_id", e.target.value]])}
              placeholder="例如 kb_xxx / crawl_xxx"
            />
          </div>
          <div className="flex items-end gap-3">
            <Button variant="outline" onClick={() => q.refetch()}>
              刷新
            </Button>
            <Button variant="outline" onClick={() => setSp(new URLSearchParams(), { replace: true })}>
              清空
            </Button>
          </div>
        </div>
        <FilterChips items={chips} className="pt-3" />
      </Card>

      <Card title="列表" description="按时间倒序；meta 支持复制">
        {q.isLoading ? <div className="text-sm text-muted-foreground">加载中...</div> : null}
        {q.error ? <ApiErrorBanner error={q.error} /> : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[190px]">时间</TableHead>
              <TableHead className="w-[120px]">操作者</TableHead>
              <TableHead className="w-[180px]">动作</TableHead>
              <TableHead className="w-[320px]">对象</TableHead>
              <TableHead>meta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data?.items || []).length ? (
              (q.data?.items || []).map((it) => {
                const metaText = it.meta && Object.keys(it.meta).length ? JSON.stringify(it.meta) : "";
                return (
                  <TableRow key={it.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{it.created_at || "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{it.actor || "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{it.action || "-"}</TableCell>
                    <TableCell>
                      <CopyableText
                        text={it.object_id || "-"}
                        prefix={<span className="font-mono text-xs text-muted-foreground">{it.object_type || "-"}</span>}
                        toastText="已复制对象 ID"
                      />
                    </TableCell>
                    <TableCell className="max-w-[520px]">
                      {metaText ? (
                        <CopyableText text={metaText} toastText="已复制 meta" textClassName="font-mono text-xs" />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={5}>
                  <EmptyState
                    description="暂无审计日志。可以尝试扩大时间范围或清空筛选条件。"
                    actions={
                      <Button type="button" variant="outline" size="sm" onClick={() => setSp(new URLSearchParams(), { replace: true })}>
                        清空筛选
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <Pagination
          page={q.data?.page || page}
          pageSize={q.data?.page_size || pageSize}
          total={q.data?.total || 0}
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

