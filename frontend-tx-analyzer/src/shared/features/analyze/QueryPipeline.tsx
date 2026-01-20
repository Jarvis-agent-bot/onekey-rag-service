import { useState } from 'react'
import {
  Server,
  Database,
  FileSearch,
  Code,
  Brain,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  SkipForward,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { TraceStep } from '@/api/types'
import { cn } from '@/lib/utils'

interface QueryPipelineProps {
  steps: TraceStep[] | null
  timings: Record<string, number>
  className?: string
}

// 步骤配置
interface StepConfig {
  icon: typeof Server
  label: string
  description: string
  color: string
}

const STEP_CONFIGS: Record<string, StepConfig> = {
  check_cache: {
    icon: Database,
    label: '缓存查询',
    description: '检查本地缓存是否有解析结果',
    color: 'text-purple-500',
  },
  fetch_transaction: {
    icon: Server,
    label: 'RPC 查询',
    description: '从区块链节点获取交易详情',
    color: 'text-blue-500',
  },
  fetch_receipt: {
    icon: Server,
    label: 'RPC 查询',
    description: '获取交易收据和日志',
    color: 'text-blue-500',
  },
  fetch_abi: {
    icon: FileSearch,
    label: 'Etherscan 查询',
    description: '从区块浏览器获取合约 ABI',
    color: 'text-green-500',
  },
  decode_input: {
    icon: Code,
    label: '4bytes 查询',
    description: '解码函数调用，查询签名数据库',
    color: 'text-orange-500',
  },
  decode_events: {
    icon: Code,
    label: '事件解码',
    description: '解析交易日志中的事件',
    color: 'text-orange-500',
  },
  analyze_behavior: {
    icon: Brain,
    label: '行为分析',
    description: '分析交易的业务行为类型',
    color: 'text-cyan-500',
  },
  detect_risks: {
    icon: AlertCircle,
    label: '风险检测',
    description: '检测潜在的安全风险',
    color: 'text-red-500',
  },
  call_rag: {
    icon: Brain,
    label: 'RAG 解释',
    description: '调用 AI 生成交易解释',
    color: 'text-violet-500',
  },
}

// 步骤分组
const STEP_GROUPS = [
  {
    name: '数据获取',
    steps: ['check_cache', 'fetch_transaction', 'fetch_receipt', 'fetch_abi'],
  },
  {
    name: '数据解析',
    steps: ['decode_input', 'decode_events'],
  },
  {
    name: '智能分析',
    steps: ['analyze_behavior', 'detect_risks', 'call_rag'],
  },
]

// 状态图标
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-risk-low" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-risk-high" />
    case 'skipped':
      return <SkipForward className="h-4 w-4 text-muted-foreground" />
    default:
      return <Clock className="h-4 w-4 text-muted-foreground animate-pulse" />
  }
}

