import { AlertTriangle, Code, Copy, Info } from 'lucide-react'
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

// ABI 来源显示
const ABI_SOURCE_LABELS: Partial<Record<AbiSource, { label: string; color: string }>> = {
  user_provided: { label: 'User ABI', color: 'bg-blue-500/10 text-blue-500' },
  etherscan: { label: 'Etherscan', color: 'bg-purple-500/10 text-purple-500' },
  '4bytes': { label: '4bytes', color: 'bg-yellow-500/10 text-yellow-500' },
  none: { label: 'Not Decoded', color: 'bg-gray-500/10 text-gray-500' },
}

// 置信度显示
const CONFIDENCE_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: 'High Confidence', color: 'bg-green-500/10 text-green-500' },
  medium: { label: 'Medium Confidence', color: 'bg-yellow-500/10 text-yellow-500' },
  low: { label: 'Low Confidence', color: 'bg-red-500/10 text-red-500' },
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
      {result.warnings && result.warnings.length > 0 && (
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
                <Badge variant="outline" className={ABI_SOURCE_LABELS[result.abi_source]?.color}>
                  {ABI_SOURCE_LABELS[result.abi_source]?.label}
                </Badge>
              )}
              {/* 解码置信度 */}
              {result.decode_confidence && CONFIDENCE_LABELS[result.decode_confidence] && (
                <Badge variant="outline" className={CONFIDENCE_LABELS[result.decode_confidence].color}>
                  {CONFIDENCE_LABELS[result.decode_confidence].label}
                </Badge>
              )}
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
          {result.possible_signatures && result.possible_signatures.length > 1 && (
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

      {/* ABI 来源提示 - 根据置信度显示不同的警告 */}
      {result.abi_source === '4bytes' &&
        (result.decode_confidence === 'low' ||
          result.decode_confidence === 'medium' ||
          (result.alternate_decodes && result.alternate_decodes.length > 0)) && (
        <Card className={
          result.decode_confidence === 'low'
            ? "border-red-500/30"
            : result.decode_confidence === 'medium'
            ? "border-orange-500/30"
            : "border-yellow-500/30"
        }>
          <CardContent className="pt-4 space-y-2">
            <div className={`flex items-start gap-2 ${
              result.decode_confidence === 'low'
                ? 'text-red-600 dark:text-red-400'
                : result.decode_confidence === 'medium'
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-yellow-600 dark:text-yellow-400'
            }`}>
              {result.decode_confidence === 'low' ? (
                <AlertTriangle className="h-4 w-4 mt-0.5" />
              ) : (
                <Info className="h-4 w-4 mt-0.5" />
              )}
              <div className="space-y-1">
                <span className="text-sm font-medium">
                  {result.decode_confidence === 'low'
                    ? 'Low confidence decode - selector collision detected!'
                    : result.decode_confidence === 'medium'
                    ? 'Medium confidence - multiple functions match this selector'
                    : 'Function decoded from 4bytes signature database'}
                </span>
                <p className="text-sm opacity-80">
                  {result.decode_confidence === 'high'
                    ? 'Verify with the actual contract ABI if available.'
                    : 'Please provide the target contract address (to_address) for accurate decoding.'}
                </p>
              </div>
            </div>

            {/* 显示备选解码 */}
            {result.alternate_decodes && result.alternate_decodes.length > 0 && (
              <div className="pt-2 border-t border-current/10">
                <p className="text-xs text-muted-foreground mb-1">Other possible functions:</p>
                <div className="flex flex-wrap gap-1">
                  {result.alternate_decodes.map((alt, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {alt.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
