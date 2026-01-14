import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { ConfirmDangerDialog } from "../components/ConfirmDangerDialog";
import { Button } from "../components/ui/button";
import { Card } from "../components/Card";
import { JsonView } from "../components/JsonView";
import { ApiErrorBanner } from "../components/ApiErrorBanner";
import { apiFetch } from "../lib/api";
import { useWorkspace } from "../lib/workspace";

type JobDetail = {
  id: string;
  type: string;
  status: string;
  workspace_id: string;
  kb_id: string;
  app_id: string;
  source_id: string;
  payload: Record<string, unknown>;
  progress: Record<string, unknown>;
  logs?: Array<Record<string, unknown>>;
  subtasks?: Array<{ id: string; filename?: string; size_bytes?: number; status?: string; error?: string }>;
  error: string;
  started_at: string | null;
  finished_at: string | null;
};

function shouldPoll(status?: string) {
  return status === "queued" || status === "running";
}

export function JobDetailPage() {
  const { workspaceId } = useWorkspace();
  const params = useParams();
  const jobId = params.jobId || "";
  const qc = useQueryClient();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["job", workspaceId, jobId],
    queryFn: () => apiFetch<JobDetail>(`/admin/api/workspaces/${workspaceId}/jobs/${jobId}`),
    enabled: !!workspaceId && !!jobId,
    refetchInterval: (query) => (shouldPoll(query.state.data?.status) ? 1000 : false),
  });

  const requeue = useMutation({
    mutationFn: async () => {
      return apiFetch<{ ok: boolean }>(`/admin/api/workspaces/${workspaceId}/jobs/${jobId}/requeue`, { method: "POST" });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["job", workspaceId, jobId] });
      await qc.invalidateQueries({ queryKey: ["jobs", workspaceId] });
      toast.success("已重新入队");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "重新入队失败"),
  });

  const cancel = useMutation({
    mutationFn: async () => {
      return apiFetch<{ ok: boolean }>(`/admin/api/workspaces/${workspaceId}/jobs/${jobId}/cancel`, { method: "POST" });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["job", workspaceId, jobId] });
      await qc.invalidateQueries({ queryKey: ["jobs", workspaceId] });
      toast.success("已取消任务");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "取消失败"),
  });

  const actionError = requeue.error || cancel.error;

  // 智能返回逻辑：优先返回 KB 详情页，否则返回上一页
  const handleGoBack = () => {
    if (q.data?.kb_id) {
      navigate(`/kbs/${q.data.kb_id}?tab=jobs`);
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/kbs");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleGoBack} className="gap-1 px-2">
              <ArrowLeft className="h-4 w-4" />
              返回
            </Button>
            <span className="text-lg font-semibold">任务详情</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            {q.data?.kb_id ? (
              <>
                <Link className="hover:underline" to={`/kbs/${q.data.kb_id}`}>
                  所属知识库
                </Link>
                <Link className="hover:underline" to={`/kbs/${q.data.kb_id}?tab=pages`}>
                  查看内容
                </Link>
                <Link className="hover:underline" to={`/kbs/${q.data.kb_id}?tab=jobs`}>
                  查看任务
                </Link>
              </>
            ) : (
              <Link className="hover:underline" to="/kbs">
                知识库列表
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ConfirmDangerDialog
            trigger={
              <Button variant="outline" disabled={!q.data || requeue.isPending}>
                {requeue.isPending ? "重新入队中..." : "重新入队"}
              </Button>
            }
            title="确认重新入队？"
            description={
              <>
                将把 job_id=<span className="font-mono">{jobId}</span> 的状态重置为 queued，并清空 progress/error。建议仅用于排障重试。
              </>
            }
            confirmLabel="继续重新入队"
            confirmDisabled={!q.data || requeue.isPending}
            onConfirm={() => requeue.mutateAsync()}
          />
          <ConfirmDangerDialog
            trigger={
              <Button variant="outline" disabled={!q.data || q.data.status !== "queued" || cancel.isPending}>
                {cancel.isPending ? "取消中..." : "取消(仅 queued)"}
              </Button>
            }
            title="确认取消任务？"
            description={
              <>
                将取消 job_id=<span className="font-mono">{jobId}</span>（仅支持 queued）。此操作不可恢复。
              </>
            }
            confirmLabel="继续取消"
            confirmVariant="destructive"
            confirmDisabled={!q.data || q.data.status !== "queued" || cancel.isPending}
            onConfirm={() => cancel.mutateAsync()}
          />
        </div>
      </div>

      {actionError ? <ApiErrorBanner error={actionError} /> : null}

      {q.isLoading ? <div className="text-sm text-muted-foreground">加载中...</div> : null}
      {q.error ? <ApiErrorBanner error={q.error} /> : null}

      {q.data ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="基本信息">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">ID</div>
                <div className="font-mono text-xs">{q.data.id}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">状态</div>
                <div className="font-mono">{q.data.status}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">类型</div>
                <div className="font-mono">{q.data.type}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">KB</div>
                <div className="font-mono text-xs">{q.data.kb_id || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Source</div>
                <div className="font-mono text-xs">{q.data.source_id || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">App</div>
                <div className="font-mono text-xs">{q.data.app_id || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">开始</div>
                <div className="font-mono text-xs">{q.data.started_at || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">结束</div>
                <div className="font-mono text-xs">{q.data.finished_at || "-"}</div>
              </div>
            </div>
          </Card>

          <Card title="错误信息" description="error 字段（如失败会有内容）">
            {q.data.error ? (
              <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted p-3 text-xs text-destructive">
                {q.data.error}
              </pre>
            ) : (
              <div className="text-sm text-muted-foreground">无</div>
            )}
          </Card>

          <Card title="Payload" className="lg:col-span-2">
            <JsonView value={q.data.payload || {}} />
          </Card>

          <Card title="Progress" className="lg:col-span-2">
            <JsonView value={q.data.progress || {}} />
          </Card>

          {q.data.subtasks?.length ? (
            <Card title="子任务 / 文件" description="file_process 返回的文件列表">
              <div className="space-y-2 text-xs">
                {q.data.subtasks.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 p-2 font-mono">
                    <span className="truncate">{s.filename || s.id}</span>
                    <span className={s.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{s.status}</span>
                    <span className="text-muted-foreground">{s.error || ""}</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {q.data.logs?.length ? (
            <Card title="日志" description="任务进度日志摘要">
              <div className="space-y-1 text-xs font-mono text-muted-foreground">
                {q.data.logs.map((l, idx) => (
                  <div key={idx} className="truncate">
                    {JSON.stringify(l)}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
