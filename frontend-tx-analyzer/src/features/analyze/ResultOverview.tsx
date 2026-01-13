import { ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { AddressDisplay, ChainBadge, StatusBadge, BehaviorBadge } from '@/components/shared'
import type { ParseResult } from '@/api/types'
import { formatWei, formatTimestamp, getExplorerUrl } from '@/lib/utils'

interface ResultOverviewProps {
  result: ParseResult
}

export function ResultOverview({ result }: ResultOverviewProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-medium">Overview</CardTitle>
        <div className="flex items-center gap-2">
          <StatusBadge status={result.status} />
          <ChainBadge chainId={result.chain_id} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Block</p>
            <p className="font-medium">
              {result.block_number?.toLocaleString() || 'Pending'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Time</p>
            <p className="font-medium">
              {result.timestamp ? formatTimestamp(result.timestamp) : 'N/A'}
            </p>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">From</span>
            <AddressDisplay address={result.from} chainId={result.chain_id} />
          </div>
          {result.to && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">To</span>
              <AddressDisplay address={result.to} chainId={result.chain_id} />
            </div>
          )}
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Value</p>
            <p className="font-medium font-mono">
              {formatWei(result.value)} ETH
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Gas Fee</p>
            <p className="font-medium font-mono">
              {formatWei(result.gas.fee_paid)} ETH
            </p>
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Behavior</p>
            <BehaviorBadge
              type={result.behavior.type}
              confidence={result.behavior.confidence}
              showConfidence
            />
          </div>
          <Button variant="outline" size="sm" asChild>
            <a
              href={getExplorerUrl(result.chain_id, 'tx', result.tx_hash)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Explorer
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
