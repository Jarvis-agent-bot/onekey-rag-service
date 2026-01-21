import { useState, useMemo } from 'react'
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
  SkipForward,
  Zap,
  Shield,
  ArrowRight,
  Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { TraceStep } from '@/api/types'
import { cn } from '@/lib/utils'

interface SearchFlowVisualizationProps {
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
  bgColor: string
}

const STEP_CONFIGS: Record<string, StepConfig> = {
  // 缓存
  check_cache: {
    icon: Database,
    label: '缓存查询',
    description: '检查本地缓存',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500',
  },
  // 数据获取
  fetch_transaction: {
    icon: Server,
    label: 'RPC 查询交易',
    description: '从区块链节点获取交易详情',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500',
  },
  fetch_receipt: {
    icon: Server,
    label: 'RPC 查询收据',
    description: '获取交易收据和日志',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500',
  },
  fetch_abi: {
    icon: FileSearch,
    label: 'Etherscan ABI',
    description: '从区块浏览器获取合约 ABI',
    color: 'text-green-500',
    bgColor: 'bg-green-500',
  },
  // Calldata 解码流程 - 按优先级顺序
  decode_calldata: {
    icon: Code,
    label: 'Calldata 解码',
    description: '解码交易调用数据',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500',
  },
  identify_contract: {
    icon: Database,
    label: '合约识别',
    description: '识别目标地址是否为已知协议',
    color: 'text-green-500',
    bgColor: 'bg-green-500',
  },
  user_abi_decode: {
    icon: Code,
    label: '用户 ABI',
    description: '使用用户提供的 ABI 解码',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500',
  },
  local_abi_lookup: {
    icon: Database,
    label: '本地 ABI',
    description: '从内置协议库获取 ABI',
    color: 'text-gray-400',
    bgColor: 'bg-gray-400',
  },
  etherscan_abi_lookup: {
    icon: FileSearch,
    label: 'Etherscan',
    description: '从 Etherscan 获取已验证合约 ABI',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500',
  },
  signature_lookup: {
    icon: Code,
    label: '4bytes',
    description: '从签名数据库匹配',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500',
  },
  predict_assets: {
    icon: Zap,
    label: '资产预测',
    description: '预测资产变化 (Pay/Receive)',
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500',
  },
  // 原有步骤
  decode_input: {
    icon: Code,
    label: '输入解码',
    description: '解码函数调用',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500',
  },
  decode_events: {
    icon: Code,
    label: '事件解码',
    description: '解析交易日志中的事件',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500',
  },
  analyze_behavior: {
    icon: Brain,
    label: '行为分析',
    description: '分析交易的业务行为类型',
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500',
  },
  detect_risks: {
    icon: Shield,
    label: '风险检测',
    description: '检测潜在的安全风险',
    color: 'text-red-500',
    bgColor: 'bg-red-500',
  },
  call_rag: {
    icon: Brain,
    label: 'RAG 解释',
    description: '调用 AI 生成交易解释',
    color: 'text-violet-500',
    bgColor: 'bg-violet-500',
  },
}

// ABI 优先级链的步骤
const ABI_PRIORITY_STEPS = ['user_abi_decode', 'etherscan_abi_lookup', 'signature_lookup']

// 流程阶段分组
interface FlowStage {
  name: string
  icon: typeof Server
  color: string
  bgColor: string
  steps: string[]
  isAbiBranch?: boolean
}

const FLOW_STAGES: FlowStage[] = [
  {
    name: '数据获取',
    icon: Server,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500',
    steps: ['check_cache', 'fetch_transaction', 'fetch_receipt'],
  },
  {
    name: 'ABI 解码优先级链',
    icon: FileSearch,
    color: 'text-green-500',
    bgColor: 'bg-green-500',
    steps: ['identify_contract', 'user_abi_decode', 'etherscan_abi_lookup', 'signature_lookup'],
    isAbiBranch: true,
  },
  {
    name: '数据解析',
    icon: Code,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500',
    steps: ['decode_input', 'decode_events', 'decode_calldata'],
  },
  {
    name: '智能分析',
    icon: Brain,
    color: 'text-violet-500',
    bgColor: 'bg-violet-500',
    steps: ['analyze_behavior', 'detect_risks', 'predict_assets', 'call_rag'],
  },
]

