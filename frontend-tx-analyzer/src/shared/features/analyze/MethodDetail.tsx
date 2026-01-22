import { Code, Copy, Check, ExternalLink, Info, AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { DecodedMethod } from '@/api/types'
import { copyToClipboard, cn } from '@/lib/utils'

interface MethodDetailProps {
  method: DecodedMethod | null
  inputData: string
  diagnostics?: {
    method?: { status?: string; reason?: string; selector?: string }
    abi?: { status?: string; reason?: string; source?: string; ref?: string; error?: string }
  }
}

const abiSourceLabels: Record<string, { label: string; color: string; description: string }> = {
  registry: { label: 'Registry', color: 'bg-green-500/10 text-green-600 border-green-500/20', description: '本地合约注册表' },
  explorer: { label: 'Etherscan', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', description: 'Etherscan 验证合约' },
  signature_db: { label: '4bytes', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20', description: '4bytes 签名数据库' },
  unknown: { label: '未知', color: 'bg-gray-500/10 text-gray-600 border-gray-500/20', description: '来源不明' },
}

export function MethodDetail({ method, inputData, diagnostics }: MethodDetailProps) {
  const [copied, setCopied] = useState(false)

  const formatReason = (value?: string) => {
    if (!value) return ''
    const map: Record<string, string> = {
      not_verified: '合约未验证',
      missing_api_key: '缺少 Etherscan API Key',
      contract_creation: '合约创建交易',
      abi_missing: '缺少 ABI',
      rate_limited: 'Etherscan 限流（429）',
      timeout: 'Etherscan 请求超时',
      http_error: 'Etherscan HTTP 错误',
      network_error: 'Etherscan 网络错误',
      api_error: 'Etherscan 接口错误',
      signature_not_found: '签名库未命中',
      decode_failed: '解码失败',
      empty_input: '无调用数据',
      error: '调用异常',
    }
    return map[value] || value
  }

  const handleCopy = async () => {
    await copyToClipboard(inputData)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!method) {
    const reason = diagnostics?.method?.reason
    const abiReason = diagnostics?.abi?.reason
    const abiSource = diagnostics?.abi?.source
    const abiError = diagnostics?.abi?.error
    const selector = diagnostics?.method?.selector
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <Code className="h-5 w-5" />
            Method
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>无法解析方法。</p>
              {selector && <p>Selector: {selector}</p>}
              {reason && <p>原因: {formatReason(reason)}</p>}
              {abiSource && <p>ABI 来源: {abiSource}</p>}
              {abiReason && <p>ABI 原因: {formatReason(abiReason)}</p>}
              {abiError && <p>ABI 错误: {abiError}</p>}
            </div>
            {inputData && inputData !== '0x' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Raw Input Data</p>
                  <Button variant="ghost" size="sm" onClick={handleCopy}>
                    {copied ? (
                      <Check className="h-4 w-4 text-risk-low" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <pre className="text-xs font-mono bg-muted p-3 rounded-md overflow-x-auto">
                  {inputData}
                </pre>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  const abiInfo = abiSourceLabels[method.abi_source] || abiSourceLabels.unknown

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <Code className="h-5 w-5" />
          Method
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <code className="text-lg font-semibold font-mono">
            {method.name}
          </code>
          <Badge variant="outline" className="text-xs">
            {method.selector}
          </Badge>
          <Badge variant="outline" className={cn("text-xs", abiInfo.color)}>
            {abiInfo.label}
          </Badge>
        </div>

        {method.signature && (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Signature</p>
            <code className="text-sm font-mono bg-muted px-2 py-1 rounded block overflow-x-auto">
              {method.signature}
            </code>
          </div>
        )}

        {/* ABI 来源详情 */}
        <AbiSourceDetails
          abiSource={method.abi_source}
          abiRef={method.abi_ref}
          diagnostics={diagnostics}
        />

        {method.inputs.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Parameters</p>
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {method.inputs.map((input, index) => (
                    <tr key={index} className="border-b last:border-0">
                      <td className="px-3 py-2 font-mono text-muted-foreground">
                        {input.name || `param${index}`}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-xs font-mono">
                          {input.type}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs max-w-[300px] truncate">
                        {formatValue(input.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** ABI 来源详情组件 */
function AbiSourceDetails({
  abiSource,
  abiRef,
  diagnostics,
}: {
  abiSource: string
  abiRef?: string
  diagnostics?: MethodDetailProps['diagnostics']
}) {
  const abiInfo = abiSourceLabels[abiSource] || abiSourceLabels.unknown
  const abiDiag = diagnostics?.abi

  // 构建 Etherscan 链接
  const getEtherscanLink = (ref?: string) => {
    if (!ref) return null
    // ref 格式通常是合约地址
    if (ref.startsWith('0x') && ref.length === 42) {
      return `https://etherscan.io/address/${ref}#code`
    }
    return null
  }

  const etherscanLink = getEtherscanLink(abiRef || abiDiag?.ref)

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <Info className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">ABI 来源</span>
        <Badge variant="outline" className={cn("text-xs", abiInfo.color)}>
          {abiInfo.label}
        </Badge>
      </div>

      <div className="text-xs text-muted-foreground space-y-1.5 pl-6">
        <p>{abiInfo.description}</p>

        {/* Etherscan 来源展示详细信息 */}
        {abiSource === 'explorer' && (
          <>
            {abiDiag?.status === 'success' && (
              <p className="text-green-600">✓ 合约已在 Etherscan 验证</p>
            )}
            {(abiRef || abiDiag?.ref) && (
              <div className="flex items-center gap-2">
                <span>合约地址:</span>
                <code className="text-xs bg-background px-1.5 py-0.5 rounded">
                  {abiRef || abiDiag?.ref}
                </code>
                {etherscanLink && (
                  <a
                    href={etherscanLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    查看源码 <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </>
        )}

        {/* 4bytes 签名数据库 */}
        {abiSource === 'signature_db' && (
          <p className="text-yellow-600">
            ⚠ 仅匹配到函数签名，参数名称可能不准确
          </p>
        )}

        {/* Registry 本地注册表 */}
        {abiSource === 'registry' && (
          <p className="text-green-600">✓ 来自本地协议合约库</p>
        )}

        {/* 显示诊断错误信息 */}
        {abiDiag?.error && (
          <div className="flex items-center gap-1 text-red-500">
            <AlertCircle className="h-3 w-3" />
            <span>{abiDiag.error}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
