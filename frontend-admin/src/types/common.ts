/**
 * 通用分页响应结构
 */
export interface PaginatedResponse<T> {
  page: number;
  page_size: number;
  total: number;
  items: T[];
}

/**
 * 通用操作响应
 */
export interface OkResponse {
  ok: boolean;
}

/**
 * 通用列表响应（无分页）
 */
export interface ListResponse<T> {
  items: T[];
}
