import { ExternalLink, ShieldCheck, ShieldAlert, ShieldX, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AddressDisplay, ChainBadge, StatusBadge, BehaviorBadge, RiskBadge } from '@/components/shared'
import type { ParseResult, ExplanationResult, RiskLevel } from '@/api/types'
import { formatWei, getExplorerUrl, cn } from '@/lib/utils'

interface TransactionSummaryProps {
  result: ParseResult
  explanation?: ExplanationResult | null
}

const riskIcons = {
  low: ShieldCheck,
  medium: ShieldAlert,
  high: ShieldX,
  unknown: AlertTriangle,
}

export function TransactionSummary({ result, explanation }: TransactionSummaryProps) {
  // 确定风险等级
  const riskLevel: RiskLevel = explanation?.risk_level ||
    (result.risk_flags?.some(f => f.severity === 'high') ? 'high' :
     result.risk_flags?.some(f => f.severity === 'medium') ? 'medium' :
     result.risk_flags?.length > 0 ? 'low' : 'unknown')

  const Icon = riskIcons[riskLevel]

  // 获取摘要信息
  const summary = explanation?.summary ||
    (result.risk_flags?.length === 0
      ? '暂无明显风险提示。'
      : `识别到 ${result.risk_flags?.length || 0} 项潜在风险。`)

  // 合并风险原因
  const riskReasons = [
    ...(explanation?.risk_reasons || []),
    ...(result.risk_flags?.map(flag => flag.description) || []),
  ].filter(Boolean).slice(0, 3)

  return (
    <Card className={cn(
      'border-muted/60 shadow-none overflow-hidden',
      riskLevel === 'high' && 'border-risk-high/40',
      riskLevel === 'medium' && 'border-risk-medium/40'
    )}>
      <CardContent className="p-0">
        {/* 顶部状态栏 */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
          <div className="flex items-center gap-2">
            <StatusBadge status={result.status} />
            <ChainBadge chainId={result.chain_id} />
            {explanation?.protocol && (
              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                {explanation.protocol}
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
            <a
              href={getExplorerUrl(result.chain_id, 'tx', result.tx_hash)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              浏览器
            </a>
          </Button>
        </div>

        <div className="p-4 space-y-4">
          {/* 风险 + 行为 */}
          <div className="flex items-start gap-4">
            {/* 风险指示器 */}
            <div className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg shrink-0',
              riskLevel === 'low' && 'bg-risk-low/10',
              riskLevel === 'medium' && 'bg-risk-medium/10',
              riskLevel === 'high' && 'bg-risk-high/10',
              riskLevel === 'unknown' && 'bg-muted'
            )}>
              <Icon className={cn(
                'h-5 w-5',
                riskLevel === 'low' && 'text-risk-low',
                riskLevel === 'medium' && 'text-risk-medium',
                riskLevel === 'high' && 'text-risk-high',
                riskLevel === 'unknown' && 'text-muted-foreground'
              )} />
              <RiskBadge level={riskLevel} size="sm" />
            </div>

            {/* 行为类型 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-muted-foreground">行为类型</span>
              </div>
              <BehaviorBadge
                type={result.behavior.type}
                confidence={result.behavior.confidence}
                showConfidence
              />
            </div>
          </div>

          {/* AI 摘要 */}
          <div className="text-sm leading-relaxed">
            {summary}
          </div>

          {/* 风险要点 */}
          {riskReasons.length > 0 && (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {riskReasons.map((reason, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-muted-foreground/60">•</span>
                  <span className="line-clamp-2">{reason}</span>
                </li>
              ))}
            </ul>
          )}

          {/* 交易基本信息 */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t text-sm">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">价值</p>
              <p className="font-medium font-mono">{formatWei(result.value)} ETH</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Gas 费</p>
              <p className="font-medium font-mono">{formatWei(result.gas.fee_paid)} ETH</p>
            </div>
          </div>

          {/* 地址信息 */}
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">From</span>
              <AddressDisplay address={result.from} chainId={result.chain_id} />
            </div>
            {result.to && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">To</span>
                <AddressDisplay address={result.to} chainId={result.chain_id} />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
