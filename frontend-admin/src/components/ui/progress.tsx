import * as React from "react";

import { cn } from "../../lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  indicatorClassName?: string;
}

/** 简洁进度条，value 取值 0-100。 */
const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, indicatorClassName, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-muted/60 ring-1 ring-border/60",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "h-full w-full flex-1 rounded-full bg-gradient-to-r from-primary/70 via-primary to-primary/70 transition-all duration-500",
          indicatorClassName
        )}
        style={{ width: `${Math.min(Math.max(value || 0, 0), 100)}%` }}
      />
    </div>
  )
);
Progress.displayName = "Progress";

export { Progress };
