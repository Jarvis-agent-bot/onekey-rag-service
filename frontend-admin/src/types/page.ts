import type { PaginatedResponse } from "./common";

/**
 * 页面/内容列表项
 */
export interface PageListItem {
  id: number;
  kb_id: string;
  source_id: string;
  url: string;
  title: string;
  http_status: number;
  last_crawled_at: string | null;
  indexed: boolean;
  changed: boolean;
}

/**
 * 页面详情
 */
export interface PageDetail extends PageListItem {
  content_hash: string;
  indexed_content_hash: string;
  content_preview: string;
  meta: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * 页面列表响应
 */
export type PagesResponse = PaginatedResponse<PageListItem>;

/**
 * 文档片段
 */
export interface Chunk {
  id: string;
  page_id: number;
  content: string;
  embedding_status: string;
  meta: Record<string, unknown>;
}
