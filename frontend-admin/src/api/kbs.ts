/**
 * 知识库相关 API
 */

import { adminPath, get, post, patch, del, buildQuery } from "./client";
import type {
  KbDetail,
  KbsResponse,
  KbStats,
  SourcesResponse,
  Source,
  ReferencedByResponse,
  FileBatchListResponse,
  FileBatchDetailResponse,
  OkResponse,
} from "../types";

// ============ 知识库 ============

export interface ListKbsParams {
  page?: number;
  page_size?: number;
  q?: string;
  status?: string;
}

export function listKbs(workspaceId: string, params: ListKbsParams = {}): Promise<KbsResponse> {
  const query = buildQuery({
    page: params.page,
    page_size: params.page_size,
    q: params.q,
    status: params.status,
  });
  return get(`${adminPath(workspaceId, "/kbs")}${query ? `?${query}` : ""}`);
}

export function getKb(workspaceId: string, kbId: string): Promise<KbDetail> {
  return get(adminPath(workspaceId, `/kbs/${kbId}`));
}

export function getKbStats(workspaceId: string, kbId: string): Promise<KbStats> {
  return get(adminPath(workspaceId, `/kbs/${kbId}/stats`));
}

export interface CreateKbPayload {
  name: string;
  description?: string;
  config?: Record<string, unknown>;
}

export function createKb(workspaceId: string, payload: CreateKbPayload): Promise<{ id: string }> {
  return post(adminPath(workspaceId, "/kbs"), payload);
}

export interface UpdateKbPayload {
  name?: string;
  description?: string;
  status?: string;
  config?: Record<string, unknown>;
}

export function updateKb(workspaceId: string, kbId: string, payload: UpdateKbPayload): Promise<OkResponse> {
  return patch(adminPath(workspaceId, `/kbs/${kbId}`), payload);
}

export function deleteKb(workspaceId: string, kbId: string): Promise<OkResponse> {
  return del(adminPath(workspaceId, `/kbs/${kbId}`));
}

export function getKbReferencedBy(workspaceId: string, kbId: string): Promise<ReferencedByResponse> {
  return get(adminPath(workspaceId, `/kbs/${kbId}/referenced-by`));
}

// ============ 数据源 ============

export function listSources(workspaceId: string, kbId: string): Promise<SourcesResponse> {
  return get(adminPath(workspaceId, `/kbs/${kbId}/sources`));
}

export interface CreateSourcePayload {
  name: string;
  type: string;
  config: Record<string, unknown>;
}

export function createSource(workspaceId: string, kbId: string, payload: CreateSourcePayload): Promise<{ id: string }> {
  return post(adminPath(workspaceId, `/kbs/${kbId}/sources`), payload);
}

export interface UpdateSourcePayload {
  name?: string;
  status?: string;
  config?: Record<string, unknown>;
}

export function updateSource(workspaceId: string, kbId: string, sourceId: string, payload: UpdateSourcePayload): Promise<OkResponse> {
  return patch(adminPath(workspaceId, `/kbs/${kbId}/sources/${sourceId}`), payload);
}

export function deleteSource(workspaceId: string, kbId: string, sourceId: string): Promise<OkResponse> {
  return del(adminPath(workspaceId, `/kbs/${kbId}/sources/${sourceId}`));
}

// ============ 文件批次 ============

export function listFileBatches(workspaceId: string, kbId: string): Promise<FileBatchListResponse> {
  return get(adminPath(workspaceId, `/kbs/${kbId}/files`));
}

export function getFileBatch(workspaceId: string, kbId: string, batchId: string): Promise<FileBatchDetailResponse> {
  return get(adminPath(workspaceId, `/kbs/${kbId}/files/${batchId}`));
}
