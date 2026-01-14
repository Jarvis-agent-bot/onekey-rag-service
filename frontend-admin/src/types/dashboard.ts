/**
 * 总览摘要响应
 */
export interface SummaryResponse {
  kbs: { total: number; active: number };
  apps: { total: number };
  pages: { total: number; indexed: number; changed: number; error: number };
  jobs: { recent: number; failed: number };
}

/**
 * 告警项
 */
export interface AlertItem {
  severity: string;
  code: string;
  title: string;
  detail: string;
  value: unknown;
}

/**
 * 告警响应
 */
export interface AlertsResponse {
  from: string;
  to: string;
  items: AlertItem[];
}

/**
 * 观测摘要响应
 */
export interface ObsSummaryResponse {
  date_range: string;
  retrieval_events: {
    total: number;
    error_count: number;
    avg_latency_ms: number | null;
    p95_latency_ms: number | null;
    max_latency_ms: number | null;
    by_error_code: Record<string, number>;
  };
}

/**
 * 系统信息响应
 */
export interface SystemResponse {
  version: string;
  build_time: string | null;
  python_version: string;
  env: string;
  host: string;
  features: Record<string, boolean>;
  container?: {
    cpu_percent?: number | null;
    mem_used_pct?: number | null;
    mem_limit_mb?: number | null;
  };
}

/**
 * 存储信息响应
 */
export interface StorageResponse {
  db_size_mb: number;
  vector_size_mb: number;
  chunks_total: number;
  chunks_with_embedding: number;
}
