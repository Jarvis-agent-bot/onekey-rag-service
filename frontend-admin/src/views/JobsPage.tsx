import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "../components/ui/button";
import { ConfirmDangerDialog } from "../components/ConfirmDangerDialog";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Textarea } from "../components/ui/textarea";
import { Card } from "../components/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Pagination } from "../components/Pagination";
import { EmptyState } from "../components/EmptyState";
import { ApiErrorBanner } from "../components/ApiErrorBanner";
import { FilterChips, type FilterChip } from "../components/FilterChips";
import { ProgressPill } from "../components/ProgressPill";
import { apiFetch } from "../lib/api";
import { useWorkspace } from "../lib/workspace";

type KbsResp = { items: Array<{ id: string; name: string; status: string }> };
type SourcesResp = { items: Array<{ id: string; name: string; type: string; status: string; config: Record<string, unknown> }> };

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
    logs?: Array<Record<string, unknown>>;
    subtasks?: Array<{ id: string; filename?: string; size_bytes?: number; status?: string; error?: string }>;
    error: string;
    started_at: string | null;
    finished_at: string | null;
  }>;
};

function parseLines(text: string): string[] | undefined {
  const lines = (text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.length ? lines : undefined;
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    void u;
    return true;
  } catch {
    return false;
  }
}

function firstInvalidUrl(text: string): string | null {
  const lines = parseLines(text) || [];
  for (const u of lines) {
    if (!isValidUrl(u)) return u;
  }
  return null;
}

function firstInvalidRegex(text: string): string | null {
  const lines = parseLines(text) || [];
  for (const r of lines) {
    try {
      const re = new RegExp(r);
      void re;
    } catch {
      return r;
    }
  }
  return null;
}

