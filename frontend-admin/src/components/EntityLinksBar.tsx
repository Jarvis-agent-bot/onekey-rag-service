import { Link } from "react-router-dom";

import { cn } from "../lib/utils";

export function EntityLinksBar(props: {
  appId?: string;
  kbId?: string;
  sourceId?: string;
  className?: string;
}) {
  const appId = (props.appId || "").trim();
  const kbId = (props.kbId || "").trim();
  const sourceId = (props.sourceId || "").trim();

  if (!appId && !kbId && !sourceId) return null;

  const links: Array<{ to: string; label: string }> = [];

  if (appId) {
    links.push({ to: `/apps/${encodeURIComponent(appId)}`, label: "查看应用" });
    links.push({ to: `/kbs?app_id=${encodeURIComponent(appId)}`, label: "该应用的 KB" });
    links.push({ to: `/observability?app_id=${encodeURIComponent(appId)}`, label: "观测（按 App）" });
  }

  if (kbId) {
    links.push({ to: `/kbs/${encodeURIComponent(kbId)}`, label: "查看 KB" });
    links.push({ to: `/kbs/${encodeURIComponent(kbId)}?tab=jobs`, label: "KB 内任务" });
    links.push({ to: `/observability?kb_id=${encodeURIComponent(kbId)}`, label: "观测（按 KB）" });
  }

  if (kbId && sourceId) {
    links.push({
      to: `/kbs/${encodeURIComponent(kbId)}?tab=jobs&source_id=${encodeURIComponent(sourceId)}`,
      label: "该数据源的任务",
    });
    links.push({
      to: `/kbs/${encodeURIComponent(kbId)}?tab=pages&source_id=${encodeURIComponent(sourceId)}`,
      label: "该数据源的页面",
    });
  }

  // 去重（同 to 的只保留第一个）
  const seen = new Set<string>();
  const dedup = links.filter((x) => (seen.has(x.to) ? false : (seen.add(x.to), true)));

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground", props.className)}>
      <div className="text-[11px] uppercase tracking-[0.14em]">快捷跳转</div>
      <div className="h-3 w-px bg-border" />
      {dedup.map((x) => (
        <Link key={x.to} className="underline underline-offset-2 hover:text-foreground" to={x.to}>
          {x.label}
        </Link>
      ))}
    </div>
  );
}
