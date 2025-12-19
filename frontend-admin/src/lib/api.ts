import { getToken, clearToken } from "./auth";

export class ApiError extends Error {
  status: number;
  url: string;
  bodyText: string;

  constructor(message: string, opts: { status: number; url: string; bodyText: string }) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.url = opts.url;
    this.bodyText = opts.bodyText;
  }
}

function extractErrorMessage(text: string): string {
  const raw = (text || "").trim();
  if (!raw) return "";
  try {
    const v = JSON.parse(raw);
    if (typeof v === "string") return v;
    if (v && typeof v === "object") {
      const detail = (v as any).detail ?? (v as any).message ?? (v as any).error;
      if (typeof detail === "string") return detail;
      if (detail != null) return JSON.stringify(detail);
    }
  } catch {
    // ignore
  }
  return raw;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  headers.set("content-type", headers.get("content-type") || "application/json");

  const token = getToken();
  if (token) headers.set("authorization", `Bearer ${token}`);

  const resp = await fetch(path, { ...init, headers });
  if (resp.status === 401) {
    clearToken();
    // 兜底：localStorage 变更不会触发 React 重新渲染，直接跳回登录页避免“卡在后台但一直 401”
    if (window.location.hash !== "#/login") window.location.hash = "#/login";
    throw new Error("未登录或登录已过期");
  }
  if (!resp.ok) {
    const text = await resp.text();
    const msg = extractErrorMessage(text) || `请求失败: ${resp.status}`;
    throw new ApiError(msg, { status: resp.status, url: path, bodyText: text || "" });
  }
  return (await resp.json()) as T;
}
