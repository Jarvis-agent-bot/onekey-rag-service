import { useLocation } from "react-router-dom";
import type { BreadcrumbItem } from "../components/Breadcrumb";

// 导航项映射
const navLabels: Record<string, string> = {
  "/kbs": "知识库",
  "/apps": "应用",
  "/feedback": "反馈",
  "/quality": "质量",
  "/observability": "观测",
  "/audit": "审计",
  "/settings": "设置",
  "/pages": "内容",
  "/jobs": "任务",
};

/**
 * 根据当前路由生成面包屑
 * 规则：
 * - /kbs → [知识库]
 * - /kbs/:id → [知识库, 详情]
 * - /pages → [内容]
 * - /pages/:id → [内容, 详情]
 * - /jobs → [任务]
 * - /jobs/:id → [任务, 详情]
 */
export function useBreadcrumb(): BreadcrumbItem[] {
  const location = useLocation();
  const path = location.pathname;

  // 顶级页面
  if (navLabels[path]) {
    return [{ label: navLabels[path] }];
  }

  // 知识库详情（支持根据 ?tab= 展示更细的面包屑，减少页面割裂感）
  if (path.startsWith("/kbs/")) {
    const kbId = path.replace("/kbs/", "");
    const sp = new URLSearchParams(location.search);
    const tab = (sp.get("tab") || "").trim();

    const tabLabel: Record<string, string> = {
      overview: "总览",
      sources: "数据源",
      pages: "内容",
      jobs: "任务",
    };

    const base: BreadcrumbItem[] = [
      { label: "知识库", to: "/kbs" },
      { label: kbId || "详情", to: kbId ? `/kbs/${encodeURIComponent(kbId)}` : undefined },
    ];

    if (tab && tabLabel[tab]) {
      base.push({ label: tabLabel[tab] });
    }

    return base;
  }

  // 应用详情
  if (path.startsWith("/apps/")) {
    const appId = path.replace("/apps/", "");
    return [
      { label: "应用", to: "/apps" },
      { label: appId || "详情" },
    ];
  }

  // 内容详情
  if (path.startsWith("/pages/")) {
    const pageId = path.replace("/pages/", "");
    const from = (location.state as any)?.from as { kb_id?: string; source_id?: string } | undefined;
    const fromTo = from?.kb_id
      ? `/kbs/${encodeURIComponent(from.kb_id)}?tab=pages${from?.source_id ? `&source_id=${encodeURIComponent(from.source_id)}` : ""}`
      : "/pages";

    return [
      { label: "内容", to: fromTo },
      { label: pageId || "详情" },
    ];
  }

  // 任务详情
  if (path.startsWith("/jobs/")) {
    const jobId = path.replace("/jobs/", "");
    const from = (location.state as any)?.from as { kb_id?: string; source_id?: string } | undefined;
    const fromTo = from?.kb_id
      ? `/kbs/${encodeURIComponent(from.kb_id)}?tab=jobs${from?.source_id ? `&source_id=${encodeURIComponent(from.source_id)}` : ""}`
      : "/jobs";

    return [
      { label: "任务", to: fromTo },
      { label: jobId || "详情" },
    ];
  }

  // 观测详情
  if (path.startsWith("/observability/retrieval-events/")) {
    const eventId = path.replace("/observability/retrieval-events/", "");
    const fromSearch = ((location.state as any)?.from?.search as string | undefined) || "";
    const fromTo = fromSearch ? `/observability?${fromSearch}` : "/observability";
    return [
      { label: "观测", to: fromTo },
      { label: eventId || "详情" },
    ];
  }

  return [];
}
