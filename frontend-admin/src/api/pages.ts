/**
 * 页面/内容相关 API
 */

import { adminPath, get, post, del, buildQuery } from "./client";
import type { PagesResponse, PageDetail, TriggerJobResponse, OkResponse } from "../types";

export interface ListPagesParams {
  page?: number;
  page_size?: number;
  kb_id?: string;
  source_id?: string;
  indexed?: boolean;
  changed?: boolean;
  http_status?: string;
  q?: string;
  date_range?: string;
}

export function listPages(workspaceId: string, params: ListPagesParams = {}): Promise<PagesResponse> {
  const query = buildQuery({
    page: params.page,
    page_size: params.page_size,
    kb_id: params.kb_id,
    source_id: params.source_id,
    indexed: params.indexed,
    changed: params.changed,
    http_status: params.http_status,
    q: params.q,
    date_range: params.date_range,
  });
  return get(`${adminPath(workspaceId, "/pages")}${query ? `?${query}` : ""}`);
}

export function getPage(workspaceId: string, pageId: number): Promise<PageDetail> {
  return get(adminPath(workspaceId, `/pages/${pageId}`));
}

export function recrawlPage(workspaceId: string, pageId: number): Promise<TriggerJobResponse> {
  return post(adminPath(workspaceId, `/pages/${pageId}/recrawl`));
}

export function reindexPage(workspaceId: string, pageId: number): Promise<TriggerJobResponse> {
  return post(adminPath(workspaceId, `/pages/${pageId}/reindex`));
}

export function deletePage(workspaceId: string, pageId: number): Promise<OkResponse> {
  return del(adminPath(workspaceId, `/pages/${pageId}`));
}
