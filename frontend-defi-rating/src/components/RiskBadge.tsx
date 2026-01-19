import { clsx } from 'clsx'
import type { RiskLevel } from '../types'
import { RISK_LABELS } from '../types'

interface RiskBadgeProps {
  level: RiskLevel
  size?: 'sm' | 'md' | 'lg'
}

export default function RiskBadge({ level, size = 'md' }: RiskBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5',
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center font-medium rounded-full',
        sizeClasses[size],
        {
          'bg-green-100 text-green-800': level === 'low',
          'bg-yellow-100 text-yellow-800': level === 'medium',
          'bg-red-100 text-red-800': level === 'high',
          'bg-red-900 text-white': level === 'critical',
        }
      )}
    >
      {RISK_LABELS[level]}
    </span>
  )
}
