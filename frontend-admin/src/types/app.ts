import type { ListResponse, PaginatedResponse } from "./common";

/**
 * 应用基础信息
 */
export interface AppBase {
  id: string;
  name: string;
  public_model_id: string;
}

/**
 * 应用详情
 */
export interface AppDetail extends AppBase {
  description: string;
  config: Record<string, unknown>;
  status: string;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * 应用列表项
 */
export interface AppListItem extends AppBase {
  description: string;
  status: string;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * 应用列表响应
 */
export type AppsResponse = PaginatedResponse<AppListItem>;

/**
 * 应用简单列表响应（用于下拉选择等）
 */
export type AppsSimpleResponse = ListResponse<AppBase>;

/**
 * 应用绑定的知识库
 */
export interface AppKb {
  kb_id: string;
  name: string;
  status: string;
  priority: number;
}

export type AppKbsResponse = ListResponse<AppKb>;
