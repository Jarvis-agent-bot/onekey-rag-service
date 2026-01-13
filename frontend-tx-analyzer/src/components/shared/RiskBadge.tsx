import { ShieldCheck, ShieldAlert, ShieldX, HelpCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { RiskLevel } from '@/api/types'
import { cn } from '@/lib/utils'

interface RiskBadgeProps {
  level: RiskLevel
  showIcon?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const riskConfig = {
  low: {
    label: 'Low Risk',
    icon: ShieldCheck,
    variant: 'success' as const,
    className: 'text-risk-low',
  },
  medium: {
    label: 'Medium Risk',
    icon: ShieldAlert,
    variant: 'warning' as const,
    className: 'text-risk-medium',
  },
  high: {
    label: 'High Risk',
    icon: ShieldX,
    variant: 'danger' as const,
    className: 'text-risk-high',
  },
  unknown: {
    label: 'Unknown',
    icon: HelpCircle,
    variant: 'outline' as const,
    className: 'text-muted-foreground',
  },
}

export function RiskBadge({ level, showIcon = true, size = 'md' }: RiskBadgeProps) {
  const config = riskConfig[level]
  const Icon = config.icon

  return (
    <Badge
      variant={config.variant}
      className={cn(
        'gap-1',
        size === 'sm' && 'text-xs px-1.5 py-0',
        size === 'lg' && 'text-sm px-3 py-1'
      )}
    >
      {showIcon && (
        <Icon
          className={cn(
            'h-3 w-3',
            size === 'lg' && 'h-4 w-4'
          )}
        />
      )}
      {config.label}
    </Badge>
  )
}
