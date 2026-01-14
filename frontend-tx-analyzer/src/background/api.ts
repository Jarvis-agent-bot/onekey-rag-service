import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ChainInfo,
  HealthResponse,
  ParseResponse,
} from '@/api/types'
import { getSettings } from './storage'

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

const REQUEST_TIMEOUT_MS = 60000

async function getApiBase(): Promise<string> {
  const settings = await getSettings()
  return settings.apiEndpoint
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const apiBase = await getApiBase()
  const url = `${apiBase}${endpoint}`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response

  try {
    response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('请求超时，请稍后重试', 408)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }

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
