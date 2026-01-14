import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { apiFetch } from "../lib/api";
import { useWorkspace } from "../lib/workspace";

const STATUS_OPTIONS: Array<{ value: string; label: string; badgeVariant: "outline" | "secondary" | "default" }> = [
  { value: "new", label: "未处理", badgeVariant: "outline" },
  { value: "confirmed", label: "已确认", badgeVariant: "secondary" },
  { value: "fixed", label: "已修复", badgeVariant: "default" },
];

const ATTR_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "未归因" },
  { value: "retrieval", label: "retrieval（检索）" },
  { value: "rerank", label: "rerank（重排）" },
  { value: "model", label: "model（模型）" },
  { value: "content", label: "content（内容）" },
  { value: "other", label: "other（其他）" },
];

function uniqTags(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    const tt = t.trim();
    if (!tt) continue;
    if (seen.has(tt)) continue;
    seen.add(tt);
    out.push(tt);
  }
  return out;
}

function parseTags(text: string): string[] {
  const raw = (text || "")
    .split(/[,，\n]/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return uniqTags(raw).slice(0, 20).map((t) => (t.length > 32 ? t.slice(0, 32) : t));
}

export function FeedbackTriage(props: {
  feedbackId: number;
  status: string;
  attribution: string;
  tags: string[];
  conversationId?: string;
}) {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(props.status || "new");
  const [attribution, setAttribution] = useState(props.attribution || "");
  const [tagsText, setTagsText] = useState((props.tags || []).join(", "));

  const statusInfo = useMemo(() => STATUS_OPTIONS.find((o) => o.value === (props.status || "new")) || STATUS_OPTIONS[0], [props.status]);
  const tagsPreview = useMemo(() => parseTags(tagsText), [tagsText]);

  const update = useMutation({
    mutationFn: async (payload: { status: string; attribution: string; tags: string[] }) => {
      return apiFetch<{ ok: boolean }>(`/admin/api/workspaces/${workspaceId}/feedback/${props.feedbackId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["feedback", workspaceId] });
      toast.success("已更新反馈标注");
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "更新失败"),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={statusInfo.badgeVariant}>{statusInfo.label}</Badge>
      {props.conversationId ? (
        <Button type="button" variant="outline" size="sm" asChild>
          <Link to={`/observability?conversation_id=${encodeURIComponent(props.conversationId)}`}>
            <ExternalLink className="mr-1 h-3 w-3" />
            对话
          </Link>
        </Button>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (update.isPending) return;
          if (v) {
            setStatus(props.status || "new");
            setAttribution(props.attribution || "");
            setTagsText((props.tags || []).join(", "));
          }
          setOpen(v);
        }}
      >
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            处理
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>反馈处理</DialogTitle>
            <DialogDescription>标注状态/归因/标签，便于后续回归与复盘。</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">状态</div>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">归因</div>
              <Select value={attribution} onChange={(e) => setAttribution(e.target.value)}>
                {ATTR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <div className="text-xs text-muted-foreground">标签（逗号分隔，最多 20 个）</div>
              <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="例如 hallucination, not_helpful" />
              <div className="text-xs text-muted-foreground">
                预览：{tagsPreview.length ? tagsPreview.map((t) => `#${t}`).join(" ") : "无"}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={update.isPending} onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={!workspaceId || update.isPending}
              onClick={() =>
                update.mutate({
                  status,
                  attribution,
                  tags: parseTags(tagsText),
                })
              }
            >
              {update.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
