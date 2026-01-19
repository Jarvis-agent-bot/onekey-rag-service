import { useState, useEffect } from 'react'
import { History, Shield, ExternalLink, Zap } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { CHAIN_INFO } from '@/lib/constants'
import type { SmartAnalyzeResponse, InputType } from '@/api/types'

// Import existing analysis components
import { ResultOverview } from '@/features/analyze/ResultOverview'
import { RiskAssessment } from '@/features/analyze/RiskAssessment'
import { MethodDetail } from '@/features/analyze/MethodDetail'
import { EventList } from '@/features/analyze/EventList'
import { RagExplanation } from '@/features/analyze/RagExplanation'
import { TraceTimeline } from '@/features/analyze/TraceTimeline'

// Import smart analyze components
import { SmartInput } from '@/features/analyze/SmartInput'
import { CalldataResult } from '@/features/analyze/CalldataResult'
import { SignatureResult } from '@/features/analyze/SignatureResult'

// API base URL - always use relative path for production (nginx proxy)
// In development mode only, can use VITE_TX_ANALYZER_WEB_API_URL for direct API calls
const API_BASE_URL = import.meta.env.MODE === 'development'
  ? (import.meta.env.VITE_TX_ANALYZER_WEB_API_URL || '/tx-analyzer/api')
  : '/tx-analyzer/api'

const HISTORY_KEY = 'tx_analyzer_web_history'

interface HistoryItem {
  chainId: number
  txHash: string
  timestamp: number
}

