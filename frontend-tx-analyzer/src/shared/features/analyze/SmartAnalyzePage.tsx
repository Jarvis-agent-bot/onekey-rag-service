import { useState } from 'react'
import { Copy, Check, Hash, FileCode, FileSignature } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useSmartAnalyze } from '@/api/hooks'
import type { SmartAnalyzeResponse, InputType, TraceStep } from '@/api/types'
import { copyToClipboard } from '@/lib/utils'
import { SmartInput } from './SmartInput'
import { ResultOverview } from './ResultOverview'
import { RiskAssessment } from './RiskAssessment'
import { MethodDetail } from './MethodDetail'
import { EventList } from './EventList'
import { RagExplanation } from './RagExplanation'
import { SearchFlowVisualization } from './SearchFlowVisualization'
import { CalldataResult } from './CalldataResult'
import { SignatureResult } from './SignatureResult'

// 输入类型图标
const INPUT_TYPE_ICONS: Record<InputType, typeof Hash> = {
  tx_hash: Hash,
  calldata: FileCode,
  signature: FileSignature,
  unknown: Hash,
}

// 输入类型标签
const INPUT_TYPE_LABELS: Record<InputType, string> = {
  tx_hash: 'Transaction',
  calldata: 'Calldata',
  signature: 'Signature',
  unknown: 'Unknown',
}

export function SmartAnalyzePage() {
  const [result, setResult] = useState<SmartAnalyzeResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const smartAnalyzeMutation = useSmartAnalyze()

  const handleAnalyze = async (data: {
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
    try {
      const response = await smartAnalyzeMutation.mutateAsync({
        input: data.input,
        chain_id: data.chainId,
        context: data.context,
        options: {
          include_explanation: data.options.includeExplanation,
          include_trace: data.options.includeTrace,
          language: 'zh',
        },
      })
      setResult(response)
    } catch (error) {
      console.error('Smart analyze failed:', error)
    }
  }

  const handleCopyResult = async () => {
    if (result) {
      await copyToClipboard(JSON.stringify(result, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const TypeIcon = result ? INPUT_TYPE_ICONS[result.input_type] : Hash

  return (
    <div className="space-y-6">
      <SmartInput
        onSubmit={handleAnalyze}
        isLoading={smartAnalyzeMutation.isPending}
      />

      {smartAnalyzeMutation.isPending && (
        <div className="space-y-4">
          <Skeleton className="h-[200px] w-full" />
          <Skeleton className="h-[150px] w-full" />
        </div>
      )}

      {smartAnalyzeMutation.isError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            {smartAnalyzeMutation.error instanceof Error
              ? smartAnalyzeMutation.error.message
              : 'An error occurred while analyzing'}
          </p>
        </div>
      )}

      {result && (
        <div className="space-y-6 animate-fade-in">
          {/* 结果头部 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold">分析结果</h2>
              <Badge variant="outline" className="flex items-center gap-1">
                <TypeIcon className="h-3 w-3" />
                {INPUT_TYPE_LABELS[result.input_type]}
              </Badge>
            </div>
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

          {/* 根据输入类型显示不同的结果 */}
          {result.input_type === 'tx_hash' && result.tx_result && (
            <TransactionResult result={result} />
          )}

          {result.input_type === 'calldata' && result.decode_result && (
            <>
              {/* Calldata 解码也显示搜索流程 */}
              {result.trace_log && result.trace_log.length > 0 && (
                <SearchFlowVisualization
                  steps={result.trace_log}
                  timings={result.timings}
                />
              )}
              <CalldataResult
                result={result.decode_result}
                formatted={null}
              />
            </>
          )}

          {result.input_type === 'signature' && result.signature_result && (
            <SignatureResult
              result={result.signature_result}
              summary={null}
            />
          )}

          {/* 错误显示 */}
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

// 交易结果显示组件 (复用已有的组件)
function TransactionResult({ result }: { result: SmartAnalyzeResponse }) {
  if (!result.tx_result) return null

  // trace_log 已经是正确的类型，直接使用
  const traceSteps: TraceStep[] | null = result.trace_log ?? null

  return (
    <>
      {/* 搜索流程可视化 */}
      <SearchFlowVisualization
        steps={traceSteps}
        timings={result.timings}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ResultOverview result={result.tx_result} />
        <RiskAssessment
          explanation={result.explanation}
          riskFlags={result.tx_result.risk_flags}
        />
      </div>

      <Tabs defaultValue="method" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="method">方法</TabsTrigger>
          <TabsTrigger value="events">
            事件 ({result.tx_result.events.length})
          </TabsTrigger>
          <TabsTrigger value="explanation">解释</TabsTrigger>
        </TabsList>
        <TabsContent value="method">
          <MethodDetail
            method={result.tx_result.method}
            inputData={result.tx_result.input}
            diagnostics={result.tx_result.diagnostics}
          />
        </TabsContent>
        <TabsContent value="events">
          <EventList
            events={result.tx_result.events}
            chainId={result.tx_result.chain_id}
            diagnostics={result.tx_result.diagnostics}
          />
        </TabsContent>
        <TabsContent value="explanation">
          <RagExplanation explanation={result.explanation} />
        </TabsContent>
      </Tabs>
    </>
  )
}
