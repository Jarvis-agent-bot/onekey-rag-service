import { useEffect, useState } from 'react'
import { History, Shield, ExternalLink } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ChevronDown } from 'lucide-react'
import { CHAIN_INFO } from '@/lib/constants'
import type { SmartAnalyzeResponse, InputType } from '@/api/types'

// 新的核心组件
import {
  TransactionSummary,
  AssetChanges,
  SearchFlowCompact,
  RagDetails,
  MethodDetail,
  EventList,
  SmartInput,
  CalldataResult,
  SignatureResult,
} from '@/features/analyze'

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

  // Load history on mount and check for URL params
  useEffect(() => {
    loadHistory()

    // Auto-analyze from URL parameters
    const params = new URLSearchParams(window.location.search)
    const txHash = params.get('tx')
    const chainParam = params.get('chain')

    if (txHash && txHash.startsWith('0x') && txHash.length === 66) {
      const chainId = chainParam ? parseInt(chainParam) : 1
      handleSmartAnalyze({
        input: txHash,
        inputType: 'tx_hash',
        chainId,
        options: {
          includeExplanation: true,
          includeTrace: true,
        },
      })
    }
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
      includeSimulation?: boolean
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
            include_simulation: data.options.includeSimulation ?? false,
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
          <div className="mt-6 space-y-4">
            {/* 执行流程 - 紧凑模式，默认折叠 */}
            <SearchFlowCompact
              steps={smartResult.trace_log ?? null}
              timings={smartResult.timings}
            />

            {/* Transaction Result */}
            {smartResult.input_type === 'tx_hash' && smartResult.tx_result && (
              <>
                {/* 核心信息：交易摘要 (合并了风险+概览) */}
                <TransactionSummary
                  result={smartResult.tx_result}
                  explanation={smartResult.explanation}
                />

                {/* 资产变化 (统一展示) */}
                <AssetChanges
                  explanation={smartResult.explanation}
                  simulation={smartResult.simulation_result}
                />

                {/* 技术详情 - 可折叠 */}
                <TechDetailsSection
                  txResult={smartResult.tx_result}
                  explanation={smartResult.explanation}
                />
              </>
            )}

            {/* Calldata Result */}
            {smartResult.input_type === 'calldata' && smartResult.decode_result && (
              <>
                {/* 资产变化 (优先显示模拟结果) */}
                <AssetChanges
                  simulation={smartResult.simulation_result}
                  calldataAssets={smartResult.decode_result.asset_changes_from_simulation}
                />

                {/* Calldata 解码结果 */}
                <CalldataResult result={smartResult.decode_result} formatted={null} />

                {/* RAG 详情 */}
                <RagDetails explanation={smartResult.explanation} />
              </>
            )}

            {/* Signature Result */}
            {smartResult.input_type === 'signature' && smartResult.signature_result && (
              <>
                <SignatureResult result={smartResult.signature_result} summary={null} />
                <RagDetails explanation={smartResult.explanation} />
              </>
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
        {!isLoading && !smartResult && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <History className="h-4 w-4" />
              <span className="font-medium">最近分析</span>
            </div>
            {history.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-3">
                {history.slice(0, 10).map((item, i) => (
                  <button
                    key={i}
                    className="text-left p-4 rounded-lg border hover:bg-accent transition-colors"
                    onClick={() => {
                      handleSmartAnalyze({
                        input: item.txHash,
                        inputType: 'tx_hash',
                        chainId: item.chainId,
                        options: {
                          includeExplanation: true,
                          includeTrace: true,
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
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">暂无历史记录</p>
                <p className="text-xs mt-1">分析交易后会自动保存到历史</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** 技术详情折叠区域 */
function TechDetailsSection({
  txResult,
  explanation,
}: {
  txResult: SmartAnalyzeResponse['tx_result']
  explanation: SmartAnalyzeResponse['explanation']
}) {
  const [isOpen, setIsOpen] = useState(false)

  if (!txResult) return null

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full flex items-center justify-between p-4 h-auto border rounded-lg hover:bg-muted/50"
        >
          <span className="text-sm font-medium">技术详情</span>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-xs">
              方法 · 事件({txResult.events.length}) · AI 分析
            </span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </div>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <Tabs defaultValue="method" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="method">方法详情</TabsTrigger>
            <TabsTrigger value="events">
              事件 ({txResult.events.length})
            </TabsTrigger>
            <TabsTrigger value="rag">AI 分析</TabsTrigger>
          </TabsList>
          <TabsContent value="method" className="mt-4">
            <MethodDetail
              method={txResult.method}
              inputData={txResult.input}
              diagnostics={txResult.diagnostics}
            />
          </TabsContent>
          <TabsContent value="events" className="mt-4">
            <EventList
              events={txResult.events}
              chainId={txResult.chain_id}
              diagnostics={txResult.diagnostics}
            />
          </TabsContent>
          <TabsContent value="rag" className="mt-4">
            <RagDetails explanation={explanation} />
          </TabsContent>
        </Tabs>
      </CollapsibleContent>
    </Collapsible>
  )
}
