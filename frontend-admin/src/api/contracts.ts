/**
 * 合约索引相关 API
 */

import { apiFetch } from "./client";

export interface ContractStats {
  total_contracts: number;
  by_protocol: Record<string, number>;
}

export interface BuildIndexRequest {
  kb_id?: string | null;
  dry_run?: boolean;
}

export interface BuildIndexResponse {
  chunks_scanned: number;
  addresses_found: number;
  addresses_indexed: number;
  addresses_skipped: number;
  protocols: Record<string, number>;
}

/**
 * 获取合约索引统计信息
 */
export function getContractStats(): Promise<ContractStats> {
  return apiFetch<ContractStats>("/api/v1/contracts/stats/protocols");
}

/**
 * 批量构建合约索引
 */
export function buildContractIndex(request: BuildIndexRequest = {}): Promise<BuildIndexResponse> {
  return apiFetch<BuildIndexResponse>("/api/v1/contracts/build-index", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
