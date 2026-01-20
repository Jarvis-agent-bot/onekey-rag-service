import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, Code, Copy, ExternalLink, Info, Database } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { copyToClipboard } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import type { DecodedCalldata, FormattedCalldata, AbiSource } from '@/api/types'

interface CalldataResultProps {
  result: DecodedCalldata
  formatted: FormattedCalldata | null
}

// 风险等级颜色
const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-500/10 text-green-500 border-green-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  high: 'bg-red-500/10 text-red-500 border-red-500/20',
  critical: 'bg-red-600/10 text-red-600 border-red-600/20',
  unknown: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
}

// 行为类型中文映射
const BEHAVIOR_LABELS: Record<string, string> = {
  swap: 'Swap 交换',
  transfer: 'Transfer 转账',
  approve: 'Approve 授权',
  stake: 'Stake 质押',
  unstake: 'Unstake 解除质押',
  deposit: 'Deposit 存入',
  withdraw: 'Withdraw 取出',
  liquidity_add: 'Add Liquidity 添加流动性',
  liquidity_remove: 'Remove Liquidity 移除流动性',
  mint: 'Mint 铸造',
  burn: 'Burn 销毁',
  borrow: 'Borrow 借贷',
  repay: 'Repay 还款',
  lend: 'Lend 存款',
  claim: 'Claim 领取',
  wrap: 'Wrap 包装',
  unwrap: 'Unwrap 解包装',
  unknown: 'Unknown 未知',
}

// ABI 来源显示
const ABI_SOURCE_LABELS: Record<AbiSource, { label: string; color: string }> = {
  user_provided: { label: 'User ABI', color: 'bg-blue-500/10 text-blue-500' },
  local_registry: { label: 'Known Protocol', color: 'bg-green-500/10 text-green-500' },
  etherscan: { label: 'Etherscan', color: 'bg-purple-500/10 text-purple-500' },
  '4bytes': { label: '4bytes DB', color: 'bg-yellow-500/10 text-yellow-500' },
  none: { label: 'Not Decoded', color: 'bg-gray-500/10 text-gray-500' },
}

export function CalldataResult({ result, formatted }: CalldataResultProps) {
  const { toast } = useToast()

  const handleCopy = async (text: string, label: string) => {
    try {
      await copyToClipboard(text)
      toast({ title: `${label} copied to clipboard` })
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      {/* 警告提示 */}
      {result.warnings.length > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-yellow-500">Warnings</p>
                <ul className="text-sm space-y-1">
                  {result.warnings.map((warning, i) => (
                    <li key={i} className="text-yellow-600 dark:text-yellow-400">
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 协议信息 */}
      {result.protocol_info && (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="font-medium text-blue-500">{result.protocol_info.protocol}</p>
                  <p className="text-sm text-muted-foreground">
                    {result.protocol_info.name} ({result.protocol_info.type})
                  </p>
                </div>
              </div>
              {result.protocol_info.website && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                >
                  <a href={result.protocol_info.website} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Website
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 资产变化预测 (Pay/Receive) */}
      {formatted?.asset_changes && (formatted.asset_changes.pay.length > 0 || formatted.asset_changes.receive.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Asset Changes Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Pay (Out) */}
            {formatted.asset_changes.pay.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-red-500 flex items-center gap-1">
                  <ArrowUpRight className="h-4 w-4" />
                  Pay
                </p>
                <div className="space-y-2">
                  {formatted.asset_changes.pay.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                          <span className="text-xs font-bold text-red-500">
                            {item.token.slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{item.token}</p>
                          <p className="text-xs text-muted-foreground">{item.name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-red-500">-{item.amount}</p>
                        <p className="text-xs text-muted-foreground">{item.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Receive (In) */}
            {formatted.asset_changes.receive.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-green-500 flex items-center gap-1">
                  <ArrowDownLeft className="h-4 w-4" />
                  Receive
                </p>
                <div className="space-y-2">
                  {formatted.asset_changes.receive.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                          <span className="text-xs font-bold text-green-500">
                            {item.token.slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{item.token}</p>
                          <p className="text-xs text-muted-foreground">{item.name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-green-500">+{item.amount}</p>
                        <p className="text-xs text-muted-foreground">{item.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 函数信息 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Code className="h-5 w-5" />
              Function
            </CardTitle>
            <div className="flex gap-2 flex-wrap">
              {/* ABI 来源 */}
              {result.abi_source && ABI_SOURCE_LABELS[result.abi_source] && (
                <Badge variant="outline" className={ABI_SOURCE_LABELS[result.abi_source].color}>
                  {ABI_SOURCE_LABELS[result.abi_source].label}
                </Badge>
              )}
              <Badge variant="outline" className={RISK_COLORS[result.risk_level]}>
                Risk: {result.risk_level.toUpperCase()}
              </Badge>
              <Badge variant="secondary">
                {BEHAVIOR_LABELS[result.behavior_type] || result.behavior_type}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 函数名和选择器 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Function Name</p>
              <div className="flex items-center gap-2">
                <code className="text-sm font-semibold">
                  {result.function_name || 'Unknown'}
                </code>
                {result.function_name && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleCopy(result.function_name, 'Function name')}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Selector</p>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                  {result.selector}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleCopy(result.selector, 'Selector')}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* 函数签名 */}
          {result.function_signature && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Signature</p>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono bg-muted px-2 py-1 rounded break-all">
                  {result.function_signature}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => handleCopy(result.function_signature, 'Signature')}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {/* 可能的签名 (如果有多个) */}
          {result.possible_signatures.length > 1 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Possible Signatures</p>
              <div className="text-xs space-y-1">
                {result.possible_signatures.slice(0, 5).map((sig, i) => (
                  <code key={i} className="block font-mono bg-muted/50 px-2 py-0.5 rounded">
                    {sig}
                  </code>
                ))}
                {result.possible_signatures.length > 5 && (
                  <p className="text-muted-foreground">
                    ... and {result.possible_signatures.length - 5} more
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 参数列表 */}
      {formatted && formatted.parameters.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Parameters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {formatted.parameters.map((param, index) => (
                <div key={index} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{param.name || `arg${index}`}</span>
                      <Badge variant="outline" className="text-xs font-mono">
                        {param.type}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleCopy(String(param.value), param.name)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <code className="text-xs font-mono bg-muted px-2 py-1 rounded block break-all">
                      {String(param.value)}
                    </code>
                    {param.display && param.display !== String(param.value) && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        {param.display}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 风险标签 */}
      {result.risk_flags.length > 0 && (
        <Card className="border-red-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-5 w-5" />
              Risk Flags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {result.risk_flags.map((flag, index) => (
                <div key={index} className="border border-red-500/20 rounded-lg p-3 bg-red-500/5">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="destructive" className="text-xs">
                      {flag.severity.toUpperCase()}
                    </Badge>
                    <span className="font-medium text-sm">{flag.type}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{flag.description}</p>
                  {flag.evidence && (
                    <code className="text-xs font-mono text-muted-foreground mt-1 block">
                      Evidence: {flag.evidence}
                    </code>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 合约类型识别 (仅在没有 protocol_info 时显示) */}
      {result.contract_type && !result.protocol_info && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm">
                Recognized contract type:{' '}
                <span className="font-medium">{result.contract_type}</span>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ABI 来源提示 (如果是 4bytes，提示可能不准确) */}
      {result.abi_source === '4bytes' && (
        <Card className="border-yellow-500/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
              <Info className="h-4 w-4" />
              <span className="text-sm">
                Function decoded from 4bytes signature database.
                Multiple functions may share the same selector - verify with the actual contract ABI if available.
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
