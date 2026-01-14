/**
 * 审计日志相关 API
 */

import { adminPath, get, buildQuery } from "./client";
import type { AuditLogsResponse } from "../types";

export interface ListAuditLogsParams {
  page?: number;
  page_size?: number;
  actor?: string;
  action?: string;
  object_type?: string;
  object_id?: string;
  date_range?: string;
}

export function listAuditLogs(workspaceId: string, params: ListAuditLogsParams = {}): Promise<AuditLogsResponse> {
  const query = buildQuery({
    page: params.page,
    page_size: params.page_size,
    actor: params.actor,
    action: params.action,
    object_type: params.object_type,
    object_id: params.object_id,
    date_range: params.date_range,
  });
  return get(`${adminPath(workspaceId, "/audit-logs")}${query ? `?${query}` : ""}`);
}