export function WebApp() {
  const [isLoading, setIsLoading] = useState(false)
  const [smartResult, setSmartResult] = useState<SmartAnalyzeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])

  // Load history on mount
  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = () => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY)
      if (stored) {
        setHistory(JSON.parse(stored))
      }
    } catch (e) {
      console.error('Failed to load history:', e)
    }
  }

  const saveToHistory = (chainId: number, txHash: string) => {
    const newItem: HistoryItem = {
      chainId,
      txHash,
      timestamp: Date.now(),
    }

    const updated = [newItem, ...history.filter(h => h.txHash !== txHash)].slice(0, 20)
    setHistory(updated)

    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
    } catch (e) {
      console.error('Failed to save history:', e)
    }
  }

  // Smart analyze handler
  const handleSmartAnalyze = async (data: {
    input: string
    inputType: InputType
    chainId: number
    context?: {
      to_address?: string
      from_address?: string
      value?: string
    }
    options: {
      includeExplanation: boolean
      includeTrace: boolean
    }
  }) => {
    setError(null)
    setIsLoading(true)
    setSmartResult(null)

    try {
      const response = await fetch(`${API_BASE_URL}/v1/smart-analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: data.input,
          chain_id: data.chainId,
          context: data.context,
          options: {
            include_explanation: data.options.includeExplanation,
            include_trace: data.options.includeTrace,
            language: 'zh',
          },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }

      const responseData: SmartAnalyzeResponse = await response.json()
      setSmartResult(responseData)

      // Update URL for sharing (only for tx_hash type)
      if (data.inputType === 'tx_hash') {
        const newUrl = new URL(window.location.href)
        newUrl.searchParams.set('tx', data.input)
        newUrl.searchParams.set('chain', String(data.chainId))
        window.history.replaceState({}, '', newUrl.toString())
        saveToHistory(data.chainId, data.input)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-background z-10">
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          <span className="font-semibold text-lg">Web3 Transaction Analyzer</span>
        </div>
        <a
          href="https://onekey.so"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
        >
          OneKey <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Main Content */}
      <div className="flex-1 container max-w-4xl mx-auto px-4 py-6">
        {/* Smart Input */}
        <SmartInput onSubmit={handleSmartAnalyze} isLoading={isLoading} />

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-[200px] w-full" />
            <Skeleton className="h-[150px] w-full" />
          </div>
        )}

        {/* Smart Analyze Results */}
        {smartResult && (
          <div className="mt-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">分析结果</h2>
              <span className="text-xs text-muted-foreground">
                Trace ID: {smartResult.trace_id}
              </span>
            </div>

            <Separator />

            {/* Transaction Result */}
            {smartResult.input_type === 'tx_hash' && smartResult.tx_result && (
              <>
                <div className="grid md:grid-cols-2 gap-4">
                  <RiskAssessment
                    explanation={smartResult.explanation}
                    riskFlags={smartResult.tx_result.risk_flags}
                  />
                  <ResultOverview result={smartResult.tx_result} />
                </div>

                <Tabs defaultValue="method" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="method">方法详情</TabsTrigger>
                    <TabsTrigger value="events">
                      事件 ({smartResult.tx_result.events.length})
                    </TabsTrigger>
                    <TabsTrigger value="explanation">RAG 解释</TabsTrigger>
                    <TabsTrigger value="trace">Trace 追踪</TabsTrigger>
                  </TabsList>
                  <TabsContent value="method" className="mt-4">
                    <MethodDetail
                      method={smartResult.tx_result.method}
                      inputData={smartResult.tx_result.input}
                      diagnostics={smartResult.tx_result.diagnostics}
                    />
                  </TabsContent>
                  <TabsContent value="events" className="mt-4">
                    <EventList
                      events={smartResult.tx_result.events}
                      chainId={smartResult.tx_result.chain_id}
                      diagnostics={smartResult.tx_result.diagnostics}
                    />
                  </TabsContent>
                  <TabsContent value="explanation" className="mt-4">
                    <RagExplanation explanation={smartResult.explanation} />
                  </TabsContent>
                  <TabsContent value="trace" className="mt-4">
                    <TraceTimeline
                      steps={null}
                      timings={smartResult.timings}
                    />
                  </TabsContent>
                </Tabs>
              </>
            )}

            {/* Calldata Result */}
            {smartResult.input_type === 'calldata' && smartResult.decode_result && (
              <CalldataResult result={smartResult.decode_result} formatted={null} />
            )}

            {/* Signature Result */}
            {smartResult.input_type === 'signature' && smartResult.signature_result && (
              <SignatureResult result={smartResult.signature_result} summary={null} />
            )}

            {/* Error from API */}
            {smartResult.error && (
              <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
                <p className="text-sm text-yellow-600">{smartResult.error}</p>
              </div>
            )}
          </div>
        )}

        {/* History */}
        {!isLoading && !smartResult && history.length > 0 && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <History className="h-4 w-4" />
              <span className="font-medium">最近分析</span>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {history.slice(0, 10).map((item, i) => (
                <button
                  key={i}
                  className="text-left p-4 rounded-lg border hover:bg-accent transition-colors"
                  onClick={() => {
                    // Trigger smart analyze with the history item
                    handleSmartAnalyze({
                      input: item.txHash,
                      inputType: 'tx_hash',
                      chainId: item.chainId,
                      options: {
                        includeExplanation: true,
                        includeTrace: false,
                      },
                    })
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: CHAIN_INFO[item.chainId]?.color || '#888' }}
                    />
                    <span className="font-medium">
                      {CHAIN_INFO[item.chainId]?.name || `Chain ${item.chainId}`}
                    </span>
                  </div>
                  <p className="text-sm font-mono text-muted-foreground truncate">
                    {item.txHash}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !smartResult && history.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Zap className="h-16 w-16 text-muted-foreground/50 mb-6" />
            <h3 className="text-lg font-medium mb-2">开始智能分析</h3>
            <p className="text-muted-foreground max-w-md">
              输入交易哈希、Calldata 或 EIP-712 签名数据，获取 AI 驱动的安全分析报告
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="py-6 border-t text-center">
        <p className="text-sm text-muted-foreground">
          由 <a href="https://onekey.so" className="text-primary hover:underline">OneKey</a> RAG 驱动
        </p>
      </div>
    </div>
  )
}
