import { ShieldCheck, ShieldAlert, ShieldX, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RiskBadge } from '@/components/shared'
import type { ExplanationResult, RiskFlag, RiskLevel } from '@/api/types'
import { cn } from '@/lib/utils'

interface RiskAssessmentProps {
  explanation?: ExplanationResult | null
  riskFlags: RiskFlag[]
  compact?: boolean
}

const riskIcons = {
  low: ShieldCheck,
  medium: ShieldAlert,
  high: ShieldX,
  unknown: AlertTriangle,
}

export function RiskAssessment({ explanation, riskFlags, compact = false }: RiskAssessmentProps) {
  // Determine overall risk level
  const riskLevel: RiskLevel = explanation?.risk_level ||
    (riskFlags.some(f => f.severity === 'high') ? 'high' :
     riskFlags.some(f => f.severity === 'medium') ? 'medium' :
     riskFlags.length > 0 ? 'low' : 'unknown')

  const Icon = riskIcons[riskLevel]
  const summary = explanation?.summary ||
    (riskFlags.length === 0
      ? '暂无明显风险提示。'
      : `识别到 ${riskFlags.length} 项潜在风险。`)
  const compactReasons = [
    ...(explanation?.risk_reasons || []),
    ...riskFlags.map((flag) => flag.description),
  ].filter(Boolean)
  const visibleReasons = compactReasons.slice(0, 3)

  if (compact) {
    return (
      <div className={cn(
        'rounded-md border border-muted/60 bg-background p-3 space-y-2',
        riskLevel === 'high' && 'border-risk-high/40',
        riskLevel === 'medium' && 'border-risk-medium/40'
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={cn(
              'h-4 w-4',
              riskLevel === 'low' && 'text-risk-low',
              riskLevel === 'medium' && 'text-risk-medium',
              riskLevel === 'high' && 'text-risk-high',
              riskLevel === 'unknown' && 'text-muted-foreground'
            )} />
            <span className="text-xs font-medium text-muted-foreground">风险</span>
          </div>
          <RiskBadge level={riskLevel} size="sm" />
        </div>
        <p className="text-sm leading-snug">{summary}</p>
        {visibleReasons.length > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {visibleReasons.map((reason, index) => (
              <li key={index} className="flex items-start gap-2">
                <span>•</span>
                <span className="line-clamp-2">{reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <Card className={cn(
      'border-muted/60 shadow-none',
      riskLevel === 'high' && 'border-risk-high/40',
      riskLevel === 'medium' && 'border-risk-medium/40'
    )}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          风险概览
        </CardTitle>
        <RiskBadge level={riskLevel} size="sm" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={cn(
          'flex items-start gap-3 rounded-lg px-3 py-2 text-sm',
          riskLevel === 'low' && 'bg-risk-low/10',
          riskLevel === 'medium' && 'bg-risk-medium/10',
          riskLevel === 'high' && 'bg-risk-high/10',
          riskLevel === 'unknown' && 'bg-muted'
        )}>
          <Icon className={cn(
            'h-4 w-4 mt-0.5',
            riskLevel === 'low' && 'text-risk-low',
            riskLevel === 'medium' && 'text-risk-medium',
            riskLevel === 'high' && 'text-risk-high',
            riskLevel === 'unknown' && 'text-muted-foreground'
          )} />
          <p className="text-sm">{summary}</p>
        </div>

        {visibleReasons.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">风险要点</p>
            <ul className="space-y-1 text-sm">
              {visibleReasons.map((reason, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span className="line-clamp-2">{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
