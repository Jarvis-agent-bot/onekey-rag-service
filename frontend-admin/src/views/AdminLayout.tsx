import { BarChart3, Boxes, Database, Eye, FileText, Home, LogOut, ScrollText, Settings, ThumbsUp, TestTubeDiagonal, type LucideIcon } from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { Breadcrumb } from "../components/Breadcrumb";
import { Button } from "../components/ui/button";
import { clearToken } from "../lib/auth";
import { cn } from "../lib/utils";
import { useBreadcrumb } from "../lib/useBreadcrumb";
import { useMe } from "../lib/useMe";
import { useWorkspace } from "../lib/workspace";
import { Select } from "../components/ui/select";
import { Separator } from "../components/ui/separator";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

/**
 * 分组导航配置
 * 首页 + 三板块：内容管理 | 运营监控 | 系统
 */
const navGroups: NavGroup[] = [
  {
    title: "",
    items: [
      { to: "/", label: "首页", icon: Home },
    ],
  },
  {
    title: "知识构建",
    items: [
      { to: "/kbs", label: "知识库（Collections）", icon: Database },
      { to: "/pages", label: "内容（Documents）", icon: FileText },
      { to: "/jobs", label: "索引/任务（Jobs）", icon: ScrollText },
      { to: "/apps", label: "应用（Apps）", icon: Boxes },
      { to: "/playground", label: "验证台（Playground）", icon: TestTubeDiagonal },
    ],
  },
  {
    title: "运营监控",
    items: [
      { to: "/feedback", label: "反馈", icon: ThumbsUp },
      { to: "/quality", label: "质量", icon: BarChart3 },
      { to: "/observability", label: "观测", icon: Eye },
    ],
  },
  {
    title: "系统",
    items: [
      { to: "/audit", label: "审计", icon: ScrollText },
      { to: "/settings", label: "设置", icon: Settings },
    ],
  },
];

// 扁平化导航项用于面包屑匹配
const flatNavItems = navGroups.flatMap((g) => g.items);

function normalizeNavPath(pathname: string) {
  if (pathname === "/") return "/";
  const found = flatNavItems.find((it) => it.to !== "/" && pathname.startsWith(it.to));
  return found?.to || "/";
}

export function AdminLayout() {
  const navigate = useNavigate();
  const me = useMe();
  const qc = useQueryClient();
  const location = useLocation();
  const ws = useWorkspace();
  const wsLabel = ws.workspaces.find((w) => w.id === ws.workspaceId)?.name || ws.workspaceId;
  const breadcrumbItems = useBreadcrumb();
  const currentNav = normalizeNavPath(location.pathname);

  useEffect(() => {
    if (!me.error) return;
    const msg = me.error instanceof Error ? me.error.message : String(me.error);
    if (!msg.includes("未登录")) return;
    clearToken();
    navigate("/login", { replace: true });
  }, [me.error, navigate]);

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-background to-muted/40">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_circle_at_50%_-200px,hsl(var(--primary)/0.18),transparent_55%)]" />
      <div className="relative flex min-h-screen w-full">
        <aside className="hidden w-64 shrink-0 flex-col border-r bg-background p-4 md:flex">
          <div className="mb-4 space-y-1">
            <div className="text-sm font-semibold">OneKey RAG Admin</div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">工作区</div>
              <Select
                value={ws.workspaceId}
                onChange={(e) => {
                  ws.setWorkspaceId(e.target.value);
                  qc.invalidateQueries();
                  navigate("/kbs", { replace: true });
                }}
              >
                {(ws.workspaces || []).length ? (
                  (ws.workspaces || []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.id})
                    </option>
                  ))
                ) : (
                  <option value={ws.workspaceId}>{ws.workspaceId}</option>
                )}
              </Select>
            </div>
          </div>

          <nav className="space-y-4">
            {navGroups.map((group, groupIdx) => (
              <div key={group.title || `group-${groupIdx}`}>
                {group.title && groupIdx > 0 && <Separator className="mb-3" />}
                {group.title && (
                  <div className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                    {group.title}
                  </div>
                )}
                <div className="space-y-1">
                  {group.items.map((it) => {
                    const Icon = it.icon;
                    return (
                      <NavLink
                        key={it.to}
                        to={it.to}
                        end={it.to === "/"}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted",
                            isActive ? "bg-muted font-medium text-foreground" : "text-muted-foreground"
                          )
                        }
                      >
                        <Icon className="h-4 w-4" />
                        {it.label}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-auto pt-4">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                clearToken();
                navigate("/login", { replace: true });
              }}
            >
              <LogOut />
              退出登录
            </Button>
          </div>
        </aside>

        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="text-sm text-muted-foreground md:hidden">OneKey RAG Admin</div>
              <div className="md:hidden flex items-center gap-2">
                <Select
                  value={ws.workspaceId}
                  onChange={(e) => {
                    ws.setWorkspaceId(e.target.value);
                    qc.invalidateQueries();
                    navigate("/kbs", { replace: true });
                  }}
                >
                  {(ws.workspaces || []).length ? (
                    (ws.workspaces || []).map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.id})
                      </option>
                    ))
                  ) : (
                    <option value={ws.workspaceId}>{ws.workspaceId}</option>
                  )}
                </Select>
                <Select
                  value={currentNav}
                  onChange={(e) => {
                    navigate(e.target.value);
                  }}
                >
                  {navGroups.flatMap((group, groupIdx) =>
                    group.items.map((it) => (
                      <option key={`${groupIdx}-${it.to}`} value={it.to}>
                        {group.title ? `${group.title} / ${it.label}` : it.label}
                      </option>
                    ))
                  )}
                </Select>
              </div>
              <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
                <Breadcrumb items={breadcrumbItems} />
                {breadcrumbItems.length > 0 && <Separator orientation="vertical" className="h-4" />}
                <span className="truncate">
                  工作区：<span className="font-mono">{wsLabel}</span>
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearToken();
                navigate("/login", { replace: true });
              }}
            >
              <LogOut />
              退出
            </Button>
          </header>

          <main className="mx-auto w-full max-w-[1200px] flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
