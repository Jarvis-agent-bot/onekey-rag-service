import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { ConfirmDangerDialog } from "../components/ConfirmDangerDialog";
import { Button } from "../components/ui/button";
import { Card } from "../components/Card";
import { JsonView } from "../components/JsonView";
import { CopyableText } from "../components/CopyableText";
import { ApiErrorBanner } from "../components/ApiErrorBanner";
import { EntityLinksBar } from "../components/EntityLinksBar";
import { apiFetch } from "../lib/api";
import { useWorkspace } from "../lib/workspace";

type PageDetail = {
  id: number;
  kb_id: string;
  source_id: string;
  url: string;
  title: string;
  http_status: number;
  last_crawled_at: string | null;
  content_markdown: string;
  chunk_stats: { total: number; with_embedding: number; embedding_coverage: number; embedding_models: Record<string, number> };
  meta: Record<string, unknown>;
};

export function PageDetailPage() {
  const { workspaceId } = useWorkspace();
  const params = useParams();
  const pageId = Number(params.pageId || 0);
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  const from = (location.state as any)?.from as { kb_id?: string; source_id?: string } | undefined;

  const q = useQuery({
    queryKey: ["page", workspaceId, pageId],
    queryFn: () => apiFetch<PageDetail>(`/admin/api/workspaces/${workspaceId}/pages/${pageId}`),
    enabled: !!workspaceId && Number.isFinite(pageId) && pageId > 0,
  });

  const recrawl = useMutation({
    mutationFn: async () => {
      return apiFetch<{ job_id: string }>(`/admin/api/workspaces/${workspaceId}/pages/${pageId}/recrawl`, { method: "POST" });
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ["pages", workspaceId] });
      await qc.invalidateQueries({ queryKey: ["page", workspaceId, pageId] });
      toast.success("已触发重抓取，正在跳转任务详情");
      navigate(`/jobs/${data.job_id}`, {
        state: { from: { kb_id: q.data?.kb_id, source_id: q.data?.source_id } },
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "触发失败"),
  });

  const del = useMutation({
    mutationFn: async () => {
      return apiFetch<{ ok: boolean }>(`/admin/api/workspaces/${workspaceId}/pages/${pageId}`, { method: "DELETE" });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["pages", workspaceId] });
      toast.success("已删除页面");
      const kbId = q.data?.kb_id;
      const sourceId = q.data?.source_id;
      if (kbId) {
        navigate(`/kbs/${encodeURIComponent(kbId)}?tab=pages${sourceId ? `&source_id=${encodeURIComponent(sourceId)}` : ""}`, { replace: true });
      } else {
        navigate("/pages", { replace: true });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  const actionError = recrawl.error || del.error;

  // 智能返回逻辑：优先使用来源页面 state.from（保留 kb/source 上下文），否则退回到 KB 内容页或上一页
  const handleGoBack = () => {
    if (from?.kb_id) {
      const qs = new URLSearchParams();
      qs.set("tab", "pages");
      if (from.source_id) qs.set("source_id", from.source_id);
      navigate(`/kbs/${encodeURIComponent(from.kb_id)}?${qs.toString()}`);
      return;
    }

    if (q.data?.kb_id) {
      const qs = new URLSearchParams();
      qs.set("tab", "pages");
      if (q.data.source_id) qs.set("source_id", q.data.source_id);
      navigate(`/kbs/${encodeURIComponent(q.data.kb_id)}?${qs.toString()}`);
      return;
    }

    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate("/pages");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleGoBack} className="gap-1 px-2">
              <ArrowLeft className="h-4 w-4" />
              返回
            </Button>
            <div className="text-lg font-semibold">页面详情</div>
          </div>
          <EntityLinksBar appId={undefined} kbId={q.data?.kb_id} sourceId={q.data?.source_id} className="mt-2" />

          {from?.kb_id ? (
            <div className="mt-2 text-xs text-muted-foreground">
              来源：
              <Link
                className="underline underline-offset-2"
                to={`/kbs/${encodeURIComponent(from.kb_id)}?tab=pages${from.source_id ? `&source_id=${encodeURIComponent(from.source_id)}` : ""}`}
                title="回到触发跳转的 KB / 内容视图（尽量保留 source_id 筛选）"
              >
                返回来源视图
              </Link>
              <span className="ml-3">
                <Link className="underline underline-offset-2" to={`/pages?kb_id=${encodeURIComponent(from.kb_id)}`}>
                  全局内容（带 KB）
                </Link>
              </span>
            </div>
          ) : q.data?.kb_id ? (
            <div className="mt-2 text-xs text-muted-foreground">
              <Link
                className="underline underline-offset-2"
                to={`/kbs/${encodeURIComponent(q.data.kb_id)}?tab=pages${q.data.source_id ? `&source_id=${encodeURIComponent(q.data.source_id)}` : ""}`}
              >
                返回该知识库 / 内容
              </Link>
              <span className="ml-3">
                <Link className="underline underline-offset-2" to={`/pages?kb_id=${encodeURIComponent(q.data.kb_id)}`}>
                  全局内容（带 KB）
                </Link>
              </span>
            </div>
          ) : (
            <div className="mt-2 text-xs text-muted-foreground">
              <Link className="underline underline-offset-2" to="/pages">
                返回内容列表
              </Link>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={!q.data || recrawl.isPending} onClick={() => recrawl.mutate()}>
            {recrawl.isPending ? "触发中..." : "重抓取"}
          </Button>
          <ConfirmDangerDialog
            trigger={
              <Button variant="outline" disabled={!q.data || del.isPending}>
                删除
              </Button>
            }
            title="确认删除 Page？"
            description={
              <>
                将删除 page_id=<span className="font-mono">{pageId}</span>，并级联删除其 chunks（如存在）。此操作不可恢复。
              </>
            }
            confirmLabel="继续删除"
            confirmVariant="destructive"
            confirmText={String(pageId)}
            confirmPlaceholder="输入 page_id 确认"
            confirmDisabled={!q.data || del.isPending}
            onConfirm={() => del.mutateAsync()}
          />
        </div>
      </div>

      {actionError ? <ApiErrorBanner error={actionError} /> : null}

      {q.isLoading ? <div className="text-sm text-muted-foreground">加载中...</div> : null}
      {q.error ? <ApiErrorBanner error={q.error} /> : null}

      {q.data ? (
        <div className="space-y-4">
          <Card title="基本信息">
            <div className="grid grid-cols-1 gap-3 text-sm lg:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">ID</div>
                <div className="font-mono text-xs">{q.data.id}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">KB</div>
                <Link
                  className="font-mono text-xs underline underline-offset-2"
                  to={`/kbs/${encodeURIComponent(q.data.kb_id)}?tab=pages${q.data.source_id ? `&source_id=${encodeURIComponent(q.data.source_id)}` : ""}`}
                  title="回到该 KB 的内容 Tab（并尽量保留 source_id 筛选）"
                >
                  {q.data.kb_id}
                </Link>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Source</div>
                <div className="flex items-center gap-2">
                  <div className="font-mono text-xs">{q.data.source_id || "-"}</div>
                  {q.data.kb_id ? (
                    <Link
                      className="text-xs underline underline-offset-2"
                      to={`/kbs/${encodeURIComponent(q.data.kb_id)}?tab=sources${q.data.source_id ? `&source_id=${encodeURIComponent(q.data.source_id)}` : ""}`}
                      title="打开 KB 详情 → 数据源（并尽量定位到当前 source_id）"
                    >
                      查看数据源
                    </Link>
                  ) : null}
                </div>
              </div>
              <div className="lg:col-span-3">
                <div className="text-xs text-muted-foreground">URL</div>
                <CopyableText text={q.data.url} href={q.data.url} className="max-w-[980px]" />
              </div>
              <div className="lg:col-span-2">
                <div className="text-xs text-muted-foreground">标题</div>
                <div>{q.data.title || <span className="text-muted-foreground">-</span>}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">HTTP</div>
                <div className={q.data.http_status >= 400 ? "text-destructive" : ""}>{q.data.http_status || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">last_crawled_at</div>
                <div className="font-mono text-xs">{q.data.last_crawled_at || "-"}</div>
              </div>
            </div>
          </Card>

          <Card title="Chunks 统计" description="用于排障：chunk 数量、embedding 覆盖率与模型分布">
            <div className="grid grid-cols-1 gap-3 text-sm lg:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">total</div>
                <div className="font-mono text-xs">{q.data.chunk_stats?.total ?? 0}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">with_embedding</div>
                <div className="font-mono text-xs">{q.data.chunk_stats?.with_embedding ?? 0}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">embedding_coverage</div>
                <div className="font-mono text-xs">{Math.round((q.data.chunk_stats?.embedding_coverage ?? 0) * 100)}%</div>
              </div>
            </div>
            <div className="pt-2">
              <div className="text-xs text-muted-foreground">embedding_models</div>
              <JsonView value={q.data.chunk_stats?.embedding_models || {}} />
            </div>
          </Card>

          <Card title="Markdown（原始内容）" description="当前为纯文本预览；如需富文本预览可再引入 Markdown 渲染组件">
            <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted p-3 text-xs leading-relaxed">
              {q.data.content_markdown || ""}
            </pre>
          </Card>

          <Card title="Meta">
            <JsonView value={q.data.meta || {}} />
          </Card>
        </div>
      ) : null}
    </div>
  );
}
