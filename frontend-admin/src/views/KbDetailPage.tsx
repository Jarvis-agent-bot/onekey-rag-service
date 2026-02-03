import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Database, Eye, Play, Plus, RefreshCw, RotateCcw, Settings2, Upload } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";


import { ApiErrorBanner } from "../components/ApiErrorBanner";
import { Card } from "../components/Card";
import { ConfirmDangerDialog } from "../components/ConfirmDangerDialog";
import { CopyableText } from "../components/CopyableText";
import { EmptyState } from "../components/EmptyState";
import { Loading } from "../components/Loading";
import { Pagination } from "../components/Pagination";
import { ProgressPill } from "../components/ProgressPill";
import { SourceConfigForm, getDefaultSourceConfig, parseSourceConfig, sourceConfigToJson, type SourceConfig } from "../components/SourceConfigForm";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Progress } from "../components/ui/progress";
import { Select } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Textarea } from "../components/ui/textarea";
import { getContractStats } from "../api/contracts";
import { apiFetch } from "../lib/api";
import { useWorkspace } from "../lib/workspace";

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

type SourceItem = {
  id: string;
  type: string;
  name: string;
  status: string;
  config: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

type SourcesResp = { items: SourceItem[] };
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

export function KbDetailPage() {
  const { workspaceId } = useWorkspace();
  const params = useParams();
  const kbId = params.kbId || "";
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ======== 数据查询 ========
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

  // 获取最近任务（用于数据源列表显示状态）
  const recentJobs = useQuery({
    queryKey: ["kb-recent-jobs", workspaceId, kbId],
    queryFn: () => apiFetch<JobsResp>(`/admin/api/workspaces/${workspaceId}/jobs?kb_id=${kbId}&page_size=20`),
    enabled: !!workspaceId && !!kbId,
    refetchInterval: 5000, // 每 5 秒刷新一次，跟踪进行中的任务
  });

  // 获取合约索引统计
  const contractStats = useQuery({
    queryKey: ["contract-stats"],
    queryFn: getContractStats,
  });

  // 构建 source_id -> 最新任务 的映射
  const latestJobBySource = useMemo(() => {
    const map = new Map<string, JobsResp["items"][0]>();
    if (!recentJobs.data?.items) return map;
    for (const job of recentJobs.data.items) {
      if (job.source_id && !map.has(job.source_id)) {
        map.set(job.source_id, job);
      }
    }
    return map;
  }, [recentJobs.data]);

  const [expandedBatchId, setExpandedBatchId] = useState<string>("");
  const batchDetail = useQuery({
    queryKey: ["file-batch-detail", workspaceId, kbId, expandedBatchId],
    queryFn: () => apiFetch<FileBatchDetailResp>(`/admin/api/workspaces/${workspaceId}/kbs/${kbId}/files/${expandedBatchId}`),
    enabled: !!workspaceId && !!kbId && !!expandedBatchId,
  });

  // ======== Tab 状态（支持 URL ?tab= 参数） ========
  const [searchParams, setSearchParams] = useSearchParams();
  const validTabs = ["overview", "sources", "pages", "jobs"];
  const initialTab = validTabs.includes(searchParams.get("tab") || "") ? searchParams.get("tab")! : "overview";
  const [tab, setTab] = useState(initialTab);

  // 同步 tab 到 URL（尽量保留其它 query，便于深链/分享）
  const handleTabChange = (newTab: string) => {
    setTab(newTab);

    const next = new URLSearchParams(searchParams);
    if (newTab !== "overview") {
      next.set("tab", newTab);
    } else {
      next.delete("tab");
    }

    // source_id 只在 pages/jobs Tab 有意义；切走时自动清理，避免误导
    if (newTab !== "pages" && newTab !== "jobs") {
      next.delete("source_id");
    }

    setSearchParams(next, { replace: true });
  };

  /**
   * 从任意位置跳转到 KB 详情内的指定 Tab，并可选携带 source_id。
   * 目的：减少「数据源列表 → 内容/任务」的割裂感；同时把筛选写入 URL，便于刷新/分享。
   */
  const jumpToTab = (targetTab: "pages" | "jobs", sourceId?: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", targetTab);

    if (sourceId) next.set("source_id", sourceId);
    else next.delete("source_id");

    setSearchParams(next, { replace: true });
    setTab(targetTab);

    if (targetTab === "pages") {
      setPagesSourceId(sourceId || "");
      setPagesPage(1);
    }

    if (targetTab === "jobs") {
      setJobsSourceId(sourceId || "");
      setJobsPage(1);
    }
  };

  const coveragePercent = Math.round((stats.data?.chunks.embedding_coverage || 0) * 100);

  // ======== KB 编辑状态 ========
  const [showKbConfig, setShowKbConfig] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [kbName, setKbName] = useState("");
  const [kbDescription, setKbDescription] = useState("");
  const [kbStatus, setKbStatus] = useState("active");

  useEffect(() => {
    if (!kb.data || draftLoaded) return;
    setDraftLoaded(true);
    setKbName(kb.data.name || "");
    setKbDescription(kb.data.description || "");
    setKbStatus(kb.data.status || "active");
  }, [kb.data, draftLoaded]);

  const saveKb = useMutation({
    mutationFn: async () => {
      return apiFetch<{ ok: boolean }>(`/admin/api/workspaces/${workspaceId}/kbs/${kbId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: kbName.trim() || undefined,
          description: kbDescription || undefined,
          status: kbStatus || undefined,
        }),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["kb", workspaceId, kbId] });
      await qc.invalidateQueries({ queryKey: ["kbs", workspaceId] });
      toast.success("已保存知识库配置");
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

  // ======== 数据源状态 ========
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState<string>("");
  const [sourceName, setSourceName] = useState("");
  const [sourceStatus, setSourceStatus] = useState("active");
  const [sourceConfig, setSourceConfig] = useState<SourceConfig>(getDefaultSourceConfig());

  // 编辑时加载数据
  useEffect(() => {
    if (!editingSourceId) {
      setSourceName("");
      setSourceStatus("active");
      setSourceConfig(getDefaultSourceConfig());
      return;
    }
    const row = sources.data?.items.find((x) => x.id === editingSourceId);
    if (!row) return;
    setSourceName(row.name || "");
    setSourceStatus(row.status || "active");
    setSourceConfig(parseSourceConfig(row.config));
  }, [editingSourceId, sources.data]);

  const createSource = useMutation({
    mutationFn: async () => {
      if (!sourceConfig.base_url.trim()) {
        throw new Error("请填写网站地址");
      }
      return apiFetch<{ id: string }>(`/admin/api/workspaces/${workspaceId}/kbs/${kbId}/sources`, {
        method: "POST",
        body: JSON.stringify({
          type: "crawler_site",
          name: sourceName.trim(),
          status: sourceStatus,
          config: sourceConfigToJson(sourceConfig),
        }),
      });
    },
    onSuccess: async () => {
      setShowSourceForm(false);
      setSourceName("");
      setSourceConfig(getDefaultSourceConfig());
      await qc.invalidateQueries({ queryKey: ["sources", workspaceId, kbId] });
      toast.success("已创建数据源");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "创建失败"),
  });

  const updateSource = useMutation({
    mutationFn: async () => {
      if (!sourceConfig.base_url.trim()) {
        throw new Error("请填写网站地址");
      }
      return apiFetch<{ ok: boolean }>(`/admin/api/workspaces/${workspaceId}/kbs/${kbId}/sources/${editingSourceId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: sourceName.trim() || undefined,
          status: sourceStatus,
          config: sourceConfigToJson(sourceConfig),
        }),
      });
    },
    onSuccess: async () => {
      setEditingSourceId("");
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

  // ======== 内容 (Pages) Tab ========
  const [pagesPage, setPagesPage] = useState(1);
  const [pagesSourceId, setPagesSourceId] = useState("");
  const [pagesIndexed, setPagesIndexed] = useState("");
  const [pagesQ, setPagesQ] = useState("");
  const pagesPageSize = 10;

  const pagesQuery = useQuery({
    queryKey: ["kb-pages", workspaceId, kbId, pagesPage, pagesPageSize, pagesSourceId, pagesIndexed, pagesQ],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(pagesPage));
      params.set("page_size", String(pagesPageSize));
      params.set("kb_id", kbId);
      if (pagesSourceId) params.set("source_id", pagesSourceId);
      if (pagesIndexed === "true") params.set("indexed", "true");
      if (pagesIndexed === "false") params.set("indexed", "false");
      if (pagesQ) params.set("q", pagesQ);
      return apiFetch<PagesResp>(`/admin/api/workspaces/${workspaceId}/pages?${params.toString()}`);
    },
    enabled: !!workspaceId && !!kbId && tab === "pages",
  });

  const recrawlPage = useMutation({
    mutationFn: async (pageId: number) => {
      return apiFetch<{ job_id: string }>(`/admin/api/workspaces/${workspaceId}/pages/${pageId}/recrawl`, { method: "POST" });
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ["kb-pages", workspaceId, kbId] });
      toast.success("已触发 recrawl");
      navigate(`/jobs/${data.job_id}`, {
        state: { from: { kb_id: kbId, source_id: pagesSourceId || undefined } },
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "触发失败"),
  });

  // ======== 任务 (Jobs) Tab ========
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsType, setJobsType] = useState("");
  const [jobsStatus, setJobsStatus] = useState("");
  const [jobsSourceId, setJobsSourceId] = useState("");


  // URL -> 过滤器：支持从 Job/Pages 详情页深链回到指定 KB Tab（并自动筛选 source_id）
  useEffect(() => {
    const urlSourceId = searchParams.get("source_id") || "";

    if (tab === "pages") {
      if (urlSourceId && urlSourceId !== pagesSourceId) {
        setPagesSourceId(urlSourceId);
        setPagesPage(1);
      }
      // URL 没有 source_id 时，保持用户当前选择（避免来回跳动）
    }

    if (tab === "jobs") {
      if (urlSourceId && urlSourceId !== jobsSourceId) {
        setJobsSourceId(urlSourceId);
        setJobsPage(1);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, searchParams]);
  const [expandedJobId, setExpandedJobId] = useState<string>("");
  const jobsPageSize = 10;

  const jobsQuery = useQuery({
    queryKey: ["kb-jobs", workspaceId, kbId, jobsPage, jobsPageSize, jobsType, jobsStatus, jobsSourceId],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(jobsPage));
      params.set("page_size", String(jobsPageSize));
      params.set("kb_id", kbId);
      if (jobsType) params.set("type", jobsType);
      if (jobsStatus) params.set("status", jobsStatus);
      if (jobsSourceId) params.set("source_id", jobsSourceId);
      return apiFetch<JobsResp>(`/admin/api/workspaces/${workspaceId}/jobs?${params.toString()}`);
    },
    enabled: !!workspaceId && !!kbId && tab === "jobs",
  });

  const requeueJob = useMutation({
    mutationFn: async (jobId: string) => {
      return apiFetch<{ ok: boolean }>(`/admin/api/workspaces/${workspaceId}/jobs/${jobId}/requeue`, { method: "POST" });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["kb-jobs", workspaceId, kbId] });
      toast.success("已重新入队");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "操作失败"),
  });

  // ======== 一键同步（简化版：crawl + index） ========
  const [syncProgress, setSyncProgress] = useState<{ step: string; status: "idle" | "running" | "done" | "error" }>({ step: "", status: "idle" });

  const syncAll = useMutation({
    mutationFn: async () => {
      const sourceList = sources.data?.items.filter((s) => s.status === "active") || [];
      if (sourceList.length === 0) {
        throw new Error("没有可用的数据源");
      }

      // Step 1: 抓取所有数据源
      setSyncProgress({ step: `抓取 ${sourceList.length} 个数据源...`, status: "running" });
      for (const source of sourceList) {
        await apiFetch<{ job_id: string }>(`/admin/api/workspaces/${workspaceId}/jobs/crawl`, {
          method: "POST",
          body: JSON.stringify({ kb_id: kbId, source_id: source.id, mode: "full" }),
        });
      }

      // Step 2: 索引（会自动触发 contract_index）
      setSyncProgress({ step: "生成索引...", status: "running" });
      await apiFetch<{ job_id: string }>(`/admin/api/workspaces/${workspaceId}/jobs/index`, {
        method: "POST",
        body: JSON.stringify({ kb_id: kbId, mode: "full" }),
      });

      setSyncProgress({ step: "任务已提交", status: "done" });
      return { success: true };
    },
    onSuccess: async () => {
      toast.success("同步任务已启动", {
        description: "抓取和索引任务已提交，已为你切到『任务』Tab 便于观察进度",
      });
      // 发起动作后直接把用户带到“看结果”的地方，减少来回找入口的割裂感
      handleTabChange("jobs");
      await qc.invalidateQueries({ queryKey: ["kb-jobs", workspaceId, kbId] });
      await qc.invalidateQueries({ queryKey: ["kb-recent-jobs", workspaceId, kbId] });
      // 3秒后重置状态
      setTimeout(() => setSyncProgress({ step: "", status: "idle" }), 3000);
    },
    onError: (e) => {
      setSyncProgress({ step: "", status: "error" });
      toast.error(e instanceof Error ? e.message : "同步失败");
    },
  });

  // ======== 单个数据源同步（crawl + index） ========
  const syncSource = useMutation({
    mutationFn: async (sourceId: string) => {
      // 先 crawl
      await apiFetch<{ job_id: string }>(`/admin/api/workspaces/${workspaceId}/jobs/crawl`, {
        method: "POST",
        body: JSON.stringify({ kb_id: kbId, source_id: sourceId, mode: "full" }),
      });
      // 然后 index
      const indexResult = await apiFetch<{ job_id: string }>(`/admin/api/workspaces/${workspaceId}/jobs/index`, {
        method: "POST",
        body: JSON.stringify({ kb_id: kbId, mode: "full" }),
      });
      return indexResult;
    },
    onSuccess: async (_data, sourceId) => {
      toast.success("同步任务已启动", {
        description: "已为你切到『任务』Tab，并自动筛选该数据源",
      });
      // 同步单个数据源时，默认把用户切到 jobs 并带上 source_id，减少“同步了但不知道去哪看”的割裂
      jumpToTab("jobs", sourceId);
      await qc.invalidateQueries({ queryKey: ["kb-jobs", workspaceId, kbId] });
      await qc.invalidateQueries({ queryKey: ["kb-recent-jobs", workspaceId, kbId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "同步失败"),
  });

  const actionError = saveKb.error || deleteKb.error || createSource.error || updateSource.error || deleteSource.error;
  const hasNoSources = !sources.data?.items?.length;
  const hasNoContent = !stats.data?.pages.total;

  // ======== UI 小增强：Tab 标题带上关键数量，减少来回点进点出 ========
  const sourceCount = sources.data?.items?.length ?? 0;
  const pageCount = stats.data?.pages?.total ?? 0;
  const recentJobCount = recentJobs.data?.items?.length ?? 0;
  const runningJobCount = (recentJobs.data?.items || []).filter((j) => j.status === "running" || j.status === "queued").length;

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-gradient-to-br from-card/90 via-card/60 to-background p-6 shadow-lg shadow-black/30">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs tracking-wider text-primary">知识库详情</div>
            <div className="text-2xl font-semibold text-foreground">{kb.data?.name || "加载中..."}</div>
            <div className="font-mono text-[11px] text-muted-foreground">{kbId}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="default"
              onClick={() => syncAll.mutate()}
              disabled={syncAll.isPending || !sources.data?.items?.length}
              title="抓取所有数据源并生成索引"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncAll.isPending ? "animate-spin" : ""}`} />
              {syncAll.isPending ? syncProgress.step || "同步中..." : "同步"}
            </Button>

            <Button variant="outline" asChild>
              <Link to={`/kbs/${kbId}?tab=pages`}>内容</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/kbs/${kbId}?tab=jobs`}>任务</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/observability?kb_id=${encodeURIComponent(kbId)}`}>
                <Eye className="mr-2 h-4 w-4" />
                观测
              </Link>
            </Button>

            <Button variant="outline" asChild>
              <Link to="/kbs">返回列表</Link>
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Badge variant={kb.data?.status === "active" ? "default" : "secondary"}>{kb.data?.status || "-"}</Badge>
          <span>创建于 {kb.data?.created_at?.slice(0, 10) || "-"}</span>
        </div>
      </div>

      {actionError ? <ApiErrorBanner error={actionError} /> : null}
      {kb.isLoading ? <Loading /> : null}
      {kb.error ? <ApiErrorBanner error={kb.error} /> : null}

      {/* Tab 导航 - 精简为 4 个 */}
      <Tabs value={tab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="w-full justify-start gap-2 overflow-x-auto rounded-xl border border-border/70 bg-card/80 p-2">
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="sources">
            数据源
            <span className="ml-1 text-muted-foreground">({sourceCount})</span>
          </TabsTrigger>
          <TabsTrigger value="pages">
            内容
            <span className="ml-1 text-muted-foreground">({pageCount})</span>
          </TabsTrigger>
          <TabsTrigger value="jobs">
            任务
            <span className="ml-1 text-muted-foreground">({runningJobCount > 0 ? `${runningJobCount} 进行中` : recentJobCount})</span>
          </TabsTrigger>
        </TabsList>

        {/* ============ 概览 Tab ============ */}
        <TabsContent value="overview" className="space-y-6">
          {/* 引导区域 - 仅在无数据源或无内容时显示 */}
          {hasNoSources ? (
            <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-6">
              <div className="text-center">
                <Database className="mx-auto h-10 w-10 text-primary/60" />
                <div className="mt-3 text-lg font-medium">开始配置知识库</div>
                <div className="mt-1 text-sm text-muted-foreground">添加数据源后，点击「同步」即可抓取和索引内容</div>
                <Button className="mt-4" onClick={() => { handleTabChange("sources"); setShowSourceForm(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  添加数据源
                </Button>
              </div>
            </div>
          ) : hasNoContent ? (
            <div className="rounded-xl border-2 border-dashed border-amber-500/30 bg-amber-500/5 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-medium">数据源已就绪</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    已配置 {sources.data?.items.length || 0} 个数据源，点击同步开始抓取
                  </div>
                </div>
                <Button onClick={() => syncAll.mutate()} disabled={syncAll.isPending}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${syncAll.isPending ? "animate-spin" : ""}`} />
                  {syncAll.isPending ? "同步中..." : "立即同步"}
                </Button>
              </div>
            </div>
          ) : null}

          {/* 核心指标 - 顶部一行展示 */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-border/70 bg-card/50 p-4">
              <div className="text-3xl font-semibold">{stats.data?.pages.total || 0}</div>
              <div className="mt-1 text-sm text-muted-foreground">页面总数</div>
            </div>
            <div className="rounded-xl border border-border/70 bg-card/50 p-4">
              <div className="text-3xl font-semibold">{stats.data?.chunks.total || 0}</div>
              <div className="mt-1 text-sm text-muted-foreground">文档片段</div>
            </div>
            <div className="rounded-xl border border-border/70 bg-card/50 p-4">
              <div className="flex items-baseline gap-1">
                <div className="text-3xl font-semibold">{coveragePercent}</div>
                <div className="text-lg text-muted-foreground">%</div>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">向量覆盖率</div>
              <Progress value={coveragePercent} className="mt-2 h-1.5" />
            </div>
            <div className="rounded-xl border border-border/70 bg-card/50 p-4">
              <div className="text-3xl font-semibold">{sources.data?.items.length || 0}</div>
              <div className="mt-1 text-sm text-muted-foreground">数据源</div>
            </div>
          </div>

          {/* 合约索引统计 */}
          {contractStats.data && contractStats.data.total_contracts > 0 && (
            <div className="rounded-xl border border-border/70 bg-card/50">
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                <div className="font-medium">合约索引</div>
                <Badge variant="secondary">{contractStats.data.total_contracts} 个合约</Badge>
              </div>
              <div className="p-4">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(contractStats.data.by_protocol || {})
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
                    .map(([protocol, count]) => (
                      <Badge key={protocol} variant="outline" className="text-xs">
                        {protocol}: {count}
                      </Badge>
                    ))}
                  {Object.keys(contractStats.data.by_protocol || {}).length > 10 && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      +{Object.keys(contractStats.data.by_protocol).length - 10} 更多
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 引用的应用（从 KB 快速跳到 App 详情） */}
          {referencedBy.data?.total ? (
            <div className="rounded-xl border border-border/70 bg-card/50">
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                <div className="font-medium">被应用引用</div>
                <Badge variant="secondary">{referencedBy.data.total} 个</Badge>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {referencedBy.data.items.slice(0, 6).map((it) => (
                    <Link
                      key={it.app_id}
                      to={`/apps/${encodeURIComponent(it.app_id)}`}
                      className="rounded-lg border border-border/50 bg-background/30 p-3 text-sm hover:bg-muted/30"
                    >
                      <div className="font-medium text-foreground">{it.name || it.app_id}</div>
                      <div className="mt-1 font-mono text-[11px] text-muted-foreground">app_id: {it.app_id}</div>
                      {it.public_model_id ? (
                        <div className="font-mono text-[11px] text-muted-foreground">model_id: {it.public_model_id}</div>
                      ) : null}
                    </Link>
                  ))}
                </div>
                {referencedBy.data.total > 6 ? (
                  <div className="mt-3 text-xs text-muted-foreground">仅展示前 6 个引用应用。</div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* 最近任务状态 */}
          <div className="rounded-xl border border-border/70 bg-card/50">
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
              <div className="font-medium">最近任务</div>
              <Button variant="ghost" size="sm" onClick={() => handleTabChange("jobs")}>
                查看全部
              </Button>
            </div>
            <div className="divide-y divide-border/50">
              {recentJobs.data?.items.slice(0, 5).map((job) => {
                const progress = job.progress as { done?: number; total?: number } | undefined;
                const percent = progress?.total ? Math.round(((progress.done || 0) / progress.total) * 100) : 0;
                return (
                  <Link
                    key={job.id}
                    to={`/jobs/${job.id}`}
                    state={{ from: { kb_id: job.kb_id, source_id: job.source_id } }}
                    className="flex items-center justify-between px-4 py-3 hover:bg-muted/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ${
                        job.status === "running" ? "animate-pulse bg-blue-500" :
                        job.status === "queued" ? "bg-amber-500" :
                        job.status === "succeeded" ? "bg-emerald-500" :
                        job.status === "failed" ? "bg-red-500" : "bg-muted-foreground"
                      }`} />
                      <div>
                        <div className="text-sm font-medium">
                          {job.type === "crawl" ? "抓取" : job.type === "index" ? "索引" : job.type}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {job.started_at?.slice(0, 16) || "排队中"}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={
                        job.status === "failed" ? "destructive" :
                        job.status === "succeeded" ? "default" : "secondary"
                      }>
                        {job.status === "running" ? `${percent}%` :
                         job.status === "queued" ? "排队中" :
                         job.status === "succeeded" ? "成功" :
                         job.status === "failed" ? "失败" : job.status}
                      </Badge>
                    </div>
                  </Link>
                );
              })}
              {!recentJobs.data?.items?.length && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  暂无任务记录
                </div>
              )}
            </div>
          </div>

          {/* 知识库配置（可折叠） */}
          <div className="rounded-xl border border-border/70 bg-card/50">
            <button
              type="button"
              className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/30"
              onClick={() => setShowKbConfig(!showKbConfig)}
            >
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">知识库配置</span>
              </div>
              {showKbConfig ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {showKbConfig && (
              <div className="border-t border-border/50 p-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">名称</label>
                      <Input value={kbName} onChange={(e) => setKbName(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">状态</label>
                      <Select value={kbStatus} onChange={(e) => setKbStatus(e.target.value)}>
                        <option value="active">启用</option>
                        <option value="disabled">禁用</option>
                      </Select>
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-xs font-medium text-muted-foreground">描述</label>
                      <Textarea value={kbDescription} onChange={(e) => setKbDescription(e.target.value)} className="min-h-[80px]" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={() => saveKb.mutate()} disabled={saveKb.isPending}>
                      {saveKb.isPending ? "保存中..." : "保存配置"}
                    </Button>
                    <ConfirmDangerDialog
                      trigger={<Button variant="outline" disabled={deleteKb.isPending}>删除知识库</Button>}
                      title="确认删除知识库？"
                      description={
                        <>
                          <div>将删除 KB=<span className="font-mono">{kbId}</span> 的记录与数据源（不会清理已抓取的页面/片段）。</div>
                          {referencedBy.data?.total ? (
                            <div className="mt-2 text-amber-500">
                              警告：当前被 {referencedBy.data.total} 个应用引用！
                            </div>
                          ) : null}
                        </>
                      }
                      confirmLabel="继续删除"
                      confirmVariant="destructive"
                      confirmText={kbId}
                      confirmPlaceholder="输入 kb_id 确认"
                      confirmDisabled={deleteKb.isPending}
                      onConfirm={() => deleteKb.mutateAsync()}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ============ 数据源 Tab ============ */}
        <TabsContent value="sources" className="space-y-4">
          {/* 数据源列表 */}
          <Card
            title="数据源列表"
            description="管理网站爬虫和文件上传"
            actions={
              <Button size="sm" onClick={() => { setEditingSourceId(""); setShowSourceForm(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                添加数据源
              </Button>
            }
          >
            {sources.isLoading ? <Loading size="sm" /> : null}
            {sources.error ? <ApiErrorBanner error={sources.error} /> : null}

            {sources.data?.items?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead className="w-[100px]">类型</TableHead>
                    <TableHead className="w-[80px]">状态</TableHead>
                    <TableHead className="w-[180px]">网站地址</TableHead>
                    <TableHead className="w-[140px]">最近任务</TableHead>
                    <TableHead className="w-[180px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.data.items.map((s) => {
                    const latestJob = latestJobBySource.get(s.id);
                    const jobProgress = latestJob?.progress as { done?: number; total?: number } | undefined;
                    const jobPercent = jobProgress?.total ? Math.round(((jobProgress.done || 0) / jobProgress.total) * 100) : 0;

                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className="font-medium">{s.name || "未命名"}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">{s.id}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{s.type === "crawler_site" ? "网站爬虫" : s.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={s.status === "active" ? "default" : "secondary"}>
                            {s.status === "active" ? "启用" : "禁用"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[180px]">
                          <div className="truncate text-xs text-muted-foreground">
                            {(s.config as { base_url?: string }).base_url || "-"}
                          </div>
                        </TableCell>
                        <TableCell>
                          {latestJob ? (
                            <Link
                              to={`/jobs/${latestJob.id}`}
                              state={{ from: { kb_id: kbId, source_id: s.id } }}
                              className="block hover:underline"
                            >
                              {latestJob.status === "running" ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                                  <span className="text-xs text-blue-500">运行中 {jobPercent}%</span>
                                </div>
                              ) : latestJob.status === "queued" ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                                  <span className="text-xs text-amber-500">排队中</span>
                                </div>
                              ) : latestJob.status === "succeeded" ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                                  <span className="text-xs text-emerald-500">成功</span>
                                </div>
                              ) : latestJob.status === "failed" ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                                  <span className="text-xs text-red-500">失败</span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">{latestJob.status}</span>
                              )}
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => jumpToTab("pages", s.id)}
                              title="查看该数据源抓取到的内容（并写入 URL，便于分享/刷新保留筛选）"
                            >
                              内容
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => jumpToTab("jobs", s.id)}
                              title="查看该数据源相关任务（并写入 URL，便于分享/刷新保留筛选）"
                            >
                              任务
                            </Button>
                            {latestJob?.status === "failed" ? (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => syncSource.mutate(s.id)}
                                disabled={syncSource.isPending || s.status !== "active"}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                <RotateCcw className="mr-1 h-3 w-3" />
                                重试
                              </Button>
                            ) : (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => syncSource.mutate(s.id)}
                                disabled={syncSource.isPending || s.status !== "active" || latestJob?.status === "running" || latestJob?.status === "queued"}
                              >
                                <RefreshCw className={`mr-1 h-3 w-3 ${syncSource.isPending ? "animate-spin" : ""}`} />
                                同步
                              </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => { setEditingSourceId(s.id); setShowSourceForm(true); }}>
                              编辑
                            </Button>
                            <ConfirmDangerDialog
                              trigger={<Button variant="outline" size="sm">删除</Button>}
                              title="确认删除数据源？"
                              description={<>将删除 <span className="font-mono">{s.name || s.id}</span>（不影响已抓取的页面）。</>}
                              confirmLabel="删除"
                              confirmVariant="destructive"
                              confirmText={s.id}
                              confirmPlaceholder="输入 source_id 确认"
                              onConfirm={() => deleteSource.mutateAsync(s.id)}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                icon={<Database className="h-10 w-10" />}
                title="暂无数据源"
                description="添加数据源后，可以开始抓取和索引内容"
                action={
                  <Button onClick={() => setShowSourceForm(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    添加数据源
                  </Button>
                }
              />
            )}
          </Card>

          {/* 创建/编辑数据源表单 */}
          {showSourceForm && (
            <Card
              title={editingSourceId ? "编辑数据源" : "新建数据源"}
              description={editingSourceId ? `正在编辑 ${editingSourceId}` : "配置网站爬虫参数"}
              actions={
                <Button variant="ghost" size="sm" onClick={() => { setShowSourceForm(false); setEditingSourceId(""); }}>
                  取消
                </Button>
              }
            >
              <SourceConfigForm
                name={sourceName}
                onNameChange={setSourceName}
                status={sourceStatus}
                onStatusChange={setSourceStatus}
                config={sourceConfig}
                onConfigChange={setSourceConfig}
              />
              <div className="mt-4 flex items-center gap-2">
                {editingSourceId ? (
                  <Button onClick={() => updateSource.mutate()} disabled={updateSource.isPending}>
                    {updateSource.isPending ? "保存中..." : "保存修改"}
                  </Button>
                ) : (
                  <Button onClick={() => createSource.mutate()} disabled={createSource.isPending || !sourceName.trim()}>
                    {createSource.isPending ? "创建中..." : "创建数据源"}
                  </Button>
                )}
                <Button variant="outline" onClick={() => { setShowSourceForm(false); setEditingSourceId(""); }}>
                  取消
                </Button>
              </div>
            </Card>
          )}

          {/* 文件批次（合并到数据源 Tab） */}
          <Card
            title="文件上传"
            description="通过文件导入内容到知识库"
            actions={
              <Button variant="outline" size="sm" onClick={() => fileBatches.refetch()} disabled={fileBatches.isFetching}>
                刷新
              </Button>
            }
          >
            <div className="rounded-lg border border-dashed border-border/70 bg-background/30 p-6 text-center">
              <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
              <div className="mt-2 text-sm text-muted-foreground">文件上传功能开发中（当前不支持直接上传）</div>
              <div className="mt-1 text-xs text-muted-foreground">建议先通过「数据源」抓取内容；如需排障可跳转到内容/任务</div>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/kbs/${kbId}?tab=pages`}>查看内容</Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/kbs/${kbId}?tab=jobs`}>查看任务</Link>
                </Button>
              </div>
            </div>

            {fileBatches.data?.items?.length ? (
              <div className="mt-4">
                <div className="mb-2 text-sm font-medium">上传历史</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>批次 ID</TableHead>
                      <TableHead className="w-[100px]">状态</TableHead>
                      <TableHead className="w-[120px]">进度</TableHead>
                      <TableHead className="w-[100px]">失败</TableHead>
                      <TableHead className="w-[100px]">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fileBatches.data.items.slice(0, 5).map((b) => {
                      const percent = b.total ? Math.round(((b.done || 0) / Math.max(1, b.total)) * 100) : 0;
                      return (
                        <TableRow key={b.id}>
                          <TableCell className="font-mono text-xs">{b.id}</TableCell>
                          <TableCell>
                            <Badge variant={b.status === "done" ? "default" : "secondary"}>{b.status}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs">{b.done}/{b.total} ({percent}%)</div>
                            <Progress value={percent} className="mt-1 h-1" />
                          </TableCell>
                          <TableCell className="text-xs text-destructive">{b.failed || 0}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => setExpandedBatchId(expandedBatchId === b.id ? "" : b.id)}>
                              {expandedBatchId === b.id ? "收起" : "详情"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {expandedBatchId && batchDetail.data && (
                  <div className="mt-3 rounded-lg border border-border/50 bg-background/30 p-3">
                    <div className="text-sm font-medium">批次文件详情</div>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                      {batchDetail.data.items.map((it) => (
                        <div key={it.id} className="rounded border border-border/50 bg-card/50 p-2 text-xs">
                          <div className="flex justify-between">
                            <span className="truncate font-mono">{it.filename}</span>
                            <Badge variant={it.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">{it.status}</Badge>
                          </div>
                          {it.error && <div className="mt-1 text-destructive">{it.error}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </Card>
        </TabsContent>

        {/* ============ 内容 Tab ============ */}
        <TabsContent value="pages" className="space-y-4">
          <Card
            title="内容列表"
            description="该知识库下的所有文档页面"
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => pagesQuery.refetch()} disabled={pagesQuery.isFetching}>
                  刷新
                </Button>
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-3 pb-3 md:grid-cols-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">数据源</label>
                <Select
                  value={pagesSourceId}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setPagesSourceId(nextVal);
                    setPagesPage(1);

                    const next = new URLSearchParams(searchParams);
                    next.set("tab", "pages");
                    if (nextVal) next.set("source_id", nextVal);
                    else next.delete("source_id");
                    setSearchParams(next, { replace: true });
                  }}
                >
                  <option value="">全部</option>
                  {sources.data?.items.map((s) => (
                    <option key={s.id} value={s.id}>{s.name || s.id}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">已索引</label>
                <Select
                  value={pagesIndexed}
                  onChange={(e) => { setPagesIndexed(e.target.value); setPagesPage(1); }}
                >
                  <option value="">全部</option>
                  <option value="true">是</option>
                  <option value="false">否</option>
                </Select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs text-muted-foreground">搜索（URL/标题）</label>
                <Input
                  value={pagesQ}
                  onChange={(e) => { setPagesQ(e.target.value); setPagesPage(1); }}
                  placeholder="输入关键词搜索"
                />
              </div>
            </div>

            {pagesQuery.isLoading ? <Loading size="sm" /> : null}
            {pagesQuery.error ? <ApiErrorBanner error={pagesQuery.error} /> : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">ID</TableHead>
                  <TableHead>标题</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead className="w-[60px]">HTTP</TableHead>
                  <TableHead className="w-[70px]">已索引</TableHead>
                  <TableHead className="w-[140px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagesQuery.data?.items?.length ? (
                  pagesQuery.data.items.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">
                        <Link
                          className="hover:underline"
                          to={`/pages/${p.id}`}
                          state={{ from: { kb_id: kbId, source_id: p.source_id || undefined } }}
                          title="打开页面详情（保留返回路径：KB 内容）"
                        >
                          {p.id}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{p.title || <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell className="max-w-[300px]">
                        <CopyableText text={p.url} href={p.url} />
                      </TableCell>
                      <TableCell>
                        <span className={p.http_status >= 400 ? "text-red-400" : ""}>{p.http_status || "-"}</span>
                      </TableCell>
                      <TableCell>
                        {p.indexed ? <span className="text-emerald-400">是</span> : <span className="text-muted-foreground">否</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              navigate(`/pages/${p.id}`, {
                                state: { from: { kb_id: kbId, source_id: p.source_id || undefined } },
                              })
                            }
                          >
                            详情
                          </Button>
                          <Button variant="outline" size="sm" disabled={recrawlPage.isPending} onClick={() => recrawlPage.mutate(p.id)}>
                            重新抓取
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <EmptyState description="暂无内容，请先配置数据源并触发抓取任务" />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <Pagination
              page={pagesQuery.data?.page || pagesPage}
              pageSize={pagesQuery.data?.page_size || pagesPageSize}
              total={pagesQuery.data?.total || 0}
              onPageChange={setPagesPage}
            />
          </Card>
        </TabsContent>

        {/* ============ 任务 Tab ============ */}
        <TabsContent value="jobs" className="space-y-4">
          <Card
            title="任务历史"
            description="该知识库的抓取和索引任务记录"
            actions={
              <Button variant="outline" size="sm" onClick={() => jobsQuery.refetch()} disabled={jobsQuery.isFetching}>
                刷新
              </Button>
            }
          >
            <div className="grid grid-cols-1 gap-3 pb-3 md:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">任务类型</label>
                <Select
                  value={jobsType}
                  onChange={(e) => { setJobsType(e.target.value); setJobsPage(1); }}
                >
                  <option value="">全部</option>
                  <option value="crawl">抓取</option>
                  <option value="index">索引</option>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">状态</label>
                <Select
                  value={jobsStatus}
                  onChange={(e) => { setJobsStatus(e.target.value); setJobsPage(1); }}
                >
                  <option value="">全部</option>
                  <option value="queued">排队中</option>
                  <option value="running">运行中</option>
                  <option value="succeeded">成功</option>
                  <option value="failed">失败</option>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">数据源</label>
                <Select
                  value={jobsSourceId}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setJobsSourceId(nextVal);
                    setJobsPage(1);

                    const next = new URLSearchParams(searchParams);
                    next.set("tab", "jobs");
                    if (nextVal) next.set("source_id", nextVal);
                    else next.delete("source_id");
                    setSearchParams(next, { replace: true });
                  }}
                >
                  <option value="">全部</option>
                  {(sources.data?.items || []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name || s.id}</option>
                  ))}
                </Select>
              </div>
            </div>

            {jobsQuery.isLoading ? <Loading size="sm" /> : null}
            {jobsQuery.error ? <ApiErrorBanner error={jobsQuery.error} /> : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]" />
                  <TableHead className="w-[140px]">任务 ID</TableHead>
                  <TableHead className="w-[80px]">类型</TableHead>
                  <TableHead className="w-[80px]">状态</TableHead>
                  <TableHead>进度</TableHead>
                  <TableHead className="w-[140px]">开始时间</TableHead>
                  <TableHead className="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobsQuery.data?.items?.length ? (
                  jobsQuery.data.items.map((j) => {
                    const isExpanded = expandedJobId === j.id;
                    const progress = j.progress as { done?: number; total?: number; indexed?: number; failed?: number } | undefined;
                    const sourceName = sources.data?.items.find((s) => s.id === j.source_id)?.name;

                    return (
                      <Fragment key={j.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setExpandedJobId(isExpanded ? "" : j.id)}
                        >
                          <TableCell className="w-[40px] px-2">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{j.id}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{j.type === "crawl" ? "抓取" : j.type === "index" ? "索引" : j.type}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={j.status === "failed" ? "destructive" : j.status === "succeeded" ? "default" : "secondary"}>
                              {j.status === "queued" ? "排队中" : j.status === "running" ? "运行中" : j.status === "succeeded" ? "成功" : j.status === "failed" ? "失败" : j.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <ProgressPill type={j.type} status={j.status} progress={j.progress} />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{j.started_at?.slice(0, 16) || "-"}</TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={requeueJob.isPending || j.status === "running"}
                              onClick={(e) => { e.stopPropagation(); requeueJob.mutate(j.id); }}
                            >
                              重试
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${j.id}-detail`} className="bg-muted/30">
                            <TableCell colSpan={7} className="p-4">
                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-3">
                                  <div className="text-sm font-medium">任务详情</div>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="text-muted-foreground">任务 ID</div>
                                    <div className="font-mono">{j.id}</div>
                                    <div className="text-muted-foreground">类型</div>
                                    <div>{j.type === "crawl" ? "抓取" : j.type === "index" ? "索引" : j.type}</div>
                                    <div className="text-muted-foreground">数据源</div>
                                    <div>{sourceName || j.source_id || "-"}</div>
                                    <div className="text-muted-foreground">开始时间</div>
                                    <div>{j.started_at || "-"}</div>
                                    <div className="text-muted-foreground">结束时间</div>
                                    <div>{j.finished_at || "-"}</div>
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div className="text-sm font-medium">进度信息</div>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="text-muted-foreground">已完成</div>
                                    <div>{progress?.done ?? "-"}</div>
                                    <div className="text-muted-foreground">总数</div>
                                    <div>{progress?.total ?? "-"}</div>
                                    {progress?.indexed !== undefined && (
                                      <>
                                        <div className="text-muted-foreground">已索引</div>
                                        <div>{progress.indexed}</div>
                                      </>
                                    )}
                                    {progress?.failed !== undefined && progress.failed > 0 && (
                                      <>
                                        <div className="text-muted-foreground">失败数</div>
                                        <div className="text-red-500">{progress.failed}</div>
                                      </>
                                    )}
                                  </div>
                                  {j.error && (
                                    <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
                                      <div className="font-medium">错误信息</div>
                                      <div className="mt-1">{j.error}</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="mt-4 flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    navigate(`/jobs/${j.id}`, {
                                      state: { from: { kb_id: kbId, source_id: j.source_id || undefined } },
                                    })
                                  }
                                >
                                  查看完整详情
                                </Button>
                                {j.source_id && sources.data?.items.find((s) => s.id === j.source_id) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      handleTabChange("sources");
                                      setEditingSourceId(j.source_id);
                                      setShowSourceForm(true);
                                    }}
                                  >
                                    查看数据源
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <EmptyState description="暂无任务记录" />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <Pagination
              page={jobsQuery.data?.page || jobsPage}
              pageSize={jobsQuery.data?.page_size || jobsPageSize}
              total={jobsQuery.data?.total || 0}
              onPageChange={setJobsPage}
            />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
