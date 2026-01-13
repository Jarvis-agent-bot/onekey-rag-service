import { Badge } from '@/components/ui/badge'
import { CHAIN_INFO } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface ChainBadgeProps {
  chainId: number
  showName?: boolean
  size?: 'sm' | 'md'
}

export function ChainBadge({ chainId, showName = true, size = 'md' }: ChainBadgeProps) {
  const chain = CHAIN_INFO[chainId]

  if (!chain) {
    return (
      <Badge variant="outline" className={cn(size === 'sm' && 'text-xs px-1.5')}>
        Chain {chainId}
      </Badge>
    )
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5',
        size === 'sm' && 'text-xs px-1.5 py-0'
      )}
      style={{ borderColor: chain.color }}
    >
      <span
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: chain.color }}
      />
      {showName ? chain.name : chain.shortName}
    </Badge>
  )
}
