/**
 * 应用相关 API
 */

import { adminPath, get, post, patch, del, buildQuery } from "./client";
import type { AppsResponse, AppDetail, AppKbsResponse, OkResponse } from "../types";

export interface ListAppsParams {
  page?: number;
  page_size?: number;
  q?: string;
  status?: string;
}

export function listApps(workspaceId: string, params: ListAppsParams = {}): Promise<AppsResponse> {
  const query = buildQuery({
    page: params.page,
    page_size: params.page_size,
    q: params.q,
    status: params.status,
  });
  return get(`${adminPath(workspaceId, "/apps")}${query ? `?${query}` : ""}`);
}

export function getApp(workspaceId: string, appId: string): Promise<AppDetail> {
  return get(adminPath(workspaceId, `/apps/${appId}`));
}

export interface CreateAppPayload {
  name: string;
  description?: string;
  public_model_id?: string;
  config?: Record<string, unknown>;
}

export function createApp(workspaceId: string, payload: CreateAppPayload): Promise<{ id: string }> {
  return post(adminPath(workspaceId, "/apps"), payload);
}

export interface UpdateAppPayload {
  name?: string;
  description?: string;
  status?: string;
  config?: Record<string, unknown>;
}

export function updateApp(workspaceId: string, appId: string, payload: UpdateAppPayload): Promise<OkResponse> {
  return patch(adminPath(workspaceId, `/apps/${appId}`), payload);
}

export function deleteApp(workspaceId: string, appId: string): Promise<OkResponse> {
  return del(adminPath(workspaceId, `/apps/${appId}`));
}

// ============ 应用知识库绑定 ============

export function listAppKbs(workspaceId: string, appId: string): Promise<AppKbsResponse> {
  return get(adminPath(workspaceId, `/apps/${appId}/kbs`));
}

export interface BindKbPayload {
  kb_id: string;
  priority?: number;
}

export function bindKb(workspaceId: string, appId: string, payload: BindKbPayload): Promise<OkResponse> {
  return post(adminPath(workspaceId, `/apps/${appId}/kbs`), payload);
}

export function unbindKb(workspaceId: string, appId: string, kbId: string): Promise<OkResponse> {
  return del(adminPath(workspaceId, `/apps/${appId}/kbs/${kbId}`));
}
