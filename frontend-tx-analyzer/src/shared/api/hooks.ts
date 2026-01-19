import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  DecodeCalldataRequest,
  SimulateRequest,
  DecodeSignatureRequest,
  SmartAnalyzeRequest,
} from './types'

// Query keys
export const queryKeys = {
  health: ['health'] as const,
  chains: ['chains'] as const,
  analysis: (traceId: string) => ['analysis', traceId] as const,
}

// Health check
export function useHealthCheck() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: api.healthCheck,
    refetchInterval: 30 * 1000, // 30 seconds
    staleTime: 10 * 1000,
  })
}

// Get supported chains
export function useChains() {
  return useQuery({
    queryKey: queryKeys.chains,
    queryFn: api.getChains,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Analyze transaction mutation
export function useAnalyzeTransaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: AnalyzeRequest) => api.analyzeTransaction(request),
    onSuccess: (data: AnalyzeResponse) => {
      // Cache the result
      queryClient.setQueryData(queryKeys.analysis(data.trace_id), data)
    },
  })
}

// Parse transaction mutation (without RAG)
export function useParseTransaction() {
  return useMutation({
    mutationFn: ({ chainId, txHash }: { chainId: number; txHash: string }) =>
      api.parseTransaction(chainId, txHash),
  })
}

// ==================== 新增 Hooks ====================

// Decode calldata mutation
export function useDecodeCalldata() {
  return useMutation({
    mutationFn: (request: DecodeCalldataRequest) => api.decodeCalldata(request),
  })
}

// Simulate transaction mutation
export function useSimulateTransaction() {
  return useMutation({
    mutationFn: (request: SimulateRequest) => api.simulateTransaction(request),
  })
}

// Decode signature mutation
export function useDecodeSignature() {
  return useMutation({
    mutationFn: (request: DecodeSignatureRequest) => api.decodeSignature(request),
  })
}

// Smart analyze mutation (auto-detect input type)
export function useSmartAnalyze() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: SmartAnalyzeRequest) => api.smartAnalyze(request),
    onSuccess: (data) => {
      // Cache the result
      queryClient.setQueryData(['smart-analysis', data.trace_id], data)
    },
  })
}
