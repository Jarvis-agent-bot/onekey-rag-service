import { Copy } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CopyableText(props: {
  text: string;
  href?: string;
  prefix?: ReactNode;
  className?: string;
  textClassName?: string;
  toastText?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", props.className)}>
      {props.prefix ? <div className="shrink-0">{props.prefix}</div> : null}
      {props.href ? (
        <a
          className={cn("min-w-0 flex-1 truncate underline underline-offset-2", props.textClassName)}
          href={props.href}
          target="_blank"
          rel="noreferrer"
          title={props.text}
        >
          {props.text}
        </a>
      ) : (
        <span className={cn("min-w-0 flex-1 truncate", props.textClassName)} title={props.text}>
          {props.text}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={async () => {
          const ok = await copyToClipboard(props.text);
          if (ok) toast.success(props.toastText ?? "已复制");
          else toast.error("复制失败");
        }}
        aria-label="复制"
        title="复制"
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

