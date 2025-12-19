import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ApiError } from "../lib/api";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

function formatForCopy(err: unknown): { title: string; detail: string } {
  if (err instanceof ApiError) {
    const detail = [
      `url: ${err.url}`,
      `status: ${err.status}`,
      `message: ${err.message}`,
      err.bodyText ? `body: ${err.bodyText}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return { title: err.message || "请求失败", detail };
  }
  if (err instanceof Error) return { title: err.message || "发生错误", detail: err.stack || err.message };
  return { title: "发生错误", detail: String(err) };
}

export function ApiErrorBanner(props: { error: unknown; className?: string }) {
  const [open, setOpen] = useState(false);
  const { title, detail } = useMemo(() => formatForCopy(props.error), [props.error]);
  const status = props.error instanceof ApiError ? props.error.status : null;
  const url = props.error instanceof ApiError ? props.error.url : null;

  return (
    <div className={cn("rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm", props.className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-destructive">{title}</div>
          {status != null || url ? (
            <div className="mt-1 font-mono text-xs text-muted-foreground">
              {status != null ? <span>HTTP {status}</span> : null}
              {status != null && url ? <span className="mx-2">·</span> : null}
              {url ? (
                <span className="truncate" title={url}>
                  {url}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(detail);
                toast.success("已复制错误详情");
              } catch {
                toast.error("复制失败");
              }
            }}
          >
            复制
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "收起" : "详情"}
          </Button>
        </div>
      </div>
      {open ? (
        <pre className="mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-background p-2 text-xs leading-relaxed">
          {detail}
        </pre>
      ) : null}
    </div>
  );
}
