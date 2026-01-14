import { useState, useEffect } from 'react'
import { Search, History, Settings, Loader2, Shield } from 'lucide-react'
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
import type { PendingTransaction } from '@/types/extension'
import { STORAGE_KEYS } from '@/types/extension'
import { InterceptedTxView } from '../popup/InterceptedTxView'

// Import existing analysis components
import { ResultOverview } from '@/features/analyze/ResultOverview'
import { RiskAssessment } from '@/features/analyze/RiskAssessment'
import { MethodDetail } from '@/features/analyze/MethodDetail'
import { EventList } from '@/features/analyze/EventList'
import { RagExplanation } from '@/features/analyze/RagExplanation'
import { TraceTimeline } from '@/features/analyze/TraceTimeline'

export function SidePanelApp() {
  const [chainId, setChainId] = useState<string>('1')
  const [txHash, setTxHash] = useState('')
  const [includeExplanation, setIncludeExplanation] = useState(true)
  const [includeTrace, setIncludeTrace] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<Array<{ chainId: number; txHash: string; timestamp: number }>>([])
  const [pendingTx, setPendingTx] = useState<PendingTransaction | null>(null)

  // Load history on mount
  useEffect(() => {
    loadHistory()
  }, [])

  useEffect(() => {
    let mounted = true

    const loadPending = async () => {
      const pending = await chrome.runtime.sendMessage({ type: 'GET_PENDING_TX' })
      if (mounted) {
        setPendingTx(pending || null)
      }
    }

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== 'local') return
      if (changes[STORAGE_KEYS.PENDING_TX]) {
        setPendingTx(changes[STORAGE_KEYS.PENDING_TX].newValue || null)
      }
    }

    loadPending()
    chrome.storage.onChanged.addListener(handleStorageChange)

    return () => {
      mounted = false
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  const loadHistory = async () => {
    const storage = await chrome.storage.local.get('tx_analyzer_history')
    setHistory(storage.tx_analyzer_history || [])
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
      const response = await chrome.runtime.sendMessage({
        type: 'ANALYZE_TX',
        payload: {
          chainId: parseInt(chainId),
          txHash: txHash.trim(),
          options: {
            include_explanation: includeExplanation,
            include_trace: includeTrace,
          },
        },
      })

      if (response.error) {
        throw new Error(response.error)
      }

      setResult(response)
      loadHistory() // Refresh history
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败')
    } finally {
      setIsLoading(false)
    }
  }

  const handleHistoryClick = (item: { chainId: number; txHash: string }) => {
    setChainId(String(item.chainId))
    setTxHash(item.txHash)
  }

  if (pendingTx) {
    return (
      <div className="min-h-screen bg-background">
        <InterceptedTxView
          tx={pendingTx}
          onComplete={() => setPendingTx(null)}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b sticky top-0 bg-background z-10">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">TX Analyzer</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => chrome.runtime.openOptionsPage()}
          className="h-8 w-8"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* Search Form */}
      <div className="px-3 py-3 border-b space-y-3">
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="chain" className="text-xs text-muted-foreground">
              链
            </Label>
            <Select value={chainId} onValueChange={setChainId}>
              <SelectTrigger id="chain" className="h-9">
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

          <div className="space-y-1.5">
            <Label htmlFor="txHash" className="text-xs text-muted-foreground">
              交易哈希
            </Label>
            <Input
              id="txHash"
              placeholder="0x..."
              value={txHash}
              onChange={(e) => {
                setTxHash(e.target.value)
                setError(null)
              }}
              className="h-9 font-mono text-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="explanation"
              checked={includeExplanation}
              onCheckedChange={(checked) => setIncludeExplanation(checked === true)}
            />
            <Label htmlFor="explanation" className="text-xs font-normal text-muted-foreground">
              包含 RAG 解释
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="trace"
              checked={includeTrace}
              onCheckedChange={(checked) => setIncludeTrace(checked === true)}
            />
            <Label htmlFor="trace" className="text-xs font-normal text-muted-foreground">
              包含 Trace 追踪
            </Label>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button className="w-full h-9" onClick={handleAnalyze} disabled={isLoading}>
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

      {/* Results / History */}
      <div className="flex-1 px-3 py-4 overflow-auto">
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-[200px] w-full" />
            <Skeleton className="h-[150px] w-full" />
          </div>
        )}

        {result && result.parse_result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">解析结果</h2>
              <span className="text-[11px] text-muted-foreground">
                Trace: {result.trace_id}
              </span>
            </div>

            <Separator className="opacity-60" />

            <div className="space-y-3">
              <RiskAssessment
                explanation={result.explanation}
                riskFlags={result.parse_result.risk_flags}
                compact
              />
              <ResultOverview result={result.parse_result} compact />
            </div>

            <details className="rounded-md border border-muted/60 bg-background">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground">
                展开更多详情
              </summary>
              <div className="px-3 pb-3">
                <Tabs defaultValue="method" className="w-full">
                  <TabsList className="grid w-full grid-cols-4 h-9">
                    <TabsTrigger value="method">方法</TabsTrigger>
                    <TabsTrigger value="events">
                      事件 ({result.parse_result.events.length})
                    </TabsTrigger>
                    <TabsTrigger value="explanation">解释</TabsTrigger>
                    <TabsTrigger value="trace">Trace</TabsTrigger>
                  </TabsList>
                  <TabsContent value="method">
                    <MethodDetail
                      method={result.parse_result.method}
                      inputData={result.parse_result.input}
                    />
                  </TabsContent>
                  <TabsContent value="events">
                    <EventList
                      events={result.parse_result.events}
                      chainId={result.parse_result.chain_id}
                    />
                  </TabsContent>
                  <TabsContent value="explanation">
                    <RagExplanation explanation={result.explanation} />
                  </TabsContent>
                  <TabsContent value="trace">
                    <TraceTimeline
                      steps={result.trace_log}
                      timings={result.timings}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </details>
          </div>
        )}

        {!isLoading && !result && history.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <History className="h-4 w-4" />
              <span className="text-sm font-medium">最近分析</span>
            </div>
            <div className="space-y-2">
              {history.slice(0, 10).map((item, i) => (
                <button
                  key={i}
                  className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors"
                  onClick={() => handleHistoryClick(item)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: CHAIN_INFO[item.chainId]?.color || '#888' }}
                    />
                    <span className="text-sm font-medium">
                      {CHAIN_INFO[item.chainId]?.name || `Chain ${item.chainId}`}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-muted-foreground truncate">
                    {item.txHash}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {!isLoading && !result && history.length === 0 && (
          <div className="flex flex-col items-center justify-center h-[300px] text-center">
            <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-medium mb-2">暂无分析记录</h3>
            <p className="text-sm text-muted-foreground">
              输入交易哈希开始解析
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t text-center">
        <p className="text-xs text-muted-foreground">
          由 OneKey RAG 驱动
        </p>
      </div>
    </div>
  )
}