// 状态配置
const STATUS_CONFIG = {
  success: {
    dotClass: 'bg-green-500',
    borderClass: 'border-green-500/50',
    bgClass: 'bg-green-500/5',
    icon: CheckCircle2,
    iconClass: 'text-green-500',
  },
  failed: {
    dotClass: 'bg-red-500',
    borderClass: 'border-red-500/50',
    bgClass: 'bg-red-500/5',
    icon: XCircle,
    iconClass: 'text-red-500',
  },
  skipped: {
    dotClass: 'bg-gray-400',
    borderClass: 'border-gray-400/30 border-dashed',
    bgClass: 'bg-gray-500/5',
    icon: SkipForward,
    iconClass: 'text-gray-400',
  },
  pending: {
    dotClass: 'bg-blue-500 animate-pulse',
    borderClass: 'border-blue-500/50',
    bgClass: 'bg-blue-500/5',
    icon: Clock,
    iconClass: 'text-blue-500 animate-pulse',
  },
}

// 状态点组件
function StatusDot({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending
  return (
    <div className={cn(
      'w-3 h-3 rounded-full shrink-0',
      config.dotClass
    )} />
  )
}

// 状态图标组件
function StatusIcon({ status, className }: { status: string; className?: string }) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending
  const Icon = config.icon
  return <Icon className={cn('h-4 w-4', config.iconClass, className)} />
}

// 格式化输出/输入数据
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'string') {
    // 检查是否是地址
    if (/^0x[a-fA-F0-9]{40}$/i.test(value)) {
      return `${value.slice(0, 6)}...${value.slice(-4)}`
    }
    // 检查是否是长哈希
    if (/^0x[a-fA-F0-9]{64}$/i.test(value)) {
      return `${value.slice(0, 10)}...${value.slice(-6)}`
    }
    // 截断长字符串
    if (value.length > 60) {
      return `${value.slice(0, 50)}...`
    }
    return value
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return value.toLocaleString()
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  if (Array.isArray(value)) {
    return `[${value.length} items]`
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as object)
    return `{${keys.length} fields}`
  }
  return String(value)
}

