/**
 * 工作区健康状态
 */
export interface WorkspaceHealth {
  status: string;
  dependencies: Record<string, unknown>;
}

/**
 * 工作区设置
 */
export interface WorkspaceSettings {
  retrieval?: {
    rag_top_k?: number;
  };
  [key: string]: unknown;
}

/**
 * 模型信息
 */
export interface ModelInfo {
  id: string;
  meta?: Record<string, unknown>;
}

/**
 * 模型列表响应
 */
export interface ModelsResponse {
  object: string;
  data: ModelInfo[];
}

/**
 * 模型测试结果
 */
export interface ModelTestResult {
  ok?: boolean;
  latency_ms?: number;
  error?: string;
  [key: string]: unknown;
}

/**
 * 模型测试响应
 */
export interface ModelTestResponse {
  ok: boolean;
  kind: string;
  result?: ModelTestResult;
  results?: Record<string, ModelTestResult>;
}

/**
 * 登录响应
 */
export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}
