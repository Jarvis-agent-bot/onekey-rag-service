import { History, Search, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ChainBadge, RiskBadge, StatusBadge, BehaviorBadge } from '@/components/shared'
import { CHAIN_INFO } from '@/lib/constants'
import { shortenHash, formatTimeAgo } from '@/lib/utils'
import type { BehaviorType, RiskLevel, AnalyzeStatus } from '@/api/types'

// Mock data for demonstration
const mockHistory = [
  {
    trace_id: 'tx_001',
    chain_id: 1,
    tx_hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    behavior_type: 'swap' as BehaviorType,
    risk_level: 'low' as RiskLevel,
    status: 'success' as AnalyzeStatus,
    created_at: new Date(Date.now() - 120000).toISOString(),
    total_ms: 1234,
  },
  {
    trace_id: 'tx_002',
    chain_id: 56,
    tx_hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    behavior_type: 'approve' as BehaviorType,
    risk_level: 'high' as RiskLevel,
    status: 'success' as AnalyzeStatus,
    created_at: new Date(Date.now() - 300000).toISOString(),
    total_ms: 2341,
  },
  {
    trace_id: 'tx_003',
    chain_id: 137,
    tx_hash: '0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
    behavior_type: 'transfer' as BehaviorType,
    risk_level: 'low' as RiskLevel,
    status: 'partial' as AnalyzeStatus,
    created_at: new Date(Date.now() - 600000).toISOString(),
    total_ms: 890,
  },
]

export function HistoryPage() {
  const [chainFilter, setChainFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const filteredHistory = mockHistory.filter((item) => {
    if (chainFilter !== 'all' && item.chain_id !== parseInt(chainFilter)) {
      return false
    }
    if (statusFilter !== 'all' && item.status !== statusFilter) {
      return false
    }
    if (search && !item.tx_hash.toLowerCase().includes(search.toLowerCase())) {
      return false
    }
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <History className="h-6 w-6" />
          Analysis History
        </h1>
        <Button variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="w-[180px]">
              <Select value={chainFilter} onValueChange={setChainFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Chains" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Chains</SelectItem>
                  {Object.entries(CHAIN_INFO).map(([id, info]) => (
                    <SelectItem key={id} value={id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: info.color }}
                        />
                        {info.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-[150px]">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by tx hash..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium">Chain</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Tx Hash</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Behavior</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Risk</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Time</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No history records found
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((item) => (
                    <tr
                      key={item.trace_id}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <ChainBadge chainId={item.chain_id} showName={false} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-sm font-mono">
                          {shortenHash(item.tx_hash)}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <BehaviorBadge type={item.behavior_type} />
                      </td>
                      <td className="px-4 py-3">
                        <RiskBadge level={item.risk_level} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatTimeAgo(new Date(item.created_at).getTime() / 1000)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="font-mono">
                          {item.total_ms}ms
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="text-center text-sm text-muted-foreground">
        History feature is a demo. Real data will be available after backend integration.
      </div>
    </div>
  )
}