// 节点详情展示组件
function NodeDetails({ step }: { step: TraceStep }) {
  const hasInput = step.input && Object.keys(step.input).length > 0
  const hasOutput = step.output && Object.keys(step.output).length > 0
  const hasError = !!step.error

  if (!hasInput && !hasOutput && !hasError) return null

  return (
    <div className="mt-3 space-y-3 text-xs">
      {hasInput && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
            <ArrowRight className="h-3 w-3" />
            <span>输入参数</span>
          </div>
          <div className="bg-muted/50 rounded-md p-2.5 space-y-1">
            {Object.entries(step.input).map(([key, value]) => (
              <div key={key} className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0">{key}:</span>
                <span className="font-mono break-all">{formatValue(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasOutput && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-green-600 font-medium">
            <CheckCircle2 className="h-3 w-3" />
            <span>输出结果</span>
          </div>
          <div className="bg-green-500/5 border border-green-500/20 rounded-md p-2.5 space-y-1">
            {Object.entries(step.output!).map(([key, value]) => (
              <div key={key} className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0">{key}:</span>
                <span className="font-mono break-all">{formatValue(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasError && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-red-500 font-medium">
            <XCircle className="h-3 w-3" />
            <span>错误信息</span>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-md p-2.5">
            <span className="font-mono text-red-600">{step.error}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// 单个节点组件
interface FlowNodeProps {
  step: TraceStep | null
  stepName: string
  duration: number | null
  isLast?: boolean
  showLine?: boolean
}

function FlowNode({ step, stepName, duration, isLast = false, showLine = true }: FlowNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const config = STEP_CONFIGS[stepName]

  if (!config) return null

  const status = step?.status || 'pending'
  const hasDetails = step && (
    (step.input && Object.keys(step.input).length > 0) ||
    (step.output && Object.keys(step.output).length > 0) ||
    step.error
  )
  const Icon = config.icon

  return (
    <div className="relative">
      {/* 垂直连接线 */}
      {showLine && !isLast && (
        <div className="absolute left-[5px] top-[20px] bottom-[-8px] w-[2px] bg-border" />
      )}

      {/* 节点内容 */}
      <div
        className={cn(
          'relative flex items-start gap-3 p-2 rounded-lg transition-colors cursor-pointer',
          expanded && 'bg-muted/30',
          hasDetails && 'hover:bg-muted/30'
        )}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {/* 状态点 */}
        <div className="relative z-10 mt-1">
          <StatusDot status={status} />
        </div>

        {/* 内容区域 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Icon className={cn('h-4 w-4 shrink-0', config.color)} />
            <span className="text-sm font-medium">{config.label}</span>
            <StatusIcon status={status} className="h-3.5 w-3.5" />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {config.description}
          </p>

          {/* 展开详情 */}
          {expanded && step && <NodeDetails step={step} />}
        </div>

        {/* 右侧信息 */}
        <div className="flex items-center gap-2 shrink-0">
          {duration !== null && (
            <Badge variant="outline" className="font-mono text-xs tabular-nums">
              {duration}ms
            </Badge>
          )}
          {hasDetails && (
            expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )
          )}
        </div>
      </div>
    </div>
  )
}

// ABI 优先级分支组件
interface AbiBranchProps {
  steps: Map<string, TraceStep>
  getDuration: (name: string) => number | null
}

function AbiBranch({ steps, getDuration }: AbiBranchProps) {
  const [expandedNode, setExpandedNode] = useState<string | null>(null)

  // 找到成功的步骤
  const successStep = ABI_PRIORITY_STEPS.find(name => {
    const step = steps.get(name)
    return step?.status === 'success'
  })

  // 获取最终来源描述
  const getSourceDescription = () => {
    if (!successStep) return null
    switch (successStep) {
      case 'user_abi_decode':
        return '用户提供的 ABI'
      case 'etherscan_abi_lookup':
        return 'Etherscan 已验证合约'
      case 'signature_lookup':
        return '4bytes 签名数据库'
      default:
        return null
    }
  }

  const priorityLabels = {
    user_abi_decode: { num: '①', name: '用户 ABI', priority: '优先级最高' },
    etherscan_abi_lookup: { num: '②', name: 'Etherscan', priority: '优先级 2' },
    signature_lookup: { num: '③', name: '4bytes', priority: '最低优先级' },
  }

  return (
    <div className="relative">
      {/* 卡片容器 */}
      <div className="ml-4 border rounded-lg overflow-hidden">
        {/* 卡片头部 */}
        <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium">ABI 解码优先级链</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              成功即停止
            </Badge>
          </div>
          {successStep && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              <span>来源: {getSourceDescription()}</span>
            </div>
          )}
        </div>

        {/* 优先级节点并排展示 */}
        <div className="grid grid-cols-3 divide-x">
          {ABI_PRIORITY_STEPS.map((stepName) => {
            const step = steps.get(stepName)
            const duration = getDuration(stepName)
            const status = step?.status || 'skipped'
            const label = priorityLabels[stepName as keyof typeof priorityLabels]
            const isSuccess = status === 'success'
            const isExpanded = expandedNode === stepName
            const hasDetails = step && (
              (step.input && Object.keys(step.input).length > 0) ||
              (step.output && Object.keys(step.output).length > 0) ||
              step.error
            )

            return (
              <div
                key={stepName}
                className={cn(
                  'p-3 transition-colors',
                  isSuccess && 'bg-green-500/5',
                  status === 'skipped' && 'opacity-60',
                  hasDetails && 'cursor-pointer hover:bg-muted/30'
                )}
                onClick={() => hasDetails && setExpandedNode(isExpanded ? null : stepName)}
              >
                {/* 优先级编号和状态 */}
                <div className="flex items-center justify-between mb-2">
                  <span className={cn(
                    'text-lg font-bold',
                    isSuccess ? 'text-green-500' : 'text-muted-foreground'
                  )}>
                    {label.num}
                  </span>
                  <StatusIcon status={status} />
                </div>

                {/* 名称 */}
                <div className="text-sm font-medium mb-0.5">{label.name}</div>
                <div className="text-[10px] text-muted-foreground mb-2">{label.priority}</div>

                {/* 状态标签 */}
                <div className="flex items-center gap-2">
                  {isSuccess && duration !== null && (
                    <Badge variant="outline" className="font-mono text-[10px] px-1.5 bg-green-500/10 text-green-600 border-green-500/30">
                      {duration}ms
                    </Badge>
                  )}
                  {status === 'skipped' && (
                    <Badge variant="outline" className="text-[10px] px-1.5">
                      跳过
                    </Badge>
                  )}
                  {status === 'failed' && (
                    <Badge variant="destructive" className="text-[10px] px-1.5">
                      失败
                    </Badge>
                  )}
                  {!step && (
                    <Badge variant="outline" className="text-[10px] px-1.5">
                      未提供
                    </Badge>
                  )}
                </div>

                {/* 展开详情 */}
                {hasDetails && (
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                    {isExpanded ? (
                      <>
                        <ChevronDown className="h-3 w-3" />
                        <span>收起详情</span>
                      </>
                    ) : (
                      <>
                        <ChevronRight className="h-3 w-3" />
                        <span>展开详情</span>
                      </>
                    )}
                  </div>
                )}

                {/* 节点详情 */}
                {isExpanded && step && (
                  <div className="mt-2 pt-2 border-t">
                    <NodeDetails step={step} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// 流程阶段组件
interface FlowStageProps {
  stage: FlowStage
  steps: Map<string, TraceStep>
  getDuration: (name: string) => number | null
  isLast: boolean
}

function FlowStageComponent({ stage, steps, getDuration, isLast }: FlowStageProps) {
  // 获取此阶段中有数据的步骤
  const activeSteps = stage.steps.filter(stepName =>
    steps.has(stepName) || getDuration(stepName) !== null
  )

  if (activeSteps.length === 0) return null

  const StageIcon = stage.icon
  const totalDuration = activeSteps.reduce((sum, name) => {
    const d = getDuration(name)
    return sum + (d || 0)
  }, 0)

  return (
    <div className="relative">
      {/* 阶段连接线 */}
      {!isLast && (
        <div className="absolute left-[5px] top-0 bottom-0 w-[2px] bg-border" />
      )}

      {/* 阶段标题 */}
      <div className="flex items-center gap-3 mb-2">
        <div className={cn(
          'relative z-10 w-3 h-3 rounded-full',
          stage.bgColor
        )} />
        <div className="flex items-center gap-2 flex-1">
          <StageIcon className={cn('h-4 w-4', stage.color)} />
          <span className="text-sm font-semibold">{stage.name}</span>
        </div>
        {totalDuration > 0 && (
          <Badge variant="outline" className="font-mono text-xs">
            {totalDuration}ms
          </Badge>
        )}
      </div>

      {/* 阶段内容 */}
      <div className="ml-1.5 pl-4 border-l-2 border-border/50 space-y-1">
        {stage.isAbiBranch ? (
          <AbiBranch steps={steps} getDuration={getDuration} />
        ) : (
          activeSteps.map((stepName, idx) => (
            <FlowNode
              key={stepName}
              step={steps.get(stepName) || null}
              stepName={stepName}
              duration={getDuration(stepName)}
              isLast={idx === activeSteps.length - 1}
              showLine={false}
            />
          ))
        )}
      </div>
    </div>
  )
}

// 流程摘要组件
interface FlowSummaryProps {
  steps: Map<string, TraceStep>
  totalMs: number
}

function FlowSummary({ steps, totalMs }: FlowSummaryProps) {
  // 找到成功的 ABI 来源
  const successAbiStep = ABI_PRIORITY_STEPS.find(name => {
    const step = steps.get(name)
    return step?.status === 'success'
  })

  const getAbiSourceInfo = () => {
    switch (successAbiStep) {
      case 'user_abi_decode':
        return { source: '用户 ABI', level: 'high', desc: '用户提供，可靠性最高' }
      case 'etherscan_abi_lookup':
        return { source: 'Etherscan', level: 'high', desc: '已验证合约，可靠' }
      case 'signature_lookup':
        return { source: '4bytes', level: 'medium', desc: '可能存在选择器碰撞' }
      default:
        return null
    }
  }

  const abiInfo = getAbiSourceInfo()

  // 获取解码的函数名
  const decodeStep = steps.get('decode_calldata') || steps.get('decode_input')
  const functionName = decodeStep?.output?.function_name as string | undefined

  // 统计步骤数
  const successCount = Array.from(steps.values()).filter(s => s.status === 'success').length
  const totalCount = steps.size

  return (
    <div className="pt-3 border-t space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Info className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">搜索结果摘要</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            <span className="text-green-500 font-medium">{successCount}</span>/{totalCount} 步骤成功
          </span>
          <span>总耗时 <span className="font-mono font-medium">{totalMs}ms</span></span>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {/* ABI 来源 */}
        {abiInfo && (
          <div className={cn(
            'rounded-lg border p-3',
            abiInfo.level === 'high' ? 'border-green-500/30 bg-green-500/5' : 'border-yellow-500/30 bg-yellow-500/5'
          )}>
            <div className="flex items-center gap-2 mb-1">
              <FileSearch className={cn(
                'h-4 w-4',
                abiInfo.level === 'high' ? 'text-green-500' : 'text-yellow-500'
              )} />
              <span className="text-xs font-medium">ABI 来源</span>
            </div>
            <div className="text-sm font-semibold">{abiInfo.source}</div>
            <div className="text-[10px] text-muted-foreground">{abiInfo.desc}</div>
          </div>
        )}

        {/* 解码函数 */}
        {functionName && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Code className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-medium">解码函数</span>
            </div>
            <div className="text-sm font-mono font-semibold truncate">{functionName}</div>
            <div className="text-[10px] text-muted-foreground">成功识别函数签名</div>
          </div>
        )}
      </div>

      {/* ABI 优先级说明 */}
      <div className="text-xs space-y-1">
        <p className="font-medium text-muted-foreground">ABI 解码优先级:</p>
        <div className="flex flex-wrap items-center gap-1 text-muted-foreground/80">
          <span className={cn(
            'px-1.5 py-0.5 rounded text-[10px]',
            successAbiStep === 'user_abi_decode'
              ? 'bg-blue-500/20 text-blue-500 font-medium'
              : 'bg-blue-500/10 text-blue-500'
          )}>① 用户ABI</span>
          <ArrowRight className="h-3 w-3" />
          <span className={cn(
            'px-1.5 py-0.5 rounded text-[10px]',
            successAbiStep === 'etherscan_abi_lookup'
              ? 'bg-yellow-500/20 text-yellow-500 font-medium'
              : 'bg-yellow-500/10 text-yellow-500'
          )}>② Etherscan</span>
          <ArrowRight className="h-3 w-3" />
          <span className={cn(
            'px-1.5 py-0.5 rounded text-[10px]',
            successAbiStep === 'signature_lookup'
              ? 'bg-orange-500/20 text-orange-500 font-medium'
              : 'bg-orange-500/10 text-orange-500'
          )}>③ 4bytes</span>
        </div>
        <p className="text-[10px] text-muted-foreground/60">
          按优先级依次尝试，成功解码即停止。4bytes 可能存在选择器碰撞风险。
        </p>
      </div>
    </div>
  )
}

// 主组件
export function SearchFlowVisualization({ steps, timings, className }: SearchFlowVisualizationProps) {
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

  // 计算每个阶段的耗时
  const stageDurations = useMemo(() => {
    return FLOW_STAGES.map(stage => ({
      name: stage.name,
      duration: stage.steps.reduce((sum, name) => {
        const d = getStepDuration(name)
        return sum + (d || 0)
      }, 0)
    }))
  }, [stepMap, timings])

  // 检查是否有任何步骤数据
  const hasSteps = steps && steps.length > 0

  if (!hasSteps && totalMs === 0) {
    return null
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            搜索流程
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
              {stageDurations.map((stage, idx) => {
                const percentage = (stage.duration / totalMs) * 100
                if (percentage === 0) return null
                return (
                  <div
                    key={stage.name}
                    className={cn(
                      'h-full transition-all',
                      idx === 0 && 'bg-blue-500',
                      idx === 1 && 'bg-green-500',
                      idx === 2 && 'bg-orange-500',
                      idx === 3 && 'bg-violet-500'
                    )}
                    style={{ width: `${percentage}%` }}
                    title={`${stage.name}: ${stage.duration}ms (${percentage.toFixed(1)}%)`}
                  />
                )
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {FLOW_STAGES.map((stage) => (
                <div key={stage.name} className="flex items-center gap-1">
                  <div className={cn('h-2 w-2 rounded-full', stage.bgColor)} />
                  <span>{stage.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* 垂直时间线 */}
        <div className="space-y-6">
          {FLOW_STAGES.map((stage, idx) => (
            <FlowStageComponent
              key={stage.name}
              stage={stage}
              steps={stepMap}
              getDuration={getStepDuration}
              isLast={idx === FLOW_STAGES.length - 1}
            />
          ))}
        </div>

        {/* 搜索结果摘要 */}
        <FlowSummary steps={stepMap} totalMs={totalMs} />
      </CardContent>
    </Card>
  )
}
