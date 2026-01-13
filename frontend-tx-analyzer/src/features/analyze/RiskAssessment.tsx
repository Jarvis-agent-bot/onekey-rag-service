import { ShieldCheck, ShieldAlert, ShieldX, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RiskBadge } from '@/components/shared'
import type { ExplanationResult, RiskFlag, RiskLevel } from '@/api/types'
import { cn } from '@/lib/utils'

interface RiskAssessmentProps {
  explanation?: ExplanationResult | null
  riskFlags: RiskFlag[]
}

const riskIcons = {
  low: ShieldCheck,
  medium: ShieldAlert,
  high: ShieldX,
  unknown: AlertTriangle,
}

export function RiskAssessment({ explanation, riskFlags }: RiskAssessmentProps) {
  // Determine overall risk level
  const riskLevel: RiskLevel = explanation?.risk_level ||
    (riskFlags.some(f => f.severity === 'high') ? 'high' :
     riskFlags.some(f => f.severity === 'medium') ? 'medium' :
     riskFlags.length > 0 ? 'low' : 'unknown')

  const Icon = riskIcons[riskLevel]

  return (
    <Card className={cn(
      riskLevel === 'high' && 'border-risk-high/50',
      riskLevel === 'medium' && 'border-risk-medium/50'
    )}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-medium">Risk Assessment</CardTitle>
        <RiskBadge level={riskLevel} size="lg" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn(
          'flex items-start gap-3 rounded-lg p-4',
          riskLevel === 'low' && 'bg-risk-low/10',
          riskLevel === 'medium' && 'bg-risk-medium/10',
          riskLevel === 'high' && 'bg-risk-high/10',
          riskLevel === 'unknown' && 'bg-muted'
        )}>
          <Icon className={cn(
            'h-5 w-5 mt-0.5',
            riskLevel === 'low' && 'text-risk-low',
            riskLevel === 'medium' && 'text-risk-medium',
            riskLevel === 'high' && 'text-risk-high',
            riskLevel === 'unknown' && 'text-muted-foreground'
          )} />
          <div className="flex-1 space-y-2">
            {explanation?.summary ? (
              <p className="text-sm">{explanation.summary}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {riskFlags.length === 0
                  ? 'No significant risks detected in this transaction.'
                  : `${riskFlags.length} potential risk${riskFlags.length > 1 ? 's' : ''} identified.`}
              </p>
            )}
          </div>
        </div>

        {/* Risk reasons from RAG */}
        {explanation?.risk_reasons && explanation.risk_reasons.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Risk Factors:</p>
            <ul className="space-y-1">
              {explanation.risk_reasons.map((reason, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <span className="text-muted-foreground">•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Risk flags from parser */}
        {riskFlags.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Detected Issues:</p>
            <div className="space-y-2">
              {riskFlags.map((flag, index) => (
                <div
                  key={index}
                  className={cn(
                    'rounded-md border p-3',
                    flag.severity === 'high' && 'border-risk-high/50 bg-risk-high/5',
                    flag.severity === 'medium' && 'border-risk-medium/50 bg-risk-medium/5',
                    flag.severity === 'low' && 'border-risk-low/50 bg-risk-low/5'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      'text-xs font-medium uppercase',
                      flag.severity === 'high' && 'text-risk-high',
                      flag.severity === 'medium' && 'text-risk-medium',
                      flag.severity === 'low' && 'text-risk-low'
                    )}>
                      {flag.severity}
                    </span>
                    <span className="text-sm font-medium">{flag.type}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {flag.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
