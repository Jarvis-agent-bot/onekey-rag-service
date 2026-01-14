import type { PaginatedResponse } from "./common";

/**
 * 检索事件列表项
 */
export interface RetrievalEventListItem {
  id: number;
  app_id: string;
  kb_ids: string[];
  request_id: string;
  conversation_id: string;
  message_id: string;
  timings_ms: Record<string, unknown>;
  created_at: string | null;
  has_error: boolean;
  error_code: string;
}

/**
 * 检索事件详情
 */
export interface RetrievalEventDetail extends RetrievalEventListItem {
  query: string;
  chunks: Array<{
    chunk_id: string;
    score: number;
    content_preview: string;
  }>;
  meta: Record<string, unknown>;
}

/**
 * 检索事件列表响应
 */
export type RetrievalEventsResponse = PaginatedResponse<RetrievalEventListItem>;

/**
 * 时序数据点
 */
export interface TimeseriesPoint {
  ts: string;
  cpu_percent?: number | null;
  mem_used_pct?: number | null;
  net_rx_bytes?: number | null;
  net_tx_bytes?: number | null;
  disk_read_bytes?: number | null;
  disk_write_bytes?: number | null;
}

/**
 * 指标响应
 */
export interface MetricsResponse {
  date_range: string;
  degraded: boolean;
  container: Record<string, unknown>;
  net?: Record<string, unknown> | null;
  disk?: Record<string, unknown> | null;
  host?: Record<string, unknown> | null;
  timeseries?: TimeseriesPoint[];
}
