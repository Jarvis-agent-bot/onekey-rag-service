import { ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AddressDisplay, ChainBadge, StatusBadge, BehaviorBadge } from '@/components/shared'
import type { ParseResult } from '@/api/types'
import { formatWei, getExplorerUrl } from '@/lib/utils'

interface ResultOverviewProps {
  result: ParseResult
  compact?: boolean
}

export function ResultOverview({ result, compact = false }: ResultOverviewProps) {
  if (compact) {
    return (
      <div className="rounded-md border border-muted/60 bg-background p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">价值</span>
          <span className="font-mono text-sm">{formatWei(result.value)} ETH</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Gas</span>
          <span className="font-mono text-sm">{formatWei(result.gas.fee_paid)} ETH</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">From</span>
          <AddressDisplay address={result.from} chainId={result.chain_id} showActions={false} />
        </div>
        {result.to && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">To</span>
            <AddressDisplay address={result.to} chainId={result.chain_id} showActions={false} />
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">行为</span>
          <BehaviorBadge
            type={result.behavior.type}
            confidence={result.behavior.confidence}
            showConfidence={false}
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusBadge status={result.status} />
            <ChainBadge chainId={result.chain_id} />
          </div>
          <Button variant="ghost" size="sm" className="h-8 px-2" asChild>
            <a
              href={getExplorerUrl(result.chain_id, 'tx', result.tx_hash)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-1 h-4 w-4" />
              浏览器
            </a>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Card className="border-muted/60 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          交易概览
        </CardTitle>
        <div className="flex items-center gap-2">
          <StatusBadge status={result.status} />
          <ChainBadge chainId={result.chain_id} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">价值</p>
            <p className="font-medium font-mono">{formatWei(result.value)} ETH</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Gas 费</p>
            <p className="font-medium font-mono">{formatWei(result.gas.fee_paid)} ETH</p>
          </div>
        </div>

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

        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">行为</p>
            <BehaviorBadge
              type={result.behavior.type}
              confidence={result.behavior.confidence}
              showConfidence
            />
          </div>
          <Button variant="ghost" size="sm" className="h-8" asChild>
            <a
              href={getExplorerUrl(result.chain_id, 'tx', result.tx_hash)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              区块浏览器
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
