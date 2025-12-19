import type { ReactNode } from "react";

import { cn } from "../lib/utils";

export function EmptyState(props: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-1 py-8 text-center", props.className)}>
      <div className="text-sm font-medium">{props.title ?? "暂无数据"}</div>
      {props.description ? <div className="text-sm text-muted-foreground">{props.description}</div> : null}
      {props.actions ? <div className="mt-2 flex items-center gap-2">{props.actions}</div> : null}
    </div>
  );
}

