import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Card } from "../components/Card";
import { ConfirmDangerDialog } from "../components/ConfirmDangerDialog";
import { KbStatsSummary } from "../components/KbStatsSummary";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { apiFetch } from "../lib/api";
import { useWorkspace } from "../lib/workspace";
import { EmptyState } from "../components/EmptyState";
import { ApiErrorBanner } from "../components/ApiErrorBanner";

type KbsResp = {
  items: Array<{
    id: string;
    name: string;
    status: string;
    updated_at: string | null;
    stats?: {
      pages: { total: number; last_crawled_at: string | null };
      chunks: { total: number; with_embedding: number; embedding_coverage: number; last_indexed_at: string | null };
    };
    referenced_by?: {
      total: number;
      items: Array<{ app_id: string; name: string; public_model_id: string }>;
    };
  }>;
};

export function KbsPage() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const q = useQuery({
    queryKey: ["kbs", workspaceId],
    queryFn: () => apiFetch<KbsResp>(`/admin/api/workspaces/${workspaceId}/kbs`),
    enabled: !!workspaceId,
  });

  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      return apiFetch<{ id: string }>(`/admin/api/workspaces/${workspaceId}/kbs`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
    },
    onSuccess: async () => {
      setName("");
      setCreateOpen(false);
      await qc.invalidateQueries({ queryKey: ["kbs", workspaceId] });
      toast.success("已创建知识库");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "创建失败"),
  });

  const del = useMutation({
    mutationFn: async (kbId: string) => {
      return apiFetch<{ ok: boolean }>(`/admin/api/workspaces/${workspaceId}/kbs/${kbId}`, { method: "DELETE" });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["kbs", workspaceId] });
      toast.success("已删除知识库");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold">知识库</div>

      <Card title="列表" description="点击进入知识库详情（数据源、页面、统计、自检）">
        <div className="flex justify-end pb-3">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>新建知识库</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新建知识库（KB）</DialogTitle>
                <DialogDescription>KB（Knowledge Base）是知识集合，包含数据源、页面与 Chunks。</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">名称</div>
                <Input placeholder="例如 OneKey Docs KB" value={name} onChange={(e) => setName(e.target.value)} />
                {create.error ? <ApiErrorBanner error={create.error} /> : null}
              </div>
              <DialogFooter>
                <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
                  {create.isPending ? "创建中..." : "创建"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {q.isLoading ? <div className="text-sm text-muted-foreground">加载中...</div> : null}
        {q.error ? <ApiErrorBanner error={q.error} /> : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>统计</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead className="w-[180px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data?.items || []).length ? (
              (q.data?.items || []).map((it) => (
                <TableRow key={it.id}>
                  <TableCell>
                    <Link className="underline underline-offset-2" to={`/kbs/${it.id}`}>
                      {it.name}
                    </Link>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">{it.id}</div>
                  </TableCell>
                  <TableCell className="min-w-[320px]">
                    <KbStatsSummary
                      pages={it.stats?.pages || { total: 0, last_crawled_at: null }}
                      chunks={it.stats?.chunks || { total: 0, with_embedding: 0, embedding_coverage: 0, last_indexed_at: null }}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant={it.status === "active" ? "default" : "secondary"}>{it.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{it.updated_at || "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => navigate(`/kbs/${it.id}`)}>
                        详情
                      </Button>
                      <ConfirmDangerDialog
                        trigger={
                          <Button variant="outline" size="sm" disabled={del.isPending}>
                            删除
                          </Button>
                        }
                        title="确认删除知识库？"
                        description={
                          <>
                            <div>
                              将删除 KB=<span className="font-mono">{it.id}</span> 的记录与数据源/绑定关系（历史兼容：不会自动清理 pages/chunks）。此操作不可恢复。
                            </div>
                            {it.referenced_by?.total ? (
                              <div className="mt-2">
                                <div>
                                  当前被 <span className="font-mono">{it.referenced_by.total}</span> 个应用引用：
                                </div>
                                <ul className="mt-1 list-inside list-disc">
                                  {(it.referenced_by.items || []).slice(0, 5).map((a) => (
                                    <li key={a.app_id}>
                                      <span className="font-medium">{a.name || a.app_id}</span>{" "}
                                      <span className="font-mono">({a.public_model_id || "-"})</span>
                                    </li>
                                  ))}
                                </ul>
                                {it.referenced_by.total > 5 ? <div className="mt-1 text-xs">仅展示前 5 个。</div> : null}
                              </div>
                            ) : (
                              <div className="mt-2 text-xs">当前未被应用引用。</div>
                            )}
                          </>
                        }
                        confirmLabel="继续删除"
                        confirmVariant="destructive"
                        confirmText={it.id}
                        confirmPlaceholder="输入 kb_id 确认"
                        confirmDisabled={del.isPending}
                        onConfirm={() => del.mutateAsync(it.id)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5}>
                  <EmptyState
                    description="新建知识库后，可在详情页配置数据源，并在任务中心触发抓取与索引。"
                    actions={
                      <Button type="button" onClick={() => setCreateOpen(true)}>
                        新建知识库
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
