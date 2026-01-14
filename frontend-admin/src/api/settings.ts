/**
 * 设置相关 API
 */

import { adminPath, get, post, patch } from "./client";
import type {
  WorkspaceHealth,
  WorkspaceSettings,
  ModelsResponse,
  ModelTestResponse,
  LoginResponse,
  OkResponse,
} from "../types";

// ============ 认证 ============

export function login(username: string, password: string): Promise<LoginResponse> {
  const form = new URLSearchParams();
  form.set("username", username);
  form.set("password", password);
  return fetch("/admin/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  }).then(async (resp) => {
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || "登录失败");
    }
    return resp.json() as Promise<LoginResponse>;
  });
}

export function getMe(): Promise<{ user: string }> {
  return get("/admin/api/me");
}

// ============ 工作区 ============

export function listWorkspaces(): Promise<{ items: Array<{ id: string; name: string }> }> {
  return get("/admin/api/workspaces");
}

export function getWorkspaceHealth(workspaceId: string): Promise<WorkspaceHealth> {
  return get(adminPath(workspaceId, "/health"));
}

export function getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings> {
  return get(adminPath(workspaceId, "/settings"));
}

export function updateWorkspaceSettings(workspaceId: string, settings: WorkspaceSettings): Promise<OkResponse> {
  return patch(adminPath(workspaceId, "/settings"), settings);
}

// ============ 模型 ============

export function listModels(workspaceId: string): Promise<ModelsResponse> {
  return get(adminPath(workspaceId, "/models"));
}

export function testModels(workspaceId: string): Promise<ModelTestResponse> {
  return post(adminPath(workspaceId, "/models/test"));
}
