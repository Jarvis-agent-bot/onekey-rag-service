import { useState, useMemo } from 'react'
import {
  Server,
  FileSearch,
  Code,
  Brain,
  Shield,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Clock,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { TraceStep } from '@/api/types'
import { cn } from '@/lib/utils'

interface SearchFlowCompactProps {
  steps: TraceStep[] | null
  timings: Record<string, number>
  className?: string
  defaultExpanded?: boolean
}

// 流程阶段配置
const FLOW_STAGES = [
  { name: '数据获取', color: 'bg-blue-500', steps: ['check_cache', 'fetch_transaction', 'fetch_receipt'] },
  { name: 'ABI 解码', color: 'bg-green-500', steps: ['identify_contract', 'local_abi_lookup', 'etherscan_abi_lookup', 'signature_lookup'] },
  { name: '数据解析', color: 'bg-orange-500', steps: ['decode_input', 'decode_events', 'decode_calldata'] },
  { name: '行为分析', color: 'bg-cyan-500', steps: ['analyze_behavior', 'detect_risks', 'predict_assets', 'simulate_transaction'] },
  { name: 'RAG 分析', color: 'bg-violet-500', steps: ['rag_service_check', 'rag_identify_method', 'call_rag'] },
]

// ABI 优先级步骤
const ABI_PRIORITY_STEPS = ['local_abi_lookup', 'etherscan_abi_lookup', 'signature_lookup']

function resolveStepStatus(step: TraceStep | null): string {
  if (!step) return 'skipped'
  if (step.status === 'failed' || step.status === 'skipped') return step.status
  const successFlag = (step.output as { success?: boolean } | undefined)?.success
  if (successFlag === false) return 'failed'
  if (successFlag === true) return 'success'
  return step.status || 'pending'
}

export function SearchFlowCompact({ steps, timings, className, defaultExpanded = false }: SearchFlowCompactProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const totalMs = timings.total_ms || 0

  // 将步骤数组转为 map
  const stepMap = useMemo(() => {
    const map = new Map<string, TraceStep>()
    steps?.forEach((step) => {
      map.set(step.name, step)
    })
    return map
  }, [steps])

  // 获取步骤耗时
  const getStepDuration = (stepName: string): number => {
    const step = stepMap.get(stepName)
    if (step?.duration_ms !== null && step?.duration_ms !== undefined) {
      return step.duration_ms
    }
    const timingKey = `${stepName}_ms`
    if (timings[timingKey]) {
      return timings[timingKey]
    }
    return 0
  }

  // 计算每个阶段的耗时
  const stageDurations = useMemo(() => {
    return FLOW_STAGES.map(stage => ({
      ...stage,
      duration: stage.steps.reduce((sum, name) => sum + getStepDuration(name), 0)
    }))
  }, [stepMap, timings])

  // 统计成功/失败
  const stats = useMemo(() => {
    let success = 0, failed = 0, total = 0
    steps?.forEach(step => {
      total++
      const status = resolveStepStatus(step)
      if (status === 'success') success++
      else if (status === 'failed') failed++
    })
    return { success, failed, total }
  }, [steps])

  // 找到成功的 ABI 来源
  const abiSource = useMemo(() => {
    const successStep = ABI_PRIORITY_STEPS.find(name => {
      const step = stepMap.get(name)
      return resolveStepStatus(step || null) === 'success'
    })
    switch (successStep) {
      case 'local_abi_lookup': return '本地 ABI'
      case 'etherscan_abi_lookup': return 'Etherscan'
      case 'signature_lookup': return '4bytes'
      default: return null
    }
  }, [stepMap])

  // 获取解码的函数名
  const functionName = useMemo(() => {
    const decodeStep = stepMap.get('decode_calldata') || stepMap.get('decode_input')
    return decodeStep?.output?.function_name as string | undefined
  }, [stepMap])

  if (!steps?.length && totalMs === 0) {
    return null
  }

  return (
    <Card className={cn('border-muted/60 shadow-none', className)}>
      <CardContent className="p-0">
        {/* 紧凑头部 - 始终显示 */}
        <button
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            <Server className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">执行流程</span>

            {/* 状态统计 */}
            <div className="flex items-center gap-2 text-xs">
              {stats.success > 0 && (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  {stats.success}
                </span>
              )}
              {stats.failed > 0 && (
                <span className="flex items-center gap-1 text-red-500">
                  <XCircle className="h-3 w-3" />
                  {stats.failed}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 关键信息标签 */}
            {abiSource && (
              <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
                ABI: {abiSource}
              </Badge>
            )}
            {functionName && (
              <Badge variant="outline" className="text-xs font-mono max-w-[150px] truncate">
                {functionName}
              </Badge>
            )}

            {/* 总耗时 */}
            {totalMs > 0 && (
              <Badge variant="outline" className="font-mono text-xs">
                <Clock className="h-3 w-3 mr-1" />
                {totalMs}ms
              </Badge>
            )}

            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {/* 进度条 - 始终显示 */}
        {totalMs > 0 && (
          <div className="px-4 pb-3">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden flex">
              {stageDurations.map((stage) => {
                const percentage = (stage.duration / totalMs) * 100
                if (percentage === 0) return null
                return (
                  <div
                    key={stage.name}
                    className={cn('h-full transition-all', stage.color)}
                    style={{ width: `${percentage}%` }}
                    title={`${stage.name}: ${stage.duration}ms`}
                  />
                )
              })}
            </div>
          </div>
        )}

        {/* 展开的详情 */}
        {expanded && (
          <div className="px-4 pb-4 pt-2 border-t space-y-3">
            {/* 阶段图例 */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {FLOW_STAGES.map((stage) => {
                const stageDuration = stageDurations.find(s => s.name === stage.name)?.duration || 0
                return (
                  <div key={stage.name} className="flex items-center gap-1.5">
                    <div className={cn('h-2 w-2 rounded-full', stage.color)} />
                    <span>{stage.name}</span>
                    {stageDuration > 0 && (
                      <span className="font-mono text-muted-foreground/70">{stageDuration}ms</span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 简化的步骤列表 */}
            <div className="grid gap-2 sm:grid-cols-2">
              {FLOW_STAGES.map((stage) => {
                const stageSteps = stage.steps
                  .map(name => ({ name, step: stepMap.get(name) }))
                  .filter(({ step }) => step)

                if (stageSteps.length === 0) return null

                const StageIcon = {
                  '数据获取': Server,
                  'ABI 解码': FileSearch,
                  '数据解析': Code,
                  '行为分析': Shield,
                  'RAG 分析': Brain,
                }[stage.name] || Server

                return (
                  <div key={stage.name} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <StageIcon className={cn('h-4 w-4', stage.color.replace('bg-', 'text-'))} />
                      {stage.name}
                    </div>
                    <div className="space-y-1">
                      {stageSteps.map(({ name, step }) => {
                        const status = resolveStepStatus(step || null)
                        const duration = getStepDuration(name)
                        return (
                          <div key={name} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <div className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                status === 'success' && 'bg-green-500',
                                status === 'failed' && 'bg-red-500',
                                status === 'skipped' && 'bg-gray-400',
                                status === 'pending' && 'bg-blue-500'
                              )} />
                              <span className="text-muted-foreground">
                                {getStepLabel(name)}
                              </span>
                            </div>
                            {duration > 0 && (
                              <span className="font-mono text-muted-foreground/70">{duration}ms</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// 步骤名称映射
function getStepLabel(name: string): string {
  const labels: Record<string, string> = {
    check_cache: '缓存查询',
    fetch_transaction: '获取交易',
    fetch_receipt: '获取收据',
    identify_contract: '合约识别',
    local_abi_lookup: '本地 ABI',
    etherscan_abi_lookup: 'Etherscan',
    signature_lookup: '4bytes',
    decode_input: '输入解码',
    decode_events: '事件解码',
    decode_calldata: 'Calldata',
    analyze_behavior: '行为分析',
    detect_risks: '风险检测',
    predict_assets: '资产预测',
    simulate_transaction: '交易模拟',
    rag_service_check: '服务检测',
    rag_identify_method: '方法识别',
    call_rag: 'AI 解释',
  }
  return labels[name] || name
}
