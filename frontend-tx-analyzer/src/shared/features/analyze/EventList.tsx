import { Activity } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AddressDisplay } from '@/components/shared'
import type { DecodedEvent } from '@/api/types'

interface EventListProps {
  events: DecodedEvent[]
  chainId: number
  diagnostics?: {
    events?: { status?: string; reason?: string; logs_count?: number }
    abi?: { status?: string; reason?: string; source?: string; ref?: string; error?: string }
  }
}

const eventTypeColors: Record<string, string> = {
  transfer_erc20: 'bg-blue-500/10 text-blue-600',
  transfer_erc721: 'bg-purple-500/10 text-purple-600',
  approval_erc20: 'bg-yellow-500/10 text-yellow-600',
  approval_for_all: 'bg-orange-500/10 text-orange-600',
  swap_v2: 'bg-green-500/10 text-green-600',
  swap_v3: 'bg-emerald-500/10 text-emerald-600',
  mint: 'bg-pink-500/10 text-pink-600',
  burn: 'bg-red-500/10 text-red-600',
  deposit: 'bg-cyan-500/10 text-cyan-600',
  withdrawal: 'bg-indigo-500/10 text-indigo-600',
}

export function EventList({ events, chainId, diagnostics }: EventListProps) {
  if (events.length === 0) {
    const formatReason = (value?: string) => {
      if (!value) return ''
      const map: Record<string, string> = {
        no_logs: '交易无日志',
        abi_missing: '缺少 ABI',
        decode_failed: '解码失败',
        not_verified: '合约未验证',
        missing_api_key: '缺少 Etherscan API Key',
        rate_limited: 'Etherscan 限流（429）',
        timeout: 'Etherscan 请求超时',
        http_error: 'Etherscan HTTP 错误',
        network_error: 'Etherscan 网络错误',
        api_error: 'Etherscan 接口错误',
        error: '调用异常',
      }
      return map[value] || value
    }

    const reason = diagnostics?.events?.reason
    const logsCount = diagnostics?.events?.logs_count
    const abiReason = diagnostics?.abi?.reason
    const abiSource = diagnostics?.abi?.source
    const abiError = diagnostics?.abi?.error
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>未解析到事件。</p>
            {typeof logsCount === 'number' && <p>日志数量: {logsCount}</p>}
            {reason && <p>原因: {formatReason(reason)}</p>}
            {abiSource && <p>ABI 来源: {abiSource}</p>}
            {abiReason && <p>ABI 原因: {formatReason(abiReason)}</p>}
            {abiError && <p>ABI 错误: {abiError}</p>}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Events
          <Badge variant="secondary" className="ml-2">
            {events.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {events.map((event, index) => (
            <div
              key={index}
              className="rounded-lg border p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium">{event.name}</span>
                  {event.event_type && (
                    <Badge
                      className={eventTypeColors[event.event_type] || 'bg-muted'}
                    >
                      {event.event_type.replace(/_/g, ' ')}
                    </Badge>
                  )}
                </div>
                <Badge variant="outline" className="text-xs">
                  Log #{event.log_index}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Contract:</span>
                <AddressDisplay address={event.address} chainId={chainId} />
              </div>

              {Object.keys(event.args).length > 0 && (
                <div className="rounded-md bg-muted/50 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Arguments
                  </p>
                  <div className="space-y-1">
                    {Object.entries(event.args).map(([key, value]) => (
                      <div key={key} className="flex items-start gap-2 text-sm">
                        <span className="font-mono text-muted-foreground">
                          {key}:
                        </span>
                        <span className="font-mono break-all">
                          {formatEventValue(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function formatEventValue(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') {
    // Shorten long hex strings
    if (value.startsWith('0x') && value.length > 20) {
      return `${value.slice(0, 10)}...${value.slice(-8)}`
    }
    return value
  }
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return `[${value.length} items]`
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
