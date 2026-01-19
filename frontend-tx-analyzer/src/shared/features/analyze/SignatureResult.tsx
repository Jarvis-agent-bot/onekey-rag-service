import { AlertTriangle, FileSignature, Shield, Clock, Copy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { copyToClipboard } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import type { SignatureAnalysis } from '@/api/types'

interface SignatureResultProps {
  result: SignatureAnalysis
  summary: string | null
}

// 风险等级颜色
const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-500/10 text-green-500 border-green-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  critical: 'bg-red-600/10 text-red-600 border-red-600/20',
  unknown: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
}

// 签名类型标签
const SIGNATURE_TYPE_LABELS: Record<string, string> = {
  eip712: 'EIP-712 Typed Data',
  personal_sign: 'Personal Sign',
  eth_sign: 'ETH Sign',
  unknown: 'Unknown',
}

// 行为类型标签
const ACTION_TYPE_LABELS: Record<string, string> = {
  permit: 'Token Approval (Permit)',
  permit2: 'Uniswap Permit2',
  nft_order: 'NFT Order',
  unknown: 'Unknown',
}

export function SignatureResult({ result, summary }: SignatureResultProps) {
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
      {/* 摘要卡片 */}
      {summary && (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="pt-4">
            <pre className="text-sm whitespace-pre-wrap font-mono">{summary}</pre>
          </CardContent>
        </Card>
      )}

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

      {/* 签名信息 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileSignature className="h-5 w-5" />
              Signature Request
            </CardTitle>
            <div className="flex gap-2">
              <Badge variant="outline" className={RISK_COLORS[result.risk_level]}>
                Risk: {result.risk_level.toUpperCase()}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 类型信息 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Signature Type</p>
              <Badge variant="secondary">
                {SIGNATURE_TYPE_LABELS[result.signature_type] || result.signature_type}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Primary Type</p>
              <code className="text-sm font-semibold">{result.primary_type || 'N/A'}</code>
            </div>
          </div>

          {/* 行为描述 */}
          {result.action_description && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Action</p>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {ACTION_TYPE_LABELS[result.action_type] || result.action_type}
                </Badge>
                <span className="text-sm">{result.action_description}</span>
              </div>
            </div>
          )}

          {/* 过期时间 */}
          {result.expires_at && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>
                Expires: {new Date(result.expires_at).toLocaleString()}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 域信息 */}
      {result.domain && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Domain</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {result.domain.name && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Name</p>
                  <p className="text-sm font-medium">{result.domain.name}</p>
                </div>
              )}
              {result.domain.version && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Version</p>
                  <p className="text-sm">{result.domain.version}</p>
                </div>
              )}
              {result.domain.chain_id && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Chain ID</p>
                  <Badge variant="outline">{result.domain.chain_id}</Badge>
                </div>
              )}
              {result.domain.verifying_contract && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Verifying Contract</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                      {result.domain.verifying_contract}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleCopy(result.domain!.verifying_contract, 'Contract')}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 受影响的资产 */}
      {result.affected_assets.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Affected Assets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {result.affected_assets.map((asset, index) => (
                <div key={index} className="border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">{asset.type}</Badge>
                  </div>
                  <div className="grid gap-2 text-sm">
                    {asset.token && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Token:</span>
                        <code className="font-mono text-xs">
                          {asset.token.slice(0, 10)}...{asset.token.slice(-8)}
                        </code>
                      </div>
                    )}
                    {asset.spender && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Spender:</span>
                        <code className="font-mono text-xs">
                          {asset.spender.slice(0, 10)}...{asset.spender.slice(-8)}
                        </code>
                      </div>
                    )}
                    {asset.amount && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Amount:</span>
                        <span className="font-medium">
                          {BigInt(asset.amount) >= BigInt(2) ** BigInt(255)
                            ? 'UNLIMITED'
                            : asset.amount}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 消息内容 */}
      {result.formatted_message && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Message Content</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono bg-muted p-3 rounded-lg overflow-auto max-h-64 whitespace-pre-wrap">
              {result.formatted_message}
            </pre>
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
    </div>
  )
}
