import type { ListResponse, PaginatedResponse } from "./common";

/**
 * 知识库基础信息
 */
export interface KbBase {
  id: string;
  name: string;
  status: string;
}

/**
 * 知识库详情
 */
export interface KbDetail extends KbBase {
  description: string;
  config: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * 知识库统计信息
 */
export interface KbStats {
  pages: { total: number; indexed: number; changed: number; error: number };
  chunks: { total: number; embedding_coverage: number };
  sources: { total: number };
}

/**
 * 知识库列表项
 */
export interface KbListItem extends KbBase {
  description: string;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * 知识库列表响应
 */
export type KbsResponse = PaginatedResponse<KbListItem>;

/**
 * 知识库简单列表响应（用于下拉选择等）
 */
export type KbsSimpleResponse = ListResponse<KbBase>;

/**
 * 数据源配置
 */
export interface SourceConfig {
  base_url?: string;
  sitemap_url?: string;
  seed_urls?: string[];
  include_patterns?: string[];
  exclude_patterns?: string[];
  [key: string]: unknown;
}

/**
 * 数据源
 */
export interface Source {
  id: string;
  name: string;
  type: string;
  status: string;
  config: SourceConfig;
  kb_id: string;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * 数据源列表响应
 */
export type SourcesResponse = ListResponse<Source>;

/**
 * 知识库被引用信息
 */
export interface ReferencedByItem {
  app_id: string;
  name: string;
  public_model_id: string;
}

export interface ReferencedByResponse {
  total: number;
  items: ReferencedByItem[];
}

/**
 * 文件批次
 */
export interface FileBatch {
  id: string;
  status: string;
  kb_id: string;
  total_files: number;
  processed_files: number;
  error: string;
  created_at: string | null;
  updated_at: string | null;
}

export type FileBatchListResponse = ListResponse<FileBatch>;

/**
 * 文件批次详情项
 */
export interface FileBatchItem {
  id: string;
  filename: string;
  size_bytes: number;
  status: string;
  error: string;
  page_id?: number;
  chunk_count?: number | null;
  chunk_preview?: string | null;
}

export interface FileBatchDetailResponse {
  id: string;
  status: string;
  error: string;
  kb_id: string;
  items: FileBatchItem[];
}
