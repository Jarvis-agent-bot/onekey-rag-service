import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";

export function BulkActionsBar(props: {
  count: number;
  actions?: ReactNode;
  onClear?: () => void;
  className?: string;
}) {
  if (!props.count) return null;
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2", props.className)}>
      <div className="text-sm">
        已选择 <span className="font-medium">{props.count}</span> 项
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {props.actions}
        {props.onClear ? (
          <Button type="button" variant="outline" size="sm" onClick={props.onClear}>
            清空选择
          </Button>
        ) : null}
      </div>
    </div>
  );
}