export function JobsPage() {
  const { workspaceId } = useWorkspace();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState("list");

  const kbs = useQuery({
    queryKey: ["kbs", workspaceId],
    queryFn: () => apiFetch<KbsResp>(`/admin/api/workspaces/${workspaceId}/kbs`),
    enabled: !!workspaceId,
  });

  // ======== 触发 Crawl ========
  const [crawlKbId, setCrawlKbId] = useState<string>("default");
  const [crawlSourceId, setCrawlSourceId] = useState<string>("source_default");
  const [crawlMode, setCrawlMode] = useState<string>("full");
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [sitemapUrl, setSitemapUrl] = useState<string>("");
  const [seedUrls, setSeedUrls] = useState<string>("");
  const [includePatterns, setIncludePatterns] = useState<string>("");
  const [excludePatterns, setExcludePatterns] = useState<string>("");
  const [maxPages, setMaxPages] = useState<string>("");

  const sources = useQuery({
    queryKey: ["sources", workspaceId, crawlKbId],
    queryFn: () => apiFetch<SourcesResp>(`/admin/api/workspaces/${workspaceId}/kbs/${crawlKbId}/sources`),
    enabled: !!workspaceId && !!crawlKbId,
  });

  const selectedSource = (sources.data?.items || []).find((s) => s.id === crawlSourceId);
  const configuredMaxPages = (() => {
    const v = (selectedSource?.config || {})["max_pages"];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  })();
  const effectiveMaxPagesText = maxPages.trim() || (configuredMaxPages != null ? String(configuredMaxPages) : "-");
  const maxPagesError = (() => {
    const raw = maxPages.trim();
    if (!raw) return "";
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return "max_pages 必须是正整数";
    return "";
  })();
  const baseUrlError = baseUrl.trim() && !isValidUrl(baseUrl.trim()) ? "base_url 不是合法 URL" : "";
  const sitemapUrlError = sitemapUrl.trim() && !isValidUrl(sitemapUrl.trim()) ? "sitemap_url 不是合法 URL" : "";
  const seedUrlsBad = firstInvalidUrl(seedUrls);
  const seedUrlsError = seedUrlsBad ? `seed_urls 含非法 URL：${seedUrlsBad}` : "";
  const includeBad = firstInvalidRegex(includePatterns);
  const includePatternsError = includeBad ? `include_patterns 正则非法：${includeBad}` : "";
  const excludeBad = firstInvalidRegex(excludePatterns);
  const excludePatternsError = excludeBad ? `exclude_patterns 正则非法：${excludeBad}` : "";
  const crawlFormError =
    maxPagesError || baseUrlError || sitemapUrlError || seedUrlsError || includePatternsError || excludePatternsError;
  const crawlFormInvalid = !crawlKbId || !crawlSourceId || !!crawlFormError;

  useEffect(() => {
    const firstKb = kbs.data?.items?.[0];
    if (!firstKb) return;
    if (crawlKbId) return;
    setCrawlKbId(firstKb.id);
  }, [kbs.data, crawlKbId]);

  useEffect(() => {
    const first = sources.data?.items?.[0];
    if (!first) return;
    if (sources.data?.items?.some((s) => s.id === crawlSourceId)) return;
    setCrawlSourceId(first.id);
  }, [sources.data, crawlSourceId]);

  const triggerCrawl = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        kb_id: crawlKbId,
        source_id: crawlSourceId,
        mode: crawlMode,
      };
      if (baseUrl.trim()) payload.base_url = baseUrl.trim();
      if (sitemapUrl.trim()) payload.sitemap_url = sitemapUrl.trim();
      const seed = parseLines(seedUrls);
      const inc = parseLines(includePatterns);
      const exc = parseLines(excludePatterns);
      if (seed) payload.seed_urls = seed;
      if (inc) payload.include_patterns = inc;
      if (exc) payload.exclude_patterns = exc;
      if (maxPages.trim()) payload.max_pages = Number(maxPages.trim());

      return apiFetch<{ job_id: string }>(`/admin/api/workspaces/${workspaceId}/jobs/crawl`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ["jobs", workspaceId] });
      navigate(`/jobs/${data.job_id}`);
    },
  });

  // ======== 触发 Index ========
  const [indexKbId, setIndexKbId] = useState<string>("default");
  const [indexMode, setIndexMode] = useState<string>("incremental");

  useEffect(() => {
    const firstKb = kbs.data?.items?.[0];
    if (!firstKb) return;
    if (indexKbId) return;
    setIndexKbId(firstKb.id);
  }, [kbs.data, indexKbId]);

  const triggerIndex = useMutation({
    mutationFn: async () => {
      return apiFetch<{ job_id: string }>(`/admin/api/workspaces/${workspaceId}/jobs/index`, {
        method: "POST",
        body: JSON.stringify({ kb_id: indexKbId, mode: indexMode }),
      });
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ["jobs", workspaceId] });
      navigate(`/jobs/${data.job_id}`);
    },
  });

  // ======== Job 列表 ========
  const pageSize = 20;
  const page = Math.max(1, Number.parseInt(sp.get("page") || "1", 10) || 1);
  const typeFilter = (sp.get("type") || "").trim();
  const statusFilter = (sp.get("status") || "").trim();
  const kbFilter = (sp.get("kb_id") || "").trim();
  const appFilter = (sp.get("app_id") || "").trim();
  const sourceFilter = (sp.get("source_id") || "").trim();
  const qFilter = (sp.get("q") || "").trim();
  const createdFrom = (sp.get("created_from") || "").trim();
  const createdTo = (sp.get("created_to") || "").trim();

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
    typeFilter ? { key: "type", label: "type", value: typeFilter, onRemove: () => updateFilter([["type", null]]) } : null,
    statusFilter ? { key: "status", label: "status", value: statusFilter, onRemove: () => updateFilter([["status", null]]) } : null,
    kbFilter ? { key: "kb_id", label: "KB", value: kbFilter, onRemove: () => updateFilter([["kb_id", null]]) } : null,
    appFilter ? { key: "app_id", label: "app", value: appFilter, onRemove: () => updateFilter([["app_id", null]]) } : null,
    sourceFilter ? { key: "source_id", label: "source", value: sourceFilter, onRemove: () => updateFilter([["source_id", null]]) } : null,
    qFilter ? { key: "q", label: "q", value: qFilter, onRemove: () => updateFilter([["q", null]]) } : null,
    createdFrom ? { key: "created_from", label: "from", value: createdFrom, onRemove: () => updateFilter([["created_from", null]]) } : null,
    createdTo ? { key: "created_to", label: "to", value: createdTo, onRemove: () => updateFilter([["created_to", null]]) } : null,
  ].filter(Boolean) as FilterChip[];

  useEffect(() => {
    if (!kbFilter) return;
    setCrawlKbId(kbFilter);
    setIndexKbId(kbFilter);
  }, [kbFilter]);

  const jobsQuery = useQuery({
    queryKey: ["jobs", workspaceId, page, pageSize, typeFilter, statusFilter, kbFilter, appFilter, sourceFilter, qFilter, createdFrom, createdTo],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      if (typeFilter) params.set("type", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (kbFilter) params.set("kb_id", kbFilter);
      if (appFilter) params.set("app_id", appFilter);
      if (sourceFilter) params.set("source_id", sourceFilter);
      if (qFilter) params.set("q", qFilter);
      if (createdFrom) params.set("created_from", createdFrom);
      if (createdTo) params.set("created_to", createdTo);
      return apiFetch<JobsResp>(`/admin/api/workspaces/${workspaceId}/jobs?${params.toString()}`);
    },
    enabled: !!workspaceId,
  });

  const requeue = useMutation({
    mutationFn: async (jobId: string) => {
      return apiFetch<{ ok: boolean }>(`/admin/api/workspaces/${workspaceId}/jobs/${jobId}/requeue`, { method: "POST" });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["jobs", workspaceId] });
    },
  });

  const cancel = useMutation({
    mutationFn: async (jobId: string) => {
      return apiFetch<{ ok: boolean }>(`/admin/api/workspaces/${workspaceId}/jobs/${jobId}/cancel`, { method: "POST" });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["jobs", workspaceId] });
    },
  });

  const actionError = triggerCrawl.error || triggerIndex.error || requeue.error || cancel.error;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-gradient-to-br from-card/90 via-card/70 to-background p-6 shadow-lg shadow-black/30">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-primary">Task Center</div>
            <div className="text-2xl font-semibold text-foreground">任务中心</div>
            <div className="text-sm text-muted-foreground">分组查看抓取/索引/文件处理任务，带进度与日志。</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setTab("actions")}>
              触发新任务
            </Button>
            <Button variant="outline" onClick={() => jobsQuery.refetch()}>
              刷新列表
            </Button>
          </div>
        </div>
      </div>

      {actionError ? <ApiErrorBanner error={actionError} /> : null}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="w-full justify-start gap-2 overflow-x-auto rounded-xl border border-border/70 bg-card/80 p-2">
          <TabsTrigger value="list">任务列表</TabsTrigger>
          <TabsTrigger value="actions">触发任务</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card title="任务列表" description="支持按 type/status/知识库过滤；点击 ID 查看详情">
        <div className="grid grid-cols-1 gap-3 pb-3 md:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">type</div>
            <Select
              value={typeFilter}
              onChange={(e) => {
                updateFilter([["type", e.target.value]]);
              }}
            >
              <option value="">全部</option>
              <option value="crawl">crawl</option>
              <option value="index">index</option>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">status</div>
            <Select
              value={statusFilter}
              onChange={(e) => {
                updateFilter([["status", e.target.value]]);
              }}
            >
              <option value="">全部</option>
              <option value="queued">queued</option>
              <option value="running">running</option>
              <option value="succeeded">succeeded</option>
              <option value="failed">failed</option>
              <option value="cancelled">cancelled</option>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">KB</div>
            <Select
              value={kbFilter}
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
            <div className="text-xs text-muted-foreground">app_id</div>
            <Input
              value={appFilter}
              onChange={(e) => {
                updateFilter([["app_id", e.target.value]]);
              }}
              placeholder="例如 app_default"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">source_id</div>
            <Input
              value={sourceFilter}
              onChange={(e) => {
                updateFilter([["source_id", e.target.value]]);
              }}
              placeholder="例如 src_xxx"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">q（ID/错误模糊匹配）</div>
            <Input
              value={qFilter}
              onChange={(e) => {
                updateFilter([["q", e.target.value]]);
              }}
              placeholder="例如 failed / crawl_"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 pb-3 md:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">created_from</div>
            <Input
              type="date"
              value={createdFrom}
              onChange={(e) => {
                updateFilter([["created_from", e.target.value]]);
              }}
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">created_to</div>
            <Input
              type="date"
              value={createdTo}
              onChange={(e) => {
                updateFilter([["created_to", e.target.value]]);
              }}
            />
          </div>
          <div className="flex items-end gap-2 lg:col-span-4">
            <Button variant="outline" onClick={() => jobsQuery.refetch()}>
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
        <FilterChips items={chips} className="pb-3" />

        {jobsQuery.isLoading ? <div className="text-sm text-muted-foreground">加载中...</div> : null}
        {jobsQuery.error ? <ApiErrorBanner error={jobsQuery.error} /> : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">ID</TableHead>
              <TableHead className="w-[90px]">类型</TableHead>
              <TableHead className="w-[120px]">状态</TableHead>
              <TableHead className="w-[160px]">KB</TableHead>
              <TableHead className="w-[160px]">App</TableHead>
              <TableHead className="w-[180px]">Source</TableHead>
              <TableHead>进度 / 明细</TableHead>
              <TableHead className="w-[170px]">开始</TableHead>
              <TableHead className="w-[170px]">结束</TableHead>
              <TableHead className="w-[260px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(jobsQuery.data?.items || []).length ? (
              (jobsQuery.data?.items || []).map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-mono text-xs">
                    <Link className="underline underline-offset-2" to={`/jobs/${it.id}`}>
                      {it.id}
                    </Link>
                  </TableCell>
                  <TableCell>{it.type}</TableCell>
                  <TableCell>
                    <span className={it.status === "failed" ? "text-red-300" : it.status === "succeeded" ? "text-emerald-300" : ""}>
                      {it.status}
                    </span>
                    {it.error ? <span className="ml-2 text-xs text-destructive">有错误</span> : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{it.kb_id || "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{it.app_id || "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{it.source_id || "-"}</TableCell>
                  <TableCell>
                    <ProgressPill type={it.type} status={it.status} progress={it.progress} />
                    {it.subtasks?.length ? (
                      <div className="mt-2 rounded-md border bg-muted/40 p-2">
                        <div className="text-[11px] text-muted-foreground">文件/子任务</div>
                        <div className="mt-1 space-y-1">
                          {it.subtasks.slice(0, 3).map((s) => (
                            <div key={s.id} className="flex items-center justify-between gap-2 text-[11px] font-mono">
                              <span className="truncate">{s.filename || s.id}</span>
                              <span className={s.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{s.status}</span>
                            </div>
                          ))}
                          {it.subtasks.length > 3 ? <div className="text-[11px] text-muted-foreground">… 共 {it.subtasks.length} 项</div> : null}
                        </div>
                      </div>
                    ) : null}
                    {it.logs?.length ? (
                      <div className="mt-2 rounded-md border bg-muted/30 p-2 text-[11px] font-mono text-muted-foreground">
                        {(it.logs || []).slice(0, 2).map((l, idx) => (
                          <div key={idx} className="truncate">
                            {JSON.stringify(l)}
                          </div>
                        ))}
                        {it.logs.length > 2 ? <div>…</div> : null}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{it.started_at || "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{it.finished_at || "-"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => navigate(`/jobs/${it.id}`)}>
                        详情
                      </Button>
                      <Button variant="outline" size="sm" disabled={requeue.isPending} onClick={() => requeue.mutate(it.id)}>
                        重新入队
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={cancel.isPending || it.status !== "queued"}
                        onClick={() => cancel.mutate(it.id)}
                      >
                        取消
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={10}>
                  <EmptyState
                    description="暂无任务记录；也可能是筛选条件过严。"
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
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <Pagination
          page={jobsQuery.data?.page || page}
          pageSize={jobsQuery.data?.page_size || pageSize}
          total={jobsQuery.data?.total || 0}
          onPageChange={(p) => {
            const next = new URLSearchParams(sp);
            next.set("page", String(p));
            setSp(next, { replace: true });
          }}
        />
          </Card>
        </TabsContent>

        <TabsContent value="actions">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card
              title="触发抓取（网站爬虫）"
              description="sitemap 优先，失败自动降级为 seed_urls；可用输入覆盖数据源配置"
              actions={
                <Button variant="outline" size="sm" onClick={() => navigate("/kbs")} title="去管理数据源">
                  管理知识库/数据源
                </Button>
              }
            >
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">知识库</div>
                    <Select value={crawlKbId} onChange={(e) => setCrawlKbId(e.target.value)}>
                      {(kbs.data?.items || []).map((kb) => (
                        <option key={kb.id} value={kb.id}>
                          {kb.name} ({kb.id})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">数据源</div>
                    <Select value={crawlSourceId} onChange={(e) => setCrawlSourceId(e.target.value)}>
                      {(sources.data?.items || []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.id})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">模式</div>
                    <Select value={crawlMode} onChange={(e) => setCrawlMode(e.target.value)}>
                      <option value="full">full</option>
                      <option value="incremental">incremental</option>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">max_pages（可选）</div>
                    <Input placeholder="例如 5000" value={maxPages} onChange={(e) => setMaxPages(e.target.value)} />
                    {maxPagesError ? <div className="text-xs text-destructive">{maxPagesError}</div> : null}
                    {maxPages.trim() ? null : configuredMaxPages != null ? (
                      <div className="text-xs text-muted-foreground">未填写时使用数据源 max_pages={configuredMaxPages}</div>
                    ) : (
                      <div className="text-xs text-muted-foreground">未填写时使用数据源默认 max_pages</div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">base_url（可选）</div>
                    <Input placeholder="例如 https://developer.onekey.so/" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
                    {baseUrlError ? <div className="text-xs text-destructive">{baseUrlError}</div> : null}
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">sitemap_url（可选）</div>
                    <Input placeholder="例如 https://.../sitemap.xml" value={sitemapUrl} onChange={(e) => setSitemapUrl(e.target.value)} />
                    {sitemapUrlError ? <div className="text-xs text-destructive">{sitemapUrlError}</div> : null}
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">seed_urls（可选，每行一个）</div>
                    <Textarea value={seedUrls} onChange={(e) => setSeedUrls(e.target.value)} placeholder="https://example.com/\nhttps://example.com/docs/" />
                    {seedUrlsError ? <div className="text-xs text-destructive">{seedUrlsError}</div> : null}
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">include_patterns / exclude_patterns（正则）</div>
                    <div className="grid grid-cols-1 gap-2">
                      <div className="space-y-1">
                        <Textarea value={includePatterns} onChange={(e) => setIncludePatterns(e.target.value)} placeholder="^https://example\\.com/.*$" />
                        {includePatternsError ? <div className="text-xs text-destructive">{includePatternsError}</div> : null}
                      </div>
                      <div className="space-y-1">
                        <Textarea value={excludePatterns} onChange={(e) => setExcludePatterns(e.target.value)} placeholder="^https://example\\.com/404.*$" />
                        {excludePatternsError ? <div className="text-xs text-destructive">{excludePatternsError}</div> : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <ConfirmDangerDialog
                    trigger={
                      <Button disabled={triggerCrawl.isPending || crawlFormInvalid}>{triggerCrawl.isPending ? "触发中..." : "触发抓取"}</Button>
                    }
                    title="确认触发抓取？"
                    description={
                      <>
                        <div className="space-y-1">
                          <div>
                            知识库=<span className="font-mono">{crawlKbId}</span> · 数据源=<span className="font-mono">{crawlSourceId}</span> · 模式=
                            <span className="font-mono">{crawlMode}</span>
                          </div>
                          <div className="text-xs">
                            max_pages=<span className="font-mono">{effectiveMaxPagesText}</span> · seed_urls=
                            <span className="font-mono">{(parseLines(seedUrls) || []).length}</span> · include=
                            <span className="font-mono">{(parseLines(includePatterns) || []).length}</span> · exclude=
                            <span className="font-mono">{(parseLines(excludePatterns) || []).length}</span>
                          </div>
                          <div className="text-xs">建议先小批量试跑，确认规则无误后再扩大抓取范围。</div>
                        </div>
                      </>
                    }
                    confirmLabel="继续触发"
                    confirmVariant="destructive"
                    confirmText="crawl"
                    confirmPlaceholder="输入 crawl 确认"
                    confirmDisabled={triggerCrawl.isPending || crawlFormInvalid}
                    onConfirm={() => triggerCrawl.mutateAsync()}
                  />
                </div>
              </div>
            </Card>

            <Card title="触发建索引（index）" description="对已抓取页面执行分段与向量写入">
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">知识库</div>
                    <Select value={indexKbId} onChange={(e) => setIndexKbId(e.target.value)}>
                      {(kbs.data?.items || []).map((kb) => (
                        <option key={kb.id} value={kb.id}>
                          {kb.name} ({kb.id})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">模式</div>
                    <Select value={indexMode} onChange={(e) => setIndexMode(e.target.value)}>
                      <option value="incremental">incremental</option>
                      <option value="full">full</option>
                    </Select>
                  </div>
                </div>

                <div>
                  <ConfirmDangerDialog
                    trigger={<Button disabled={triggerIndex.isPending || !indexKbId}>{triggerIndex.isPending ? "触发中..." : "触发建索引"}</Button>}
                    title="确认触发建索引？"
                    description={
                      <div className="space-y-1">
                        <div>
                          知识库=<span className="font-mono">{indexKbId}</span> · 模式=<span className="font-mono">{indexMode}</span>
                        </div>
                        <div className="text-xs">
                          incremental：增量写入；full：全量重建，耗时更长。建索引会产生 embedding 成本，建议抓取完成后再执行。
                        </div>
                      </div>
                    }
                    confirmLabel="继续触发"
                    confirmVariant="destructive"
                    confirmText="index"
                    confirmPlaceholder="输入 index 确认"
                    confirmDisabled={triggerIndex.isPending || !indexKbId}
                    onConfirm={() => triggerIndex.mutateAsync()}
                  />
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
