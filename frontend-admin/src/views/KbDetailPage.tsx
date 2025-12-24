import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { ConfirmDangerDialog } from "../components/ConfirmDangerDialog";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Textarea } from "../components/ui/textarea";
import { Card } from "../components/Card";
import { JsonView } from "../components/JsonView";
import { ApiErrorBanner } from "../components/ApiErrorBanner";
import { apiFetch } from "../lib/api";
import { useWorkspace } from "../lib/workspace";
import { Progress } from "../components/ui/progress";

type KbDetail = {
  id: string;
  name: string;
  description: string;
  status: string;
  config: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

type KbStats = {
  kb_id: string;
  pages: { total: number; last_crawled_at: string | null };
  chunks: { total: number; with_embedding: number; embedding_coverage: number };
};

type SourcesResp = {
  items: Array<{
    id: string;
    type: string;
    name: string;
    status: string;
    config: Record<string, unknown>;
    created_at: string | null;
    updated_at: string | null;
  }>;
};
type ReferencedByResp = { total: number; items: Array<{ app_id: string; name: string; public_model_id: string }> };
type FileBatchListResp = {
  items: Array<{
    id: string;
    status: string;
    error: string;
    total: number;
    done: number;
    failed: number;
    created_at: string | null;
    updated_at: string | null;
  }>;
};
type FileBatchDetailResp = {
  id: string;
  status: string;
  error: string;
  kb_id: string;
  items: Array<{
    id: string;
    filename: string;
    size_bytes: number;
    status: string;
    error: string;
    page_id?: number;
    chunk_count?: number | null;
    chunk_preview?: string | null;
  }>;
};

function safeJsonParse(text: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const raw = (text || "").trim();
  if (!raw) return { ok: true, value: {} };
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object" && !Array.isArray(v)) return { ok: true, value: v as Record<string, unknown> };
    return { ok: false, error: "必须是 JSON 对象（object）" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function KbDetailPage() {
  const { workspaceId } = useWorkspace();
  const params = useParams();
  const kbId = params.kbId || "";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const kb = useQuery({
    queryKey: ["kb", workspaceId, kbId],
    queryFn: () => apiFetch<KbDetail>(`/admin/api/workspaces/${workspaceId}/kbs/${kbId}`),
    enabled: !!workspaceId && !!kbId,
  });

  const stats = useQuery({
    queryKey: ["kb-stats", workspaceId, kbId],
    queryFn: () => apiFetch<KbStats>(`/admin/api/workspaces/${workspaceId}/kbs/${kbId}/stats`),
    enabled: !!workspaceId && !!kbId,
  });

  const sources = useQuery({
    queryKey: ["sources", workspaceId, kbId],
    queryFn: () => apiFetch<SourcesResp>(`/admin/api/workspaces/${workspaceId}/kbs/${kbId}/sources`),
    enabled: !!workspaceId && !!kbId,
  });

  const referencedBy = useQuery({
    queryKey: ["kb-referenced-by", workspaceId, kbId],
    queryFn: () => apiFetch<ReferencedByResp>(`/admin/api/workspaces/${workspaceId}/kbs/${kbId}/referenced-by`),
    enabled: !!workspaceId && !!kbId,
  });

  const fileBatches = useQuery({
    queryKey: ["file-batches", workspaceId, kbId],
    queryFn: () => apiFetch<FileBatchListResp>(`/admin/api/workspaces/${workspaceId}/kbs/${kbId}/files`),
    enabled: !!workspaceId && !!kbId,
  });

  const [expandedBatchId, setExpandedBatchId] = useState<string>("");
  const batchDetail = useQuery({
    queryKey: ["file-batch-detail", workspaceId, kbId, expandedBatchId],
    queryFn: () => apiFetch<FileBatchDetailResp>(`/admin/api/workspaces/${workspaceId}/kbs/${kbId}/files/${expandedBatchId}`),
    enabled: !!workspaceId && !!kbId && !!expandedBatchId,
  });

  // ======== KB 编辑 ========
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [configText, setConfigText] = useState("{}");
  const [configError, setConfigError] = useState("");

  useEffect(() => {
    if (!kb.data) return;
    if (draftLoaded) return;
    setDraftLoaded(true);
    setName(kb.data.name || "");
    setDescription(kb.data.description || "");
    setStatus(kb.data.status || "active");
    setConfigText(JSON.stringify(kb.data.config || {}, null, 2));
  }, [kb.data, draftLoaded]);

  const saveKb = useMutation({
    mutationFn: async () => {
      const parsed = safeJsonParse(configText);
      if (!parsed.ok) {
        setConfigError(parsed.error);
        throw new Error(parsed.error);
      }
      setConfigError("");
      return apiFetch<{ ok: boolean }>(`/admin/api/workspaces/${workspaceId}/kbs/${kbId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim() || undefined,
          description: description || undefined,
          status: status || undefined,
          config: parsed.value,
        }),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["kb", workspaceId, kbId] });
      await qc.invalidateQueries({ queryKey: ["kbs", workspaceId] });
      toast.success("已保存知识库");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  const deleteKb = useMutation({
    mutationFn: async () => {
      return apiFetch<{ ok: boolean }>(`/admin/api/workspaces/${workspaceId}/kbs/${kbId}`, { method: "DELETE" });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["kbs", workspaceId] });
      toast.success("已删除知识库");
      navigate("/kbs", { replace: true });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  const refreshBatches = () => {
    void fileBatches.refetch();
    if (expandedBatchId) void batchDetail.refetch();
  };

  // ======== Source 创建 ========
  const [newSourceType, setNewSourceType] = useState("crawler_site");
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceStatus, setNewSourceStatus] = useState("active");
  const [newSourceConfigText, setNewSourceConfigText] = useState(
    JSON.stringify(
      {
        base_url: "",
        sitemap_url: "",
        seed_urls: [],
        include_patterns: [],
        exclude_patterns: [],
        max_pages: 2000,
      },
      null,
      2
    )
  );
  const [newSourceConfigError, setNewSourceConfigError] = useState("");

  const createSource = useMutation({
    mutationFn: async () => {
      const parsed = safeJsonParse(newSourceConfigText);
      if (!parsed.ok) {
        setNewSourceConfigError(parsed.error);
        throw new Error(parsed.error);
      }
      setNewSourceConfigError("");
      return apiFetch<{ id: string }>(`/admin/api/workspaces/${workspaceId}/kbs/${kbId}/sources`, {
        method: "POST",
        body: JSON.stringify({
          type: newSourceType,
          name: newSourceName.trim(),
          status: newSourceStatus,
          config: parsed.value,
        }),
      });
    },
    onSuccess: async () => {
      setNewSourceName("");
      await qc.invalidateQueries({ queryKey: ["sources", workspaceId, kbId] });
      toast.success("已创建数据源");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "创建失败"),
  });

  // ======== Source 编辑 ========
  const [editingId, setEditingId] = useState<string>("");
  const [editName, setEditName] = useState<string>("");
  const [editStatus, setEditStatus] = useState<string>("active");
  const [editConfigText, setEditConfigText] = useState<string>("{}");
  const [editConfigError, setEditConfigError] = useState<string>("");

  useEffect(() => {
    if (!editingId) return;
    const row = (sources.data?.items || []).find((x) => x.id === editingId);
    if (!row) return;
    setEditName(row.name || "");
    setEditStatus(row.status || "active");
    setEditConfigText(JSON.stringify(row.config || {}, null, 2));
    setEditConfigError("");
  }, [editingId, sources.data]);

  const updateSource = useMutation({
    mutationFn: async () => {
      const parsed = safeJsonParse(editConfigText);
      if (!parsed.ok) {
        setEditConfigError(parsed.error);
        throw new Error(parsed.error);
      }
      setEditConfigError("");
      return apiFetch<{ ok: boolean }>(`/admin/api/workspaces/${workspaceId}/kbs/${kbId}/sources/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editName.trim() || undefined, status: editStatus, config: parsed.value }),
      });
    },
    onSuccess: async () => {
      setEditingId("");
      await qc.invalidateQueries({ queryKey: ["sources", workspaceId, kbId] });
      toast.success("已保存数据源");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  const deleteSource = useMutation({
    mutationFn: async (sourceId: string) => {
      return apiFetch<{ ok: boolean }>(`/admin/api/workspaces/${workspaceId}/kbs/${kbId}/sources/${sourceId}`, { method: "DELETE" });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["sources", workspaceId, kbId] });
      toast.success("已删除数据源");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  const actionError = saveKb.error || deleteKb.error || createSource.error || updateSource.error || deleteSource.error;
  const [tab, setTab] = useState("overview");
  const coveragePercent = Math.round((stats.data?.chunks.embedding_coverage || 0) * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-gradient-to-br from-card/90 via-card/60 to-background p-6 shadow-lg shadow-black/30">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-primary">Knowledge Detail</div>
            <div className="text-2xl font-semibold text-foreground">{kb.data?.name || "知识库详情"}</div>
            <div className="font-mono text-[11px] text-muted-foreground">{kbId}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate(`/pages?kb_id=${encodeURIComponent(kbId)}`)}>
              页面/片段
            </Button>
            <Button variant="outline" onClick={() => navigate(`/jobs?kb_id=${encodeURIComponent(kbId)}`)}>
              任务中心
            </Button>
            <Button variant="outline" asChild>
              <Link to="/kbs">返回列表</Link>
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>状态：{kb.data?.status || "-"}</span>
          <span>创建：{kb.data?.created_at || "-"}</span>
          <span>更新：{kb.data?.updated_at || "-"}</span>
        </div>
      </div>

      {actionError ? <ApiErrorBanner error={actionError} /> : null}
      {kb.isLoading ? <div className="text-sm text-muted-foreground">加载中...</div> : null}
      {kb.error ? <ApiErrorBanner error={kb.error} /> : null}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="w-full justify-start gap-2 overflow-x-auto rounded-xl border border-border/70 bg-card/80 p-2">
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="sources">数据源</TabsTrigger>
          <TabsTrigger value="files">文件批次</TabsTrigger>
          <TabsTrigger value="config">配置</TabsTrigger>
          <TabsTrigger value="debug">调试</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="运行概览" description="覆盖率、最近抓取/索引">
              {stats.isLoading ? <div className="text-sm text-muted-foreground">加载中...</div> : null}
              {stats.error ? <ApiErrorBanner error={stats.error} /> : null}
              {stats.data ? (
                <div className="space-y-3">
                  <div className="space-y-2 rounded-xl border border-border/70 bg-background/50 p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Embedding 覆盖率</span>
                      <span className="font-mono text-foreground">{coveragePercent}%</span>
                    </div>
                    <Progress value={coveragePercent} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">页面</div>
                      <div className="font-mono">{stats.data.pages.total}</div>
                      <div className="text-[11px] text-muted-foreground">最近抓取 {stats.data.pages.last_crawled_at || "-"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">片段</div>
                      <div className="font-mono">{stats.data.chunks.total}</div>
                      <div className="text-[11px] text-muted-foreground">with_embedding {stats.data.chunks.with_embedding}</div>
                    </div>
                  </div>
                </div>
              ) : null}
            </Card>
            <Card title="采集链路" description="数据源 → 抓取 → 索引 → 覆盖率">
              <div className="space-y-3 text-sm">
                <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                  <div className="text-xs text-muted-foreground">数据源</div>
                  <div className="font-semibold text-foreground">{sources.data?.items.length || 0} 个</div>
                  <div className="text-[11px] text-muted-foreground">确保至少 1 个可用数据源</div>
                </div>
                <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                  <div className="text-xs text-muted-foreground">最近任务</div>
                  <div className="text-[11px] text-muted-foreground">
                    在任务中心查看抓取/索引进度，失败请重试或检查配置
                  </div>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => navigate(`/jobs?kb_id=${encodeURIComponent(kbId)}`)}>
                    查看任务
                  </Button>
                </div>
              </div>
            </Card>
            <Card title="引用与提醒" description="被应用引用 / 风险提示">
              {referencedBy.isLoading ? <div className="text-sm text-muted-foreground">加载中...</div> : null}
              {referencedBy.error ? <ApiErrorBanner error={referencedBy.error} /> : null}
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/40 p-3">
                  <div>
                    <div className="text-xs text-muted-foreground">引用应用</div>
                    <div className="text-lg font-semibold text-foreground">{referencedBy.data?.total || 0}</div>
                  </div>
                  <Badge variant={(referencedBy.data?.total || 0) > 0 ? "default" : "secondary"}>
                    {(referencedBy.data?.total || 0) > 0 ? "已引用" : "未引用"}
                  </Badge>
                </div>
                {(referencedBy.data?.items || []).slice(0, 4).map((a) => (
                  <div key={a.app_id} className="rounded-md border border-border/60 bg-background/40 p-2 text-xs">
                    <div className="font-semibold text-foreground">{a.name || a.app_id}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{a.public_model_id || "-"}</div>
                  </div>
                ))}
                {(referencedBy.data?.total || 0) > 4 ? (
                  <div className="text-[11px] text-muted-foreground">其余 {referencedBy.data!.total - 4} 个省略</div>
                ) : null}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sources" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="数据源列表" description="网站爬虫（原 crawler_site）等连接器">
              {sources.isLoading ? <div className="text-sm text-muted-foreground">加载中...</div> : null}
              {sources.error ? <ApiErrorBanner error={sources.error} /> : null}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">ID</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead className="w-[120px]">类型</TableHead>
                    <TableHead className="w-[120px]">状态</TableHead>
                    <TableHead className="w-[160px]">更新时间</TableHead>
                    <TableHead className="w-[200px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(sources.data?.items || []).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.id}</TableCell>
                      <TableCell>{s.name}</TableCell>
                      <TableCell className="font-mono text-xs">{s.type}</TableCell>
                      <TableCell>{s.status}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{s.updated_at || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => setEditingId(s.id)}>
                            编辑
                          </Button>
                          <ConfirmDangerDialog
                            trigger={
                              <Button variant="outline" size="sm" disabled={deleteSource.isPending}>
                                删除
                              </Button>
                            }
                            title="确认删除数据源？"
                            description={
                              <>
                                将删除 source_id=<span className="font-mono">{s.id}</span>（不影响已抓取的页面/片段）。
                              </>
                            }
                            confirmLabel="继续删除"
                            confirmVariant="destructive"
                            confirmText={s.id}
                            confirmPlaceholder="输入 source_id 确认"
                            confirmDisabled={deleteSource.isPending}
                            onConfirm={() => deleteSource.mutateAsync(s.id)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!sources.data?.items?.length ? (
                    <TableRow>
                      <TableCell className="text-sm text-muted-foreground" colSpan={6}>
                        暂无数据源
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </Card>

            <Card title="新建/编辑数据源" description="表单分组 + JSON 预览（网站爬虫已更名）">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">类型</div>
                    <Select value={newSourceType} onChange={(e) => setNewSourceType(e.target.value)}>
                      <option value="crawler_site">网站爬虫</option>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">状态</div>
                    <Select value={newSourceStatus} onChange={(e) => setNewSourceStatus(e.target.value)}>
                      <option value="active">active</option>
                      <option value="disabled">disabled</option>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <div className="text-xs text-muted-foreground">名称</div>
                    <Input
                      value={newSourceName}
                      onChange={(e) => setNewSourceName(e.target.value)}
                      placeholder="例如 OneKey Docs 爬虫"
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <div className="text-xs text-muted-foreground">配置（JSON）</div>
                    <Textarea
                      value={newSourceConfigText}
                      onChange={(e) => setNewSourceConfigText(e.target.value)}
                      className="min-h-[160px] font-mono text-xs"
                    />
                    {newSourceConfigError ? <div className="text-xs text-destructive">{newSourceConfigError}</div> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button disabled={!newSourceName.trim() || createSource.isPending} onClick={() => createSource.mutate()}>
                    {createSource.isPending ? "创建中..." : "创建"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditingId("")}>
                    重置编辑
                  </Button>
                </div>
                {editingId ? (
                  <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                    <div className="text-sm font-semibold">
                      编辑中的数据源：<span className="font-mono text-xs">{editingId}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">名称</div>
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">状态</div>
                        <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                          <option value="active">active</option>
                          <option value="disabled">disabled</option>
                        </Select>
                      </div>
                    </div>
                    <div className="mt-2 space-y-1">
                      <div className="text-xs text-muted-foreground">配置（JSON）</div>
                      <Textarea
                        value={editConfigText}
                        onChange={(e) => setEditConfigText(e.target.value)}
                        className="min-h-[180px] font-mono text-xs"
                      />
                      {editConfigError ? <div className="text-xs text-destructive">{editConfigError}</div> : null}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Button disabled={updateSource.isPending} onClick={() => updateSource.mutate()}>
                        {updateSource.isPending ? "保存中..." : "保存"}
                      </Button>
                      <Button variant="outline" onClick={() => setEditingId("")}>
                        取消编辑
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">从左侧列表选择数据源后可编辑</div>
                )}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="files" className="space-y-4">
          <Card
            title="文件批次"
            description="文件导入 → 解析 → 分段 → 索引。支持查看批次进度与失败文件。"
            actions={
              <Button variant="outline" size="sm" onClick={refreshBatches} disabled={fileBatches.isFetching}>
                {fileBatches.isFetching ? "刷新中..." : "刷新批次"}
              </Button>
            }
          >
            {fileBatches.error ? <ApiErrorBanner error={fileBatches.error} /> : null}
            <Table className="mt-2">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">批次 ID</TableHead>
                  <TableHead className="w-[120px]">状态</TableHead>
                  <TableHead className="w-[160px]">进度</TableHead>
                  <TableHead className="w-[140px]">失败</TableHead>
                  <TableHead className="w-[200px]">时间</TableHead>
                  <TableHead className="w-[120px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(fileBatches.data?.items || []).map((b) => {
                  const percent = b.total ? Math.round(((b.done || 0) / Math.max(1, b.total)) * 100) : 0;
                  const isExpanded = expandedBatchId === b.id;
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs">{b.id}</TableCell>
                      <TableCell>{b.status}</TableCell>
                      <TableCell className="text-xs">
                        <div className="font-mono text-[11px]">
                          {b.done}/{b.total} ({percent}%)
                        </div>
                        <Progress value={percent} className="mt-1" />
                      </TableCell>
                      <TableCell className="text-xs text-destructive">
                        {b.failed ? `${b.failed} 个失败` : "0"}
                        {b.error ? <div className="mt-1 text-[11px] text-destructive/80">{b.error}</div> : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div>{b.created_at || "-"}</div>
                        <div>{b.updated_at || "-"}</div>
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => setExpandedBatchId(isExpanded ? "" : b.id)}>
                          {isExpanded ? "收起" : "查看文件"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!fileBatches.data?.items?.length ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <div className="text-sm text-muted-foreground">暂无文件批次</div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>

            {expandedBatchId ? (
              <div className="mt-3 rounded-md border border-border/70 bg-background/60 p-3">
                <div className="text-sm font-semibold">
                  批次详情 <span className="font-mono text-xs">{expandedBatchId}</span>
                </div>
                {batchDetail.isLoading ? <div className="text-xs text-muted-foreground">加载中...</div> : null}
                {batchDetail.error ? <ApiErrorBanner error={batchDetail.error} /> : null}
                {batchDetail.data?.items?.length ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {batchDetail.data.items.map((it) => (
                      <div key={it.id} className="rounded-md border border-border/60 bg-card/70 p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono">{it.filename}</span>
                          <span className={it.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{it.status}</span>
                        </div>
                        <div className="text-muted-foreground">size={Math.round((it.size_bytes || 0) / 1024)} KB</div>
                        {it.chunk_count != null ? <div className="text-muted-foreground">chunks={it.chunk_count}</div> : null}
                        {it.error ? <div className="text-destructive">{it.error}</div> : null}
                        {it.chunk_preview ? (
                          <div className="mt-1 rounded bg-background/80 p-2 font-mono text-[11px] text-muted-foreground">
                            {it.chunk_preview.length > 260 ? `${it.chunk_preview.slice(0, 260)}...` : it.chunk_preview}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-muted-foreground">无文件信息</div>
                )}
                <div className="mt-3 text-[11px] text-muted-foreground">Chunk 预览来自首段文本，便于快速验证解析效果。</div>
              </div>
            ) : null}
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <Card
            title="知识库配置"
            description="表单化配置，JSON 仅用于高级字段；删除不会自动清理历史页面/片段。"
            actions={
              <ConfirmDangerDialog
                trigger={
                  <Button variant="outline" size="sm" disabled={deleteKb.isPending}>
                    删除知识库
                  </Button>
                }
                title="确认删除知识库？"
                description={
                  <>
                    <div>
                      将删除 KB=<span className="font-mono">{kbId}</span> 的记录与数据源/绑定关系（不会自动清理 pages/chunks）。
                    </div>
                    {referencedBy.isLoading ? (
                      <div className="mt-2 text-xs">引用信息加载中...</div>
                    ) : referencedBy.error ? (
                      <div className="mt-2 text-xs">引用信息加载失败，请稍后重试。</div>
                    ) : referencedBy.data?.total ? (
                      <div className="mt-2">
                        <div>
                          当前被 <span className="font-mono">{referencedBy.data.total}</span> 个应用引用：
                        </div>
                        <ul className="mt-1 list-inside list-disc">
                          {(referencedBy.data.items || []).slice(0, 8).map((a) => (
                            <li key={a.app_id}>
                              <span className="font-medium">{a.name || a.app_id}</span>{" "}
                              <span className="font-mono">({a.public_model_id || "-"})</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="mt-2 text-xs">当前未被应用引用。</div>
                    )}
                  </>
                }
                confirmLabel="继续删除"
                confirmVariant="destructive"
                confirmText={kbId}
                confirmPlaceholder="输入 kb_id 确认"
                confirmDisabled={deleteKb.isPending}
                onConfirm={() => deleteKb.mutateAsync()}
              />
            }
          >
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">名称</div>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">状态</div>
                  <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="active">active</option>
                    <option value="disabled">disabled</option>
                  </Select>
                </div>
                <div className="space-y-1 lg:col-span-2">
                  <div className="text-xs text-muted-foreground">描述</div>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[80px]" />
                </div>
                <div className="space-y-1 lg:col-span-2">
                  <div className="text-xs text-muted-foreground">配置（JSON，高级模式）</div>
                  <Textarea
                    value={configText}
                    onChange={(e) => setConfigText(e.target.value)}
                    className="min-h-[140px] font-mono text-xs"
                  />
                  {configError ? <div className="text-xs text-destructive">{configError}</div> : null}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button disabled={saveKb.isPending} onClick={() => saveKb.mutate()}>
                  {saveKb.isPending ? "保存中..." : "保存"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraftLoaded(false);
                    setConfigError("");
                  }}
                >
                  重置为服务端
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="debug">
          <Card title="调试（只读）" description="服务端返回原始 JSON，便于排查">
            <JsonView value={{ kb: kb.data, stats: stats.data, sources: sources.data }} defaultCollapsed />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
