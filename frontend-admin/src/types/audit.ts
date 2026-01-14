import type { PaginatedResponse } from "./common";

/**
 * 审计日志列表项
 */
export interface AuditLogItem {
  id: number;
  actor: string;
  action: string;
  object_type: string;
  object_id: string;
  meta: Record<string, unknown>;
  created_at: string | null;
}

/**
 * 审计日志响应
 */
export type AuditLogsResponse = PaginatedResponse<AuditLogItem>;

/**
 * 审计对象类型
 */
export type AuditObjectType = "kb" | "source" | "app" | "page" | "job";
