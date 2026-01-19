import { useState, useEffect } from 'react'
import { Search, History, Shield, Loader2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { CHAIN_INFO } from '@/lib/constants'
import type { AnalyzeResponse } from '@/api/types'

// Import existing analysis components
import { ResultOverview } from '@/features/analyze/ResultOverview'
import { RiskAssessment } from '@/features/analyze/RiskAssessment'
import { MethodDetail } from '@/features/analyze/MethodDetail'
import { EventList } from '@/features/analyze/EventList'
import { RagExplanation } from '@/features/analyze/RagExplanation'
import { TraceTimeline } from '@/features/analyze/TraceTimeline'

// API base URL - uses relative path for nginx proxy, or direct URL for development
// In production: /tx-analyzer/api proxies to TX Analyzer API
// In development: can set VITE_TX_ANALYZER_WEB_API_URL to direct API URL
const API_BASE_URL = import.meta.env.VITE_TX_ANALYZER_WEB_API_URL || '/tx-analyzer/api'

const HISTORY_KEY = 'tx_analyzer_web_history'

interface HistoryItem {
  chainId: number
  txHash: string
  timestamp: number
}

export function WebApp() {
  const [chainId, setChainId] = useState<string>('1')
  const [txHash, setTxHash] = useState('')
  const [includeExplanation, setIncludeExplanation] = useState(true)
  const [includeTrace, setIncludeTrace] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])

  // Load history on mount
  useEffect(() => {
    loadHistory()

    // Check URL params for direct analysis
    const params = new URLSearchParams(window.location.search)
    const urlTxHash = params.get('tx') || params.get('txHash')
    const urlChainId = params.get('chain') || params.get('chainId')

    if (urlTxHash) {
      setTxHash(urlTxHash)
      if (urlChainId) {
        setChainId(urlChainId)
      }
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

  const handleAnalyze = async () => {
    if (!txHash.trim()) {
      setError('请输入交易哈希')
      return
    }

    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash.trim())) {
      setError('交易哈希格式不正确')
      return
    }

    setError(null)
    setIsLoading(true)
    setResult(null)

    try {
      const response = await fetch(`${API_BASE_URL}/v1/tx/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chain_id: parseInt(chainId),
          tx_hash: txHash.trim(),
          include_explanation: includeExplanation,
          include_trace: includeTrace,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }

      const data: AnalyzeResponse = await response.json()
      setResult(data)
      saveToHistory(parseInt(chainId), txHash.trim())

      // Update URL for sharing
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.set('tx', txHash.trim())
      newUrl.searchParams.set('chain', chainId)
      window.history.replaceState({}, '', newUrl.toString())
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败')
    } finally {
      setIsLoading(false)
    }
  }

  const handleHistoryClick = (item: HistoryItem) => {
    setChainId(String(item.chainId))
    setTxHash(item.txHash)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleAnalyze()
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
        {/* Search Form */}
        <div className="bg-card rounded-lg border p-4 mb-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="chain">链</Label>
              <Select value={chainId} onValueChange={setChainId}>
                <SelectTrigger id="chain">
                  <SelectValue placeholder="Select chain" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CHAIN_INFO).map(([id, info]) => (
                    <SelectItem key={id} value={id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: info.color }}
                        />
                        {info.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="txHash">交易哈希</Label>
              <Input
                id="txHash"
                placeholder="0x..."
                value={txHash}
                onChange={(e) => {
                  setTxHash(e.target.value)
                  setError(null)
                }}
                onKeyDown={handleKeyDown}
                className="font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="explanation"
                checked={includeExplanation}
                onCheckedChange={(checked) => setIncludeExplanation(checked === true)}
              />
              <Label htmlFor="explanation" className="text-sm font-normal text-muted-foreground">
                包含 RAG 解释
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="trace"
                checked={includeTrace}
                onCheckedChange={(checked) => setIncludeTrace(checked === true)}
              />
              <Label htmlFor="trace" className="text-sm font-normal text-muted-foreground">
                包含 Trace 追踪
              </Label>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button className="w-full" onClick={handleAnalyze} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                分析中...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                分析交易
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-[200px] w-full" />
            <Skeleton className="h-[150px] w-full" />
          </div>
        )}

        {result && result.parse_result && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">解析结果</h2>
              <span className="text-xs text-muted-foreground">
                Trace ID: {result.trace_id}
              </span>
            </div>

            <Separator />

            <div className="grid md:grid-cols-2 gap-4">
              <RiskAssessment
                explanation={result.explanation}
                riskFlags={result.parse_result.risk_flags}
              />
              <ResultOverview result={result.parse_result} />
            </div>

            <Tabs defaultValue="method" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="method">方法详情</TabsTrigger>
                <TabsTrigger value="events">
                  事件 ({result.parse_result.events.length})
                </TabsTrigger>
                <TabsTrigger value="explanation">RAG 解释</TabsTrigger>
                <TabsTrigger value="trace">Trace 追踪</TabsTrigger>
              </TabsList>
              <TabsContent value="method" className="mt-4">
                <MethodDetail
                  method={result.parse_result.method}
                  inputData={result.parse_result.input}
                  diagnostics={result.parse_result.diagnostics}
                />
              </TabsContent>
              <TabsContent value="events" className="mt-4">
                <EventList
                  events={result.parse_result.events}
                  chainId={result.parse_result.chain_id}
                  diagnostics={result.parse_result.diagnostics}
                />
              </TabsContent>
              <TabsContent value="explanation" className="mt-4">
                <RagExplanation explanation={result.explanation} />
              </TabsContent>
              <TabsContent value="trace" className="mt-4">
                <TraceTimeline
                  steps={result.trace_log}
                  timings={result.timings}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* History */}
        {!isLoading && !result && history.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <History className="h-4 w-4" />
              <span className="font-medium">最近分析</span>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {history.slice(0, 10).map((item, i) => (
                <button
                  key={i}
                  className="text-left p-4 rounded-lg border hover:bg-accent transition-colors"
                  onClick={() => handleHistoryClick(item)}
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
        {!isLoading && !result && history.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="h-16 w-16 text-muted-foreground/50 mb-6" />
            <h3 className="text-lg font-medium mb-2">开始分析交易</h3>
            <p className="text-muted-foreground max-w-md">
              输入区块链交易哈希，获取 AI 驱动的交易安全分析报告
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
