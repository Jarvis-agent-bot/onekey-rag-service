import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useAnalyzeTransaction } from '@/api/hooks'
import type { AnalyzeResponse } from '@/api/types'
import { copyToClipboard } from '@/lib/utils'
import { AnalyzeForm } from './AnalyzeForm'
import { ResultOverview } from './ResultOverview'
import { RiskAssessment } from './RiskAssessment'
import { MethodDetail } from './MethodDetail'
import { EventList } from './EventList'
import { RagExplanation } from './RagExplanation'
import { TraceTimeline } from './TraceTimeline'

export function AnalyzePage() {
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const analyzeMutation = useAnalyzeTransaction()

  const handleAnalyze = async (data: {
    chainId: number
    txHash: string
    includeExplanation: boolean
    includeTrace: boolean
  }) => {
    try {
      const response = await analyzeMutation.mutateAsync({
        chain_id: data.chainId,
        tx_hash: data.txHash,
        options: {
          include_explanation: data.includeExplanation,
          include_trace: data.includeTrace,
          language: 'zh',
        },
      })
      setResult(response)
    } catch (error) {
      console.error('Analyze failed:', error)
    }
  }

  const handleCopyResult = async () => {
    if (result) {
      await copyToClipboard(JSON.stringify(result, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-6">
      <AnalyzeForm
        onSubmit={handleAnalyze}
        isLoading={analyzeMutation.isPending}
      />

      {analyzeMutation.isPending && (
        <div className="space-y-4">
          <Skeleton className="h-[200px] w-full" />
          <Skeleton className="h-[150px] w-full" />
        </div>
      )}

      {analyzeMutation.isError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            {analyzeMutation.error instanceof Error
              ? analyzeMutation.error.message
              : 'An error occurred while analyzing the transaction'}
          </p>
        </div>
      )}

      {result && result.parse_result && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">分析结果</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Trace: {result.trace_id}
              </span>
              <Button variant="ghost" size="sm" onClick={handleCopyResult}>
                {copied ? (
                  <Check className="h-4 w-4 text-risk-low" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                <span className="ml-2">复制 JSON</span>
              </Button>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 lg:grid-cols-2">
            <ResultOverview result={result.parse_result} />
            <RiskAssessment
              explanation={result.explanation}
              riskFlags={result.parse_result.risk_flags}
            />
          </div>

          <Tabs defaultValue="method" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
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

          {result.error && (
            <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
              <p className="text-sm text-yellow-600">
                Warning: {result.error}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