export function QueryPipeline({ steps, timings, className }: QueryPipelineProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const totalMs = timings.total_ms || 0

  const toggleStep = (stepName: string) => {
    const next = new Set(expandedSteps)
    if (next.has(stepName)) {
      next.delete(stepName)
    } else {
      next.add(stepName)
    }
    setExpandedSteps(next)
  }

  // 将步骤数组转为 map
  const stepMap = new Map<string, TraceStep>()
  steps?.forEach((step) => {
    stepMap.set(step.name, step)
  })

  // 获取步骤耗时
  const getStepDuration = (stepName: string): number | null => {
    const step = stepMap.get(stepName)
    if (step?.duration_ms !== null && step?.duration_ms !== undefined) {
      return step.duration_ms
    }
    const timingKey = `${stepName}_ms`
    if (timings[timingKey]) {
      return timings[timingKey]
    }
    return null
  }

  // 获取步骤状态
  const getStepStatus = (stepName: string): string => {
    const step = stepMap.get(stepName)
    return step?.status || 'pending'
  }

  // 计算每个分组的耗时
  const getGroupDuration = (stepNames: string[]): number => {
    return stepNames.reduce((total, name) => {
      const duration = getStepDuration(name)
      return total + (duration || 0)
    }, 0)
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            查询流程
          </div>
          {totalMs > 0 && (
            <Badge variant="outline" className="font-mono">
              总耗时 {totalMs}ms
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 进度条 */}
        {totalMs > 0 && (
          <div className="space-y-2">
            <div className="h-2 rounded-full bg-muted overflow-hidden flex">
              {STEP_GROUPS.map((group, groupIndex) => {
                const groupDuration = getGroupDuration(group.steps)
                const percentage = (groupDuration / totalMs) * 100
                return (
                  <div
                    key={group.name}
                    className={cn(
                      'h-full transition-all',
                      groupIndex === 0 && 'bg-blue-500',
                      groupIndex === 1 && 'bg-orange-500',
                      groupIndex === 2 && 'bg-violet-500'
                    )}
                    style={{ width: `${percentage}%` }}
                    title={`${group.name}: ${groupDuration}ms (${percentage.toFixed(1)}%)`}
                  />
                )
              })}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <span>数据获取</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-orange-500" />
                <span>数据解析</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-violet-500" />
                <span>智能分析</span>
              </div>
            </div>
          </div>
        )}

        {/* 步骤列表 */}
        <div className="space-y-4">
          {STEP_GROUPS.map((group) => {
            const activeSteps = group.steps.filter(
              (stepName) => stepMap.has(stepName) || timings[`${stepName}_ms`]
            )

            if (activeSteps.length === 0 && !steps) {
              // 没有详细步骤时显示简化视图
              return (
                <div key={group.name} className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">{group.name}</h4>
                  <div className="space-y-1">
                    {group.steps.map((stepName) => {
                      const config = STEP_CONFIGS[stepName]
                      const duration = getStepDuration(stepName)
                      if (!config || duration === null) return null

                      const Icon = config.icon
                      return (
                        <div
                          key={stepName}
                          className="flex items-center gap-3 p-2 rounded-md bg-muted/30"
                        >
                          <Icon className={cn('h-4 w-4', config.color)} />
                          <span className="text-sm flex-1">{config.label}</span>
                          <Badge variant="outline" className="font-mono text-xs">
                            {duration}ms
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            }

            return (
              <div key={group.name} className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{group.name}</h4>
                <div className="space-y-1">
                  {group.steps.map((stepName) => {
                    const step = stepMap.get(stepName)
                    const config = STEP_CONFIGS[stepName]
                    if (!config) return null

                    const duration = getStepDuration(stepName)
                    const status = getStepStatus(stepName)
                    const isExpanded = expandedSteps.has(stepName)
                    const Icon = config.icon
                    const hasDetails = step && (
                      (step.input && Object.keys(step.input).length > 0) ||
                      (step.output && Object.keys(step.output).length > 0)
                    )

                    // 如果没有这个步骤的数据，跳过
                    if (!step && duration === null) return null

                    return (
                      <div key={stepName} className="rounded-md border">
                        <Button
                          variant="ghost"
                          className={cn(
                            'w-full justify-start p-3 h-auto',
                            !hasDetails && 'cursor-default'
                          )}
                          onClick={() => hasDetails && toggleStep(stepName)}
                        >
                          <div className="flex items-center gap-3 w-full">
                            <Icon className={cn('h-4 w-4 shrink-0', config.color)} />
                            <div className="flex-1 text-left">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{config.label}</span>
                                <StatusIcon status={status} />
                              </div>
                              <p className="text-xs text-muted-foreground">{config.description}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {duration !== null && (
                                <Badge variant="outline" className="font-mono text-xs">
                                  {duration}ms
                                </Badge>
                              )}
                              {hasDetails && (
                                isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )
                              )}
                            </div>
                          </div>
                        </Button>

                        {isExpanded && step && (
                          <div className="px-3 pb-3 space-y-2">
                            {step.input && Object.keys(step.input).length > 0 && (
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                  <ChevronRight className="h-3 w-3" />
                                  输入参数
                                </p>
                                <pre className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto">
                                  {JSON.stringify(step.input, null, 2)}
                                </pre>
                              </div>
                            )}
                            {step.output && Object.keys(step.output).length > 0 && (
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  输出结果
                                </p>
                                <pre className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto">
                                  {JSON.stringify(step.output, null, 2)}
                                </pre>
                              </div>
                            )}
                            {step.error && (
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-risk-high flex items-center gap-1">
                                  <XCircle className="h-3 w-3" />
                                  错误信息
                                </p>
                                <pre className="text-xs font-mono bg-risk-high/10 text-risk-high p-2 rounded overflow-x-auto">
                                  {step.error}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* 数据来源说明 */}
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            数据来源: RPC 节点 (交易数据) → Etherscan (ABI) → 4bytes.directory (签名) → RAG (解释)
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
