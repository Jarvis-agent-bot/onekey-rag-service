import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">任务详情</div>
          <div className="mt-1 text-xs text-muted-foreground">
            <Link className="underline underline-offset-2" to="/jobs">
              返回任务列表
            </Link>
            {q.data?.kb_id ? (
              <span className="ml-3">
                <Link
                  className="underline underline-offset-2"
                  to={`/pages?kb_id=${encodeURIComponent(q.data.kb_id)}${q.data.source_id ? `&source_id=${encodeURIComponent(q.data.source_id)}` : ""}`}
                >
                  查看相关页面
                </Link>
              </span>
            ) : null}
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
        </div>
      ) : null}
    </div>
  );
}
