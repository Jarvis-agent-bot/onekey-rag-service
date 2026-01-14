/**
 * 任务相关 API
 */

import { adminPath, get, post, buildQuery } from "./client";
import type { JobsResponse, JobDetail, TriggerJobResponse, OkResponse } from "../types";

export interface ListJobsParams {
  page?: number;
  page_size?: number;
  kb_id?: string;
  app_id?: string;
  source_id?: string;
  type?: string;
  status?: string;
  q?: string;
}

export function listJobs(workspaceId: string, params: ListJobsParams = {}): Promise<JobsResponse> {
  const query = buildQuery({
    page: params.page,
    page_size: params.page_size,
    kb_id: params.kb_id,
    app_id: params.app_id,
    source_id: params.source_id,
    type: params.type,
    status: params.status,
    q: params.q,
  });
  return get(`${adminPath(workspaceId, "/jobs")}${query ? `?${query}` : ""}`);
}

export function getJob(workspaceId: string, jobId: string): Promise<JobDetail> {
  return get(adminPath(workspaceId, `/jobs/${jobId}`));
}

export interface TriggerJobPayload {
  kb_id: string;
  source_id: string;
  kind: string;
  base_url?: string;
  sitemap_url?: string;
  seed_urls?: string[];
  include_patterns?: string[];
  exclude_patterns?: string[];
}

export function triggerJob(workspaceId: string, payload: TriggerJobPayload): Promise<TriggerJobResponse> {
  return post(adminPath(workspaceId, "/jobs/trigger"), payload);
}

export function requeueJob(workspaceId: string, jobId: string): Promise<OkResponse> {
  return post(adminPath(workspaceId, `/jobs/${jobId}/requeue`));
}

export function cancelJob(workspaceId: string, jobId: string): Promise<OkResponse> {
  return post(adminPath(workspaceId, `/jobs/${jobId}/cancel`));
}
