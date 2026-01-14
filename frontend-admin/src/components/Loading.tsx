import { Loader2 } from "lucide-react";

import { cn } from "../lib/utils";

interface LoadingProps {
  /** 显示的提示文字 */
  text?: string;
  /** 是否全屏居中显示 */
  fullScreen?: boolean;
  /** 自定义 className */
  className?: string;
  /** 尺寸 */
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

/**
 * 统一的加载状态组件
 * 提供 Spinner 动画和可选的加载文字
 */
export function Loading({ text = "加载中...", fullScreen = false, className, size = "md" }: LoadingProps) {
  const content = (
    <div className={cn("flex items-center gap-2 text-muted-foreground", className)}>
      <Loader2 className={cn("animate-spin", sizeMap[size])} />
      {text && <span className="text-sm">{text}</span>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        {content}
      </div>
    );
  }

  return content;
}

/**
 * 表格骨架屏组件
 * 用于表格加载时的占位显示
 */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {/* 表头 */}
      <div className="flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-4 flex-1 animate-pulse rounded bg-muted" />
        ))}
      </div>
      {/* 表格行 */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex gap-4">
          {Array.from({ length: cols }).map((_, colIdx) => (
            <div
              key={colIdx}
              className="h-8 flex-1 animate-pulse rounded bg-muted/60"
              style={{ animationDelay: `${(rowIdx * cols + colIdx) * 50}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * 卡片骨架屏组件
 * 用于卡片加载时的占位显示
 */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 p-4">
      <div className="h-5 w-1/3 animate-pulse rounded bg-muted" />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded bg-muted/60"
          style={{
            width: `${80 - i * 15}%`,
            animationDelay: `${i * 100}ms`,
          }}
        />
      ))}
    </div>
  );
}
