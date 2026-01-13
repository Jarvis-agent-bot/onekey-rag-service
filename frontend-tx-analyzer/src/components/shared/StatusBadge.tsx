import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { AnalyzeStatus } from '@/api/types'

interface StatusBadgeProps {
  status: AnalyzeStatus | 'success' | 'failed'
}

const statusConfig = {
  success: {
    label: 'Success',
    icon: CheckCircle2,
    variant: 'success' as const,
  },
  partial: {
    label: 'Partial',
    icon: AlertCircle,
    variant: 'warning' as const,
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    variant: 'danger' as const,
  },
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}
