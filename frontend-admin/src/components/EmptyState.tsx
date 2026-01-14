import type { ReactNode } from "react";

import { cn } from "../lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, actions, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-8 text-center", className)}>
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <div className="text-sm font-medium">{title ?? "暂无数据"}</div>
      {description && <div className="text-sm text-muted-foreground">{description}</div>}
      {(action || actions) && <div className="mt-2 flex items-center gap-2">{action || actions}</div>}
    </div>
  );
}

