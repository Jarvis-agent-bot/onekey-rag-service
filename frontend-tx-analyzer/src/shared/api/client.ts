import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ChainInfo,
  HealthResponse,
  ParseResponse,
  DecodeCalldataRequest,
  DecodeCalldataResponse,
  SimulateRequest,
  SimulateResponse,
  DecodeSignatureRequest,
  DecodeSignatureResponse,
  SmartAnalyzeRequest,
  SmartAnalyzeResponse,
} from './types'

const API_BASE = '/tx-analyzer/api'

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    let errorData: unknown
    try {
      errorData = await response.json()
    } catch {
      errorData = await response.text()
    }
    throw new ApiError(
      `API Error: ${response.statusText}`,
      response.status,
      errorData
    )
  }

  return response.json()
}

export const api = {
  // Health check
  healthCheck: () => request<HealthResponse>('/healthz'),

  // Get supported chains
  getChains: () => request<ChainInfo[]>('/v1/chains'),

  // Parse transaction (without RAG)
  parseTransaction: (chainId: number, txHash: string) =>
    request<ParseResponse>('/v1/tx/parse', {
      method: 'POST',
      body: JSON.stringify({
        chain_id: chainId,
        tx_hash: txHash,
      }),
    }),

  // Analyze transaction (with RAG)
  analyzeTransaction: (req: AnalyzeRequest) =>
    request<AnalyzeResponse>('/v1/tx/analyze', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  // ==================== 新增 API ====================

  // Decode calldata
  decodeCalldata: (req: DecodeCalldataRequest) =>
    request<DecodeCalldataResponse>('/v1/decode', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  // Simulate transaction
  simulateTransaction: (req: SimulateRequest) =>
    request<SimulateResponse>('/v1/simulate', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  // Decode signature
  decodeSignature: (req: DecodeSignatureRequest) =>
    request<DecodeSignatureResponse>('/v1/signature/decode', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  // Smart analyze (auto-detect input type)
  smartAnalyze: (req: SmartAnalyzeRequest) =>
    request<SmartAnalyzeResponse>('/v1/smart-analyze', {
      method: 'POST',
      body: JSON.stringify(req),
    }),
}

export { ApiError }
