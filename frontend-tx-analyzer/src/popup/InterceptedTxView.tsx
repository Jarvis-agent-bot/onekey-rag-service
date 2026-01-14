import { useState, useEffect } from 'react'
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Loader2,
  AlertTriangle,
  X,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CHAIN_INFO } from '@/lib/constants'
import type { AnalyzeResponse } from '@/api/types'
import type { PendingTransaction, TxAction } from '@/types/extension'

interface InterceptedTxViewProps {
  tx: PendingTransaction
  onComplete: () => void
}

export function InterceptedTxView({ tx, onComplete }: InterceptedTxViewProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(true)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isResponding, setIsResponding] = useState(false)

  const chainInfo = CHAIN_INFO[tx.chainId] || { name: `Chain ${tx.chainId}`, color: '#888' }

  // Auto-analyze on mount
  useEffect(() => {
    analyzeTransaction()
  }, [])

  const analyzeTransaction = async () => {
    setIsAnalyzing(true)
    setError(null)

    try {
      // For unsigned transactions, we can't use tx hash
      // Instead, we'll do a quick risk assessment based on the calldata
      // This is a simplified analysis - full analysis would require backend support

      // Simulate analysis for now
      await new Promise((resolve) => setTimeout(resolve, 1500))

      // Create a mock result for demonstration
      // In production, this would call a /v1/tx/preview endpoint
      setResult({
        trace_id: `preview_${tx.id}`,
        status: 'partial',
        parse_result: {
          version: '1.0.0',
          tx_hash: 'pending',
          chain_id: tx.chainId,
          block_number: null,
          timestamp: null,
          from: tx.tx.from,
          to: tx.tx.to,
          nonce: null,
          tx_type: null,
          value: tx.tx.value,
          input: tx.tx.data,
          gas: { gas_used: '0', gas_price: '0', fee_paid: '0' },
          status: 'success',
          method: null,
          events: [],
          behavior: {
            type: tx.tx.data === '0x' ? 'transfer' : 'unknown',
            confidence: 'medium',
            evidence: [],
            details: {},
          },
          risk_flags: analyzeRiskFlags(tx),
        },
        explanation: {
          summary: generateSummary(tx),
          risk_level: determineRiskLevel(tx),
          risk_reasons: getRiskReasons(tx),
          actions: [],
          sources: [],
        },
        timings: { total_ms: 1500 },
        error: null,
        trace_log: null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleAction = async (action: TxAction) => {
    setIsResponding(true)
    try {
      await chrome.runtime.sendMessage({
        type: 'TX_INTERCEPT_RESPONSE',
        payload: { txId: tx.id, action },
      })
      onComplete()
    } catch (err) {
      console.error('Failed to respond:', err)
    } finally {
      setIsResponding(false)
    }
  }

  const riskLevel = result?.explanation?.risk_level || 'unknown'

  return (
    <div className="w-full min-h-[400px] bg-background">
      {/* Header */}
      <div className={cn(
        'p-4 border-b',
        riskLevel === 'high' && 'bg-red-500/10 border-red-500/30',
        riskLevel === 'medium' && 'bg-yellow-500/10 border-yellow-500/30',
        riskLevel === 'low' && 'bg-green-500/10 border-green-500/30',
      )}>
        <div className="flex items-center gap-3">
          <AlertTriangle className={cn(
            'h-6 w-6',
            riskLevel === 'high' && 'text-red-500',
            riskLevel === 'medium' && 'text-yellow-500',
            riskLevel === 'low' && 'text-green-500',
            riskLevel === 'unknown' && 'text-gray-500',
          )} />
          <div>
            <h2 className="font-semibold">交易安全检查</h2>
            <p className="text-sm text-muted-foreground">
              签名前的风险提示
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Origin */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">发起来源</span>
          <span className="font-mono truncate max-w-[200px]">{tx.origin}</span>
        </div>

        {/* Chain */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">网络</span>
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: chainInfo.color }}
            />
            <span>{chainInfo.name}</span>
          </div>
        </div>

        {/* Loading */}
        {isAnalyzing && (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3">正在分析交易...</span>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {error && (
          <Card className="border-red-500/50 bg-red-500/10">
            <CardContent className="pt-4">
              <p className="text-sm text-red-500">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {result && !isAnalyzing && (
          <>
            {/* Risk Level */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <RiskIcon level={riskLevel} />
                  <div className="flex-1">
                    <div className="font-medium">
                      {riskLevel === 'low' && '低风险'}
                      {riskLevel === 'medium' && '中风险'}
                      {riskLevel === 'high' && '高风险'}
                      {riskLevel === 'unknown' && '风险未知'}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {result.explanation?.summary || '无法确定风险等级'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Risk Flags */}
            {result.parse_result?.risk_flags && result.parse_result.risk_flags.length > 0 && (
              <Card className="border-yellow-500/50">
                <CardContent className="pt-4 space-y-2">
                <div className="font-medium text-yellow-600">风险提示</div>
                {result.parse_result.risk_flags.map((flag, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                    <span>{flag.description}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

            {/* Transaction Details */}
            <div className="text-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">接收地址</span>
                <span className="font-mono truncate max-w-[200px]">{tx.tx.to || '合约创建'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">金额</span>
                <span>{formatValue(tx.tx.value)}</span>
              </div>
              {result.parse_result?.behavior && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">类型</span>
                  <Badge variant="outline" className="capitalize">
                    {result.parse_result.behavior.type}
                  </Badge>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t space-y-3">
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => handleAction('reject')}
            disabled={isResponding}
          >
            <X className="mr-2 h-4 w-4" />
            拒绝
          </Button>
          <Button
            className={cn(
              'flex-1',
              riskLevel === 'high' && 'bg-red-500 hover:bg-red-600',
              riskLevel === 'medium' && 'bg-yellow-500 hover:bg-yellow-600',
            )}
            onClick={() => handleAction('approve')}
            disabled={isResponding || isAnalyzing}
          >
            {isResponding ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            {riskLevel === 'high' ? '仍然签名' : '继续'}
          </Button>
        </div>

        {riskLevel === 'high' && (
          <p className="text-xs text-red-500 text-center">
            该交易存在高风险提示，请谨慎确认。
          </p>
        )}
      </div>
    </div>
  )
}

function RiskIcon({ level }: { level: string }) {
  const config = {
    low: { icon: ShieldCheck, color: 'text-green-500' },
    medium: { icon: ShieldAlert, color: 'text-yellow-500' },
    high: { icon: ShieldX, color: 'text-red-500' },
    unknown: { icon: Shield, color: 'text-gray-500' },
  }

  const { icon: Icon, color } = config[level as keyof typeof config] || config.unknown

  return <Icon className={cn('h-8 w-8', color)} />
}

// Helper functions for basic risk analysis
function analyzeRiskFlags(tx: PendingTransaction) {
  const flags = []

  // Check for unlimited approval
  if (tx.tx.data.startsWith('0x095ea7b3')) {
    const amountHex = tx.tx.data.slice(74)
    if (amountHex === 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff') {
      flags.push({
        type: 'unlimited_approve',
        severity: 'medium' as const,
        evidence: '批准额度为无限',
        description: '本交易将授予无限额度的代币授权',
      })
    }
  }

  // Check for setApprovalForAll
  if (tx.tx.data.startsWith('0xa22cb465')) {
    flags.push({
      type: 'nft_approval_for_all',
      severity: 'medium' as const,
      evidence: '检测到 setApprovalForAll',
      description: '将为该合集内全部 NFT 授权',
    })
  }

  // Check for transfer to zero address
  if (tx.tx.to && /^0x0{40}$/i.test(tx.tx.to)) {
    flags.push({
      type: 'transfer_to_zero',
      severity: 'high' as const,
      evidence: '接收地址为零地址',
      description: '交易指向零地址，存在高风险',
    })
  }

  // Check for high value transfer
  const valueWei = BigInt(tx.tx.value || '0')
  if (valueWei > BigInt('1000000000000000000')) {
    flags.push({
      type: 'high_value_transfer',
      severity: 'low' as const,
      evidence: `Value: ${formatValue(tx.tx.value)}`,
      description: '该交易涉及较大金额',
    })
  }

  return flags
}

function determineRiskLevel(tx: PendingTransaction): 'low' | 'medium' | 'high' | 'unknown' {
  const flags = analyzeRiskFlags(tx)

  if (flags.some((f) => f.severity === 'high')) return 'high'
  if (flags.some((f) => f.severity === 'medium')) return 'medium'
  if (flags.length > 0) return 'low'

  return 'low'
}

function getRiskReasons(tx: PendingTransaction): string[] {
  return analyzeRiskFlags(tx).map((f) => f.description)
}

function generateSummary(tx: PendingTransaction): string {
  if (tx.tx.data === '0x' || !tx.tx.data) {
    return '该交易可能是原生代币转账。'
  }

  if (tx.tx.data.startsWith('0x095ea7b3')) {
    return '该交易请求代币授权。'
  }

  if (tx.tx.data.startsWith('0xa22cb465')) {
    return '该交易请求 NFT 全部授权。'
  }

  return '无法确定交易目的，请仔细确认。'
}

function formatValue(value: string): string {
  try {
    const wei = BigInt(value || '0')
    const eth = Number(wei) / 1e18
    return `${eth.toFixed(4)} ETH`
  } catch {
    return value
  }
}
