/**
 * API 客户端基础模块
 * 封装 apiFetch 并提供便捷方法
 */

import { apiFetch, ApiError } from "../lib/api";

export { apiFetch, ApiError };

/**
 * 构建带工作区前缀的 API 路径
 */
export function adminPath(workspaceId: string, path: string): string {
  return `/admin/api/workspaces/${workspaceId}${path}`;
}

/**
 * GET 请求
 */
export function get<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

/**
 * POST 请求
 */
export function post<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PATCH 请求
 */
export function patch<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "PATCH",
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE 请求
 */
export function del<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" });
}

/**
 * 构建查询字符串
 */
export function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") {
      sp.set(k, String(v));
    }
  }
  return sp.toString();
}
