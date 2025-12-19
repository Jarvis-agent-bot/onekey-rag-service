import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { apiFetch } from "./api";
import { useMe } from "./useMe";

const LS_KEY = "onekey_admin_workspace_id";

export type WorkspaceItem = { id: string; name: string };

type WorkspaceContextValue = {
  workspaceId: string;
  workspaces: WorkspaceItem[];
  setWorkspaceId: (id: string) => void;
  isLoading: boolean;
  error: unknown;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider(props: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useMe();

  const defaultWorkspaceId = me.data?.workspace_id || "default";
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_KEY) || "";
    } catch {
      return "";
    }
  });

  const list = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => apiFetch<WorkspaceItem[]>("/admin/api/workspaces"),
    enabled: !!me.data,
  });

  const effectiveWorkspaceId = useMemo(() => {
    return (selectedWorkspaceId || defaultWorkspaceId || "default").trim() || "default";
  }, [selectedWorkspaceId, defaultWorkspaceId]);

  useEffect(() => {
    if (!me.data) return;

    // 初始化：没有选择时，默认用 me.workspace_id
    if (!selectedWorkspaceId) {
      try {
        localStorage.setItem(LS_KEY, defaultWorkspaceId);
      } catch {
        // ignore
      }
      setSelectedWorkspaceId(defaultWorkspaceId);
      return;
    }

    // 兜底：如果选中的 workspace 不存在，则回落到默认 workspace
    if (list.data && !list.data.some((w) => w.id === selectedWorkspaceId)) {
      try {
        localStorage.setItem(LS_KEY, defaultWorkspaceId);
      } catch {
        // ignore
      }
      setSelectedWorkspaceId(defaultWorkspaceId);
    }
  }, [defaultWorkspaceId, list.data, me.data, selectedWorkspaceId]);

  const setWorkspaceId = (id: string) => {
    const next = (id || "").trim();
    if (!next) return;
    setSelectedWorkspaceId(next);
    try {
      localStorage.setItem(LS_KEY, next);
    } catch {
      // ignore
    }
    // 切换 workspace 后，清理缓存避免混淆（queryKey 通常带 workspaceId，但这里做一次兜底）。
    qc.invalidateQueries();
  };

  const value: WorkspaceContextValue = {
    workspaceId: effectiveWorkspaceId,
    workspaces: list.data || [],
    setWorkspaceId,
    isLoading: list.isLoading,
    error: list.error,
  };

  return <WorkspaceContext.Provider value={value}>{props.children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

