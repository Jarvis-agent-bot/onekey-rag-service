import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ChainInfo,
  HealthResponse,
  ParseResponse,
} from './types'

const API_BASE = '/api'

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
}

export { ApiError }
