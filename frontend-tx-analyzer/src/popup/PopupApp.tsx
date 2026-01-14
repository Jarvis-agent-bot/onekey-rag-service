import { useState, useEffect } from 'react'
import { Search, Settings, Shield, ShieldCheck, ShieldAlert, ShieldX, Loader2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CHAIN_INFO } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { AnalyzeResponse } from '@/api/types'
import type { PendingTransaction } from '@/types/extension'
import { InterceptedTxView } from './InterceptedTxView'

export function PopupApp() {
  const [chainId, setChainId] = useState<string>('1')
  const [txHash, setTxHash] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingTx, setPendingTx] = useState<PendingTransaction | null>(null)

  // Check for pending intercepted transaction or quick analyze
  useEffect(() => {
    async function checkPending() {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' })

      // Check for pending intercepted tx
      const pending = await chrome.runtime.sendMessage({ type: 'GET_PENDING_TX' })
      if (pending) {
        setPendingTx(pending)
        return
      }

      // Check for quick analyze from context menu
      const storage = await chrome.storage.local.get('tx_analyzer_quick_analyze')
      if (storage.tx_analyzer_quick_analyze) {
        const { txHash, timestamp } = storage.tx_analyzer_quick_analyze
        // Only use if less than 30 seconds old
        if (Date.now() - timestamp < 30000) {
          setTxHash(txHash)
          await chrome.storage.local.remove('tx_analyzer_quick_analyze')
        }
      }
    }
    checkPending()
  }, [])

  const handleAnalyze = async () => {
    if (!txHash.trim()) {
      setError('请输入交易哈希')
      return
    }

    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash.trim())) {
      setError('交易哈希格式不正确')
      return
    }

    setError(null)
    setIsLoading(true)
    setResult(null)

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ANALYZE_TX',
        payload: {
          chainId: parseInt(chainId),
          txHash: txHash.trim(),
          options: { include_explanation: true },
        },
      })

      if (response.error) {
        throw new Error(response.error)
      }

      setResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenOptions = () => {
    chrome.runtime.openOptionsPage()
  }

  const handleOpenSidepanel = () => {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' })
  }

  // Show intercepted transaction view if pending
  if (pendingTx) {
    return (
      <InterceptedTxView
        tx={pendingTx}
        onComplete={() => setPendingTx(null)}
      />
    )
  }

  return (
    <div className="w-[380px] min-h-[400px] bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-semibold text-lg">TX Analyzer</span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleOpenOptions}>
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-4">
        {/* Chain Select */}
        <div className="space-y-2">
          <Label htmlFor="chain">链</Label>
          <Select value={chainId} onValueChange={setChainId}>
            <SelectTrigger id="chain">
              <SelectValue placeholder="选择链" />
            </SelectTrigger>
            <SelectContent>
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

        {/* Transaction Hash Input */}
        <div className="space-y-2">
          <Label htmlFor="txHash">交易哈希</Label>
          <Input
            id="txHash"
            placeholder="0x..."
            value={txHash}
            onChange={(e) => {
              setTxHash(e.target.value)
              setError(null)
            }}
            className="font-mono text-sm"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        {/* Analyze Button */}
        <Button
          className="w-full"
          onClick={handleAnalyze}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              分析中...
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" />
              分析交易
            </>
          )}
        </Button>

        {/* Results */}
        {result && result.parse_result && (
          <Card>
            <CardContent className="pt-4 space-y-3">
              {/* Risk Level */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">风险等级</span>
                <RiskBadge level={result.explanation?.risk_level || 'unknown'} />
              </div>

              {/* Behavior Type */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">行为类型</span>
                <Badge variant="outline" className="capitalize">
                  {result.parse_result.behavior.type}
                </Badge>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">状态</span>
                <Badge
                  variant={result.parse_result.status === 'success' ? 'default' : 'destructive'}
                >
                  {result.parse_result.status}
                </Badge>
              </div>

              {/* Summary */}
              {result.explanation?.summary && (
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {result.explanation.summary}
                  </p>
                </div>
              )}

              {/* View Details */}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleOpenSidepanel}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                查看完整分析
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t text-center">
        <p className="text-xs text-muted-foreground">
          由 OneKey RAG 驱动
        </p>
      </div>
    </div>
  )
}

function RiskBadge({ level }: { level: string }) {
  const config = {
    low: { icon: ShieldCheck, color: 'text-green-500', bg: 'bg-green-500/10' },
    medium: { icon: ShieldAlert, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
    high: { icon: ShieldX, color: 'text-red-500', bg: 'bg-red-500/10' },
    unknown: { icon: Shield, color: 'text-gray-500', bg: 'bg-gray-500/10' },
  }

  const { icon: Icon, color, bg } = config[level as keyof typeof config] || config.unknown

  return (
    <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-full', bg)}>
      <Icon className={cn('h-4 w-4', color)} />
      <span className={cn('text-sm font-medium', color)}>
        {level === 'low' && '低'}
        {level === 'medium' && '中'}
        {level === 'high' && '高'}
        {level === 'unknown' && '未知'}
      </span>
    </div>
  )
}
