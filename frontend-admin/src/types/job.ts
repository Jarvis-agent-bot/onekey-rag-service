import type { PaginatedResponse } from "./common";

/**
 * 任务进度信息
 */
export interface JobProgress {
  [key: string]: unknown;
}

/**
 * 任务列表项
 */
export interface JobListItem {
  id: string;
  type: string;
  status: string;
  kb_id: string;
  app_id: string;
  source_id: string;
  progress: JobProgress;
  error: string;
  started_at: string | null;
  finished_at: string | null;
}

/**
 * 任务详情
 */
export interface JobDetail extends JobListItem {
  config: Record<string, unknown>;
  result: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * 任务列表响应
 */
export type JobsResponse = PaginatedResponse<JobListItem>;

/**
 * 触发任务响应
 */
export interface TriggerJobResponse {
  job_id: string;
}
