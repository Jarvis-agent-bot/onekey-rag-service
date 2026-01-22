import { ArrowDownLeft, ArrowUpRight, Coins } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ExplanationResult, SimulationResult, AssetChange } from '@/api/types'
import { cn } from '@/lib/utils'

interface AssetChangesProps {
  /** 来自 RAG 解释的资产变化 */
  explanation?: ExplanationResult | null
  /** 来自交易模拟的资产变化 */
  simulation?: SimulationResult | null
  /** 来自 calldata 解码的资产变化 */
  calldataAssets?: AssetChange[] | null
  className?: string
}

interface NormalizedAsset {
  token: string
  name?: string
  amount: string
  direction: 'in' | 'out'
  source: 'rag' | 'simulation' | 'calldata'
}

export function AssetChanges({ explanation, simulation, calldataAssets, className }: AssetChangesProps) {
  // 标准化资产变化数据
  const normalizedAssets: NormalizedAsset[] = []

  // 1. 优先使用模拟结果的 asset_changes (最准确，有 direction)
  if (simulation?.asset_changes?.length) {
    simulation.asset_changes.forEach(change => {
      normalizedAssets.push({
        token: change.symbol || '??',
        name: change.token,
        amount: change.formatted_change || change.change,
        direction: change.direction,
        source: 'simulation',
      })
    })
  } else if (simulation?.token_transfers?.length) {
    // token_transfers 没有 direction，暂时都当作 in
    simulation.token_transfers.forEach(transfer => {
      normalizedAssets.push({
        token: transfer.symbol || transfer.token_address?.slice(0, 8) || '??',
        amount: transfer.formatted_amount || transfer.amount,
        direction: 'in', // token_transfers 没有明确方向
        source: 'simulation',
      })
    })
  }

  // 2. 其次使用 calldata 解码的资产变化
  if (!normalizedAssets.length && calldataAssets?.length) {
    calldataAssets.forEach(change => {
      normalizedAssets.push({
        token: change.symbol || '??',
        name: change.token,
        amount: change.formatted_change || change.change,
        direction: change.direction === 'out' ? 'out' : 'in',
        source: 'calldata',
      })
    })
  }

  // 3. 最后使用 RAG 解释的资产 (可能不太准确)
  if (!normalizedAssets.length && explanation?.actions?.[0]) {
    const action = explanation.actions[0] as { assets?: Array<{ token?: string; amount?: string; direction?: string }> }
    action.assets?.forEach(asset => {
      normalizedAssets.push({
        token: asset.token || '??',
        amount: asset.amount || '?',
        direction: asset.direction === 'out' ? 'out' : 'in',
        source: 'rag',
      })
    })
  }

  // 分离支出和收入
  const payAssets = normalizedAssets.filter(a => a.direction === 'out')
  const receiveAssets = normalizedAssets.filter(a => a.direction === 'in')

  if (normalizedAssets.length === 0) {
    return null
  }

  return (
    <Card className={cn('border-muted/60 shadow-none', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Coins className="h-4 w-4" />
          资产变化
          {normalizedAssets[0]?.source === 'simulation' && (
            <span className="text-xs font-normal text-muted-foreground">(模拟预测)</span>
          )}
          {normalizedAssets[0]?.source === 'rag' && (
            <span className="text-xs font-normal text-muted-foreground">(AI 预测)</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 支出 */}
        {payAssets.length > 0 && (
          <div className="space-y-2">
            {payAssets.map((asset, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 bg-red-500/5 border border-red-500/20 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                    <ArrowUpRight className="h-4 w-4 text-red-500" />
                  </div>
                  <div>
                    <p className="font-medium">{asset.token}</p>
                    {asset.name && (
                      <p className="text-xs text-muted-foreground">{asset.name}</p>
                    )}
                  </div>
                </div>
                <p className="font-mono text-red-500 font-medium">
                  -{asset.amount}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* 收入 */}
        {receiveAssets.length > 0 && (
          <div className="space-y-2">
            {receiveAssets.map((asset, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 bg-green-500/5 border border-green-500/20 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                    <ArrowDownLeft className="h-4 w-4 text-green-500" />
                  </div>
                  <div>
                    <p className="font-medium">{asset.token}</p>
                    {asset.name && (
                      <p className="text-xs text-muted-foreground">{asset.name}</p>
                    )}
                  </div>
                </div>
                <p className="font-mono text-green-500 font-medium">
                  +{asset.amount}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
