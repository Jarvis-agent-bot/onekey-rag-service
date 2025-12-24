import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { BulkActionsBar } from "../components/BulkActionsBar";
import { ConfirmDangerDialog } from "../components/ConfirmDangerDialog";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Card } from "../components/Card";
import { CopyableText } from "../components/CopyableText";
import { EmptyState } from "../components/EmptyState";
import { ApiErrorBanner } from "../components/ApiErrorBanner";
import { FilterChips, type FilterChip } from "../components/FilterChips";
import { Pagination } from "../components/Pagination";
import { apiFetch } from "../lib/api";
import { useWorkspace } from "../lib/workspace";

type KbsResp = { items: Array<{ id: string; name: string }> };
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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();

  const kbs = useQuery({
    queryKey: ["kbs", workspaceId],
    queryFn: () => apiFetch<KbsResp>(`/admin/api/workspaces/${workspaceId}/kbs`),
    enabled: !!workspaceId,
  });

  const pageSize = 20;
  const page = Math.max(1, Number.parseInt(sp.get("page") || "1", 10) || 1);
  const kbId = (sp.get("kb_id") || "").trim();
  const sourceId = (sp.get("source_id") || "").trim();
  const indexed = (sp.get("indexed") || "").trim(); // "", "true", "false"
  const q = (sp.get("q") || "").trim();
  const httpStatus = (sp.get("http_status") || "").trim();
  const changedOnly = (sp.get("changed") || "") === "true";
  const dateRange = (sp.get("date_range") || "").trim();

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
    kbId ? { key: "kb_id", label: "KB", value: kbId, onRemove: () => updateFilter([["kb_id", null]]) } : null,
    sourceId ? { key: "source_id", label: "source", value: sourceId, onRemove: () => updateFilter([["source_id", null]]) } : null,
    indexed ? { key: "indexed", label: "indexed", value: indexed, onRemove: () => updateFilter([["indexed", null]]) } : null,
    dateRange ? { key: "date_range", label: "range", value: dateRange, onRemove: () => updateFilter([["date_range", null]]) } : null,
    q ? { key: "q", label: "q", value: q, onRemove: () => updateFilter([["q", null]]) } : null,
    httpStatus ? { key: "http_status", label: "http", value: httpStatus, onRemove: () => updateFilter([["http_status", null]]) } : null,
    changedOnly ? { key: "changed", label: "changed", value: "true", onRemove: () => updateFilter([["changed", null]]) } : null,
  ].filter(Boolean) as FilterChip[];

  const listQuery = useQuery({
    queryKey: ["pages", workspaceId, page, pageSize, kbId, sourceId, indexed, q, httpStatus, changedOnly, dateRange],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      if (kbId) params.set("kb_id", kbId);
      if (sourceId) params.set("source_id", sourceId);
      if (indexed === "true") params.set("indexed", "true");
      if (indexed === "false") params.set("indexed", "false");
      if (q) params.set("q", q);
      if (httpStatus) params.set("http_status", httpStatus);
      if (changedOnly) params.set("changed", "true");
      if (dateRange) params.set("date_range", dateRange);
      return apiFetch<PagesResp>(`/admin/api/workspaces/${workspaceId}/pages?${params.toString()}`);
    },
    enabled: !!workspaceId,
  });

  const items = useMemo(() => listQuery.data?.items || [], [listQuery.data]);
  const visibleIds = useMemo(() => items.map((it) => it.id), [items]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    setSelectedIds(new Set());
  }, [workspaceId, page, kbId, sourceId, indexed, q, httpStatus, changedOnly, dateRange]);

  const selectedCount = selectedIds.size;
  const allSelected = items.length > 0 && selectedCount === items.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const [bulkRecrawlOpen, setBulkRecrawlOpen] = useState(false);
  const [bulkRecrawlTargets, setBulkRecrawlTargets] = useState<number[]>([]);
  const [bulkRecrawlState, setBulkRecrawlState] = useState<{
    running: boolean;
    total: number;
    done: number;
    success: Array<{ page_id: number; job_id: string }>;
    failed: Array<{ page_id: number; error: string }>;
  } | null>(null);

  const recrawl = useMutation({
    mutationFn: async (pageId: number) => {
      return apiFetch<{ job_id: string }>(`/admin/api/workspaces/${workspaceId}/pages/${pageId}/recrawl`, { method: "POST" });
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ["pages", workspaceId] });
      toast.success("已触发 recrawl");
      navigate(`/jobs/${data.job_id}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "触发失败"),
  });

  async function runBulkRecrawl(pageIds: number[]) {
    if (!workspaceId) return;
    const total = pageIds.length;
    if (!total) return;
    setBulkRecrawlState({ running: true, total, done: 0, success: [], failed: [] });

    const success: Array<{ page_id: number; job_id: string }> = [];
    const failed: Array<{ page_id: number; error: string }> = [];
    let done = 0;
    const concurrency = Math.max(1, Math.min(3, total));
    let idx = 0;

    async function worker() {
      while (idx < pageIds.length) {
        const pid = pageIds[idx];
        idx += 1;
        try {
          const res = await apiFetch<{ job_id: string }>(`/admin/api/workspaces/${workspaceId}/pages/${pid}/recrawl`, { method: "POST" });
          success.push({ page_id: pid, job_id: res.job_id });
        } catch (e) {
          failed.push({ page_id: pid, error: e instanceof Error ? e.message : "触发失败" });
        } finally {
          done += 1;
          setBulkRecrawlState({
            running: true,
            total,
            done,
            success: [...success],
            failed: [...failed],
          });
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    await qc.invalidateQueries({ queryKey: ["pages", workspaceId] });
    await qc.invalidateQueries({ queryKey: ["jobs", workspaceId] });
    setSelectedIds(new Set());
    setBulkRecrawlState({ running: false, total, done, success: [...success], failed: [...failed] });
    if (success.length && failed.length) toast.success(`已触发 ${success.length} 个 recrawl；失败 ${failed.length} 个`);
    else if (success.length) toast.success(`已触发 ${success.length} 个 recrawl`);
    else toast.error("批量 recrawl 触发失败");
  }

  const del = useMutation({
    mutationFn: async (pageId: number) => {
      return apiFetch<{ ok: boolean }>(`/admin/api/workspaces/${workspaceId}/pages/${pageId}`, { method: "DELETE" });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["pages", workspaceId] });
      toast.success("已删除页面");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  const actionError = recrawl.error || del.error;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card/90 via-card/70 to-background p-6 shadow-lg shadow-black/30">
        <div className="flex flex-col gap-2">
          <div className="text-xs uppercase tracking-[0.14em] text-primary">Pages</div>
          <div className="text-2xl font-semibold text-foreground">页面搜索 / 变更与失败定位</div>
          <div className="text-sm text-muted-foreground">按知识库/数据源/状态过滤，支持批量重抓与删除。</div>
        </div>
      </div>

      {actionError ? <ApiErrorBanner error={actionError} /> : null}

      <Card
        title="筛选"
        description="按 KB/关键字/HTTP 状态过滤；changed=true 表示 content_hash != indexed_content_hash"
        className="border border-border/70 bg-card/80 shadow-lg shadow-black/20 sticky top-16 z-10"
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-8">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">KB</div>
            <Select
              value={kbId}
              onChange={(e) => {
                updateFilter([["kb_id", e.target.value]]);
              }}
            >
              <option value="">全部</option>
              {(kbs.data?.items || []).map((kb) => (
                <option key={kb.id} value={kb.id}>
                  {kb.name} ({kb.id})
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">source_id</div>
            <Input
              value={sourceId}
              onChange={(e) => {
                updateFilter([["source_id", e.target.value]]);
              }}
              placeholder="例如 src_xxx"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">indexed</div>
            <Select
              value={indexed}
              onChange={(e) => {
                updateFilter([["indexed", e.target.value]]);
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
              <option value="">全部</option>
              <option value="24h">24h</option>
              <option value="7d">7d</option>
              <option value="30d">30d</option>
            </Select>
          </div>
          <div className="space-y-1 lg:col-span-2">
            <div className="text-xs text-muted-foreground">q（URL/标题模糊匹配）</div>
            <Input
              value={q}
              onChange={(e) => {
                updateFilter([["q", e.target.value]]);
              }}
              placeholder="例如 /connect 或 OneKey"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">http_status</div>
            <Input
              value={httpStatus}
              onChange={(e) => {
                updateFilter([["http_status", e.target.value]]);
              }}
              placeholder="例如 200,404"
            />
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={changedOnly}
                onChange={(e) => {
                  updateFilter([["changed", e.target.checked ? "true" : null]]);
                }}
              />
              只看 changed
            </label>
            <Button variant="outline" onClick={() => listQuery.refetch()}>
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

      <Card title="列表" description="点击 ID 查看详情；支持单页 recrawl 与删除（谨慎）">
        {listQuery.isLoading ? <div className="text-sm text-muted-foreground">加载中...</div> : null}
        {listQuery.error ? <ApiErrorBanner error={listQuery.error} /> : null}
        <BulkActionsBar
          count={selectedCount}
          onClear={() => setSelectedIds(new Set())}
          actions={
            <Button
              type="button"
              size="sm"
              disabled={bulkRecrawlState?.running}
              onClick={() => {
                setBulkRecrawlTargets(Array.from(selectedIds));
                setBulkRecrawlState(null);
                setBulkRecrawlOpen(true);
              }}
            >
              批量 recrawl
            </Button>
          }
        />

        <Dialog
          open={bulkRecrawlOpen}
          onOpenChange={(next) => {
            if (bulkRecrawlState?.running) return;
            setBulkRecrawlOpen(next);
            if (!next) {
              setBulkRecrawlTargets([]);
              setBulkRecrawlState(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>批量 recrawl</DialogTitle>
              <DialogDescription>将为每个 page 触发一个 crawl 任务（可能带来额外请求与成本）。</DialogDescription>
            </DialogHeader>
            {bulkRecrawlState ? (
              <div className="space-y-3">
                <div className="text-sm">
                  进度：{bulkRecrawlState.done}/{bulkRecrawlState.total}
                  {bulkRecrawlState.running ? <span className="ml-2 text-muted-foreground">执行中...</span> : null}
                </div>
                {bulkRecrawlState.success.length ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">成功（{bulkRecrawlState.success.length}）</div>
                    <div className="space-y-1">
                      {bulkRecrawlState.success.slice(0, 50).map((s) => (
                        <CopyableText
                          key={`${s.page_id}:${s.job_id}`}
                          text={s.job_id}
                          prefix={<span className="font-mono text-xs">page {s.page_id}</span>}
                          toastText="已复制 job_id"
                        />
                      ))}
                      {bulkRecrawlState.success.length > 50 ? (
                        <div className="text-xs text-muted-foreground">仅展示前 50 条，可在任务列表查看完整结果。</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {bulkRecrawlState.failed.length ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-destructive">失败（{bulkRecrawlState.failed.length}）</div>
                    <div className="space-y-1">
                      {bulkRecrawlState.failed.slice(0, 50).map((f) => (
                        <CopyableText
                          key={`${f.page_id}`}
                          text={f.error}
                          prefix={<span className="font-mono text-xs">page {f.page_id}</span>}
                          toastText="已复制错误信息"
                          textClassName="font-mono text-xs text-destructive"
                        />
                      ))}
                      {bulkRecrawlState.failed.length > 50 ? (
                        <div className="text-xs text-muted-foreground">仅展示前 50 条，可复制错误后再联查。</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div>
                  本次将触发 <span className="font-medium">{bulkRecrawlTargets.length}</span> 个 page 的 recrawl。
                </div>
                {bulkRecrawlTargets.length ? (
                  <div className="text-xs text-muted-foreground">
                    page_id：{bulkRecrawlTargets.slice(0, 20).join(", ")}
                    {bulkRecrawlTargets.length > 20 ? ` …（共 ${bulkRecrawlTargets.length} 个）` : null}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">未选择任何条目。</div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={bulkRecrawlState?.running}
                onClick={() => setBulkRecrawlOpen(false)}
              >
                {bulkRecrawlState?.running ? "执行中..." : "关闭"}
              </Button>
              {bulkRecrawlState?.running || bulkRecrawlState ? null : (
                <Button
                  type="button"
                  disabled={!bulkRecrawlTargets.length}
                  onClick={() => void runBulkRecrawl(bulkRecrawlTargets)}
                >
                  开始执行
                </Button>
              )}
              {bulkRecrawlState && !bulkRecrawlState.running ? (
                <Button type="button" onClick={() => navigate("/jobs?type=crawl")}>
                  查看任务列表
                </Button>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[44px]">
                <Checkbox
                  aria-label="选择本页全部"
                  disabled={!items.length || bulkRecrawlState?.running}
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={(checked) => {
                    setSelectedIds(() => {
                      if (checked) return new Set(visibleIds);
                      return new Set();
                    });
                  }}
                />
              </TableHead>
              <TableHead className="w-[90px]">ID</TableHead>
              <TableHead className="w-[160px]">KB</TableHead>
              <TableHead className="w-[180px]">Source</TableHead>
              <TableHead>标题</TableHead>
              <TableHead>URL</TableHead>
              <TableHead className="w-[80px]">HTTP</TableHead>
              <TableHead className="w-[90px]">indexed</TableHead>
              <TableHead className="w-[90px]">changed</TableHead>
              <TableHead className="w-[160px]">最后抓取</TableHead>
              <TableHead className="w-[240px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length ? (
              items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>
                    <Checkbox
                      aria-label={`选择 page ${it.id}`}
                      disabled={bulkRecrawlState?.running}
                      checked={selectedIds.has(it.id)}
                      onCheckedChange={(checked) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(it.id);
                          else next.delete(it.id);
                          return next;
                        });
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <Link className="underline underline-offset-2" to={`/pages/${it.id}`}>
                      {it.id}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{it.kb_id}</TableCell>
                  <TableCell className="font-mono text-xs">{it.source_id || "-"}</TableCell>
                  <TableCell>{it.title || <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell className="max-w-[520px]">
                    <CopyableText text={it.url} href={it.url} />
                  </TableCell>
                  <TableCell>
                    <span className={it.http_status >= 400 ? "text-red-300" : ""}>{it.http_status || "-"}</span>
                  </TableCell>
                  <TableCell>{it.indexed ? <span className="text-emerald-300">yes</span> : <span className="text-muted-foreground">no</span>}</TableCell>
                  <TableCell>{it.changed ? <span className="text-amber-300">yes</span> : <span className="text-muted-foreground">no</span>}</TableCell>
                  <TableCell className="text-muted-foreground">{it.last_crawled_at || "-"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => navigate(`/pages/${it.id}`)}>
                        详情
                      </Button>
                      <Button variant="outline" size="sm" disabled={recrawl.isPending} onClick={() => recrawl.mutate(it.id)}>
                        recrawl
                      </Button>
                      <ConfirmDangerDialog
                        trigger={
                          <Button variant="outline" size="sm" disabled={del.isPending}>
                            删除
                          </Button>
                        }
                        title="确认删除 Page？"
                        description={
                          <>
                            将删除 page_id=<span className="font-mono">{it.id}</span>（会级联删除 chunks）。此操作不可恢复。
                          </>
                        }
                        confirmLabel="继续删除"
                        confirmVariant="destructive"
                        confirmText={String(it.id)}
                        confirmPlaceholder="输入 page_id 确认"
                        confirmDisabled={del.isPending}
                        onConfirm={() => del.mutateAsync(it.id)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={11}>
                  <EmptyState
                    description="可以尝试清空筛选条件，或去任务中心触发抓取/索引。"
                    actions={
                      <>
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
                        <Button asChild type="button" variant="outline" size="sm">
                          <Link to="/jobs">去任务中心</Link>
                        </Button>
                      </>
                    }
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <Pagination
          page={listQuery.data?.page || page}
          pageSize={listQuery.data?.page_size || pageSize}
          total={listQuery.data?.total || 0}
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
