import * as LucideIcons from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { BEHAVIOR_LABELS, CONFIDENCE_LABELS } from '@/lib/constants'
import type { BehaviorType } from '@/api/types'
import { cn } from '@/lib/utils'

interface BehaviorBadgeProps {
  type: BehaviorType
  confidence?: 'high' | 'medium' | 'low'
  showConfidence?: boolean
}

export function BehaviorBadge({
  type,
  confidence,
  showConfidence = false,
}: BehaviorBadgeProps) {
  const behavior = BEHAVIOR_LABELS[type] || BEHAVIOR_LABELS.unknown
  const IconName = behavior.icon as keyof typeof LucideIcons
  const Icon = (LucideIcons[IconName] || LucideIcons.HelpCircle) as React.ComponentType<{ className?: string }>

  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="gap-1.5">
        <Icon className="h-3 w-3" />
        {behavior.label}
      </Badge>
      {showConfidence && confidence && (
        <span
          className={cn(
            'text-xs',
            CONFIDENCE_LABELS[confidence].color
          )}
        >
          ({CONFIDENCE_LABELS[confidence].label})
        </span>
      )}
    </div>
  )
}
