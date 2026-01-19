import { useState, useCallback } from 'react'
import { Search, Loader2, FileCode, Hash, FileSignature, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useChains } from '@/api/hooks'
import { CHAIN_INFO } from '@/lib/constants'
import type { InputType } from '@/api/types'

interface SmartInputProps {
  onSubmit: (data: {
    input: string
    inputType: InputType
    chainId: number
    context?: {
      to_address?: string
      from_address?: string
      value?: string
    }
    options: {
      includeExplanation: boolean
      includeTrace: boolean
    }
  }) => void
  isLoading: boolean
}

// 检测输入类型
function detectInputType(input: string): InputType {
  const trimmed = input.trim()

  // 尝试解析为 JSON (签名数据)
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed)
      if (data.domain && data.message) {
        return 'signature'
      }
    } catch {
      // 不是有效 JSON
    }
  }

  // 检查是否是十六进制数据
  if (trimmed.startsWith('0x')) {
    const hexPart = trimmed.slice(2)
    if (/^[a-fA-F0-9]+$/.test(hexPart)) {
      // 交易哈希: 64 字符
      if (hexPart.length === 64) {
        return 'tx_hash'
      }
      // Calldata: 至少 8 字符 (4 字节选择器)
      if (hexPart.length >= 8) {
        return 'calldata'
      }
    }
  }

  return 'unknown'
}

// 输入类型的显示信息
const INPUT_TYPE_INFO: Record<InputType, { label: string; icon: typeof Hash; description: string }> = {
  tx_hash: {
    label: 'Transaction Hash',
    icon: Hash,
    description: 'Analyze an on-chain transaction',
  },
  calldata: {
    label: 'Calldata',
    icon: FileCode,
    description: 'Decode contract call data',
  },
  signature: {
    label: 'Signature Data',
    icon: FileSignature,
    description: 'Parse EIP-712 signature request',
  },
  unknown: {
    label: 'Unknown',
    icon: AlertCircle,
    description: 'Unable to detect input type',
  },
}

export function SmartInput({ onSubmit, isLoading }: SmartInputProps) {
  const { data: chains } = useChains()
  const [input, setInput] = useState('')
  const [chainId, setChainId] = useState<string>('1')
  const [includeExplanation, setIncludeExplanation] = useState(true)
  const [includeTrace, setIncludeTrace] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 额外的上下文输入 (用于 calldata)
  const [toAddress, setToAddress] = useState('')
  const [fromAddress, setFromAddress] = useState('')
  const [value, setValue] = useState('')

  // 检测到的输入类型
  const detectedType = input.trim() ? detectInputType(input) : null
  const typeInfo = detectedType ? INPUT_TYPE_INFO[detectedType] : null
  const TypeIcon = typeInfo?.icon || AlertCircle

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)

      const trimmedInput = input.trim()
      if (!trimmedInput) {
        setError('Please enter data to analyze')
        return
      }

      const inputType = detectInputType(trimmedInput)
      if (inputType === 'unknown') {
        setError('Unable to detect input type. Please enter a transaction hash (0x + 64 chars), calldata, or EIP-712 signature data.')
        return
      }

      // 构建上下文
      const context: { to_address?: string; from_address?: string; value?: string } = {}
      if (inputType === 'calldata') {
        if (toAddress.trim()) context.to_address = toAddress.trim()
        if (fromAddress.trim()) context.from_address = fromAddress.trim()
        if (value.trim()) context.value = value.trim()
      }

      onSubmit({
        input: trimmedInput,
        inputType,
        chainId: parseInt(chainId),
        context: Object.keys(context).length > 0 ? context : undefined,
        options: {
          includeExplanation,
          includeTrace,
        },
      })
    },
    [input, chainId, toAddress, fromAddress, value, includeExplanation, includeTrace, onSubmit]
  )

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text')
    // 清理粘贴内容 (移除空白)
    const cleaned = pasted.trim().replace(/\s+/g, '')
    if (cleaned !== pasted) {
      e.preventDefault()
      setInput(cleaned)
    }
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Smart Analyze
        </CardTitle>
        <CardDescription>
          Enter a transaction hash, calldata, or signature data - we'll auto-detect the type
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 链选择 */}
          <div className="space-y-2">
            <Label htmlFor="chain">Chain</Label>
            <Select value={chainId} onValueChange={setChainId}>
              <SelectTrigger id="chain" className="w-[200px]">
                <SelectValue placeholder="Select chain" />
              </SelectTrigger>
              <SelectContent>
                {(chains || Object.keys(CHAIN_INFO).map(Number)).map((chain) => {
                  const id = typeof chain === 'number' ? chain : chain.chain_id
                  const info = CHAIN_INFO[id]
                  return (
                    <SelectItem key={id} value={String(id)}>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: info?.color || '#888' }}
                        />
                        {info?.name || `Chain ${id}`}
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* 主输入框 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="input">Input Data</Label>
              {detectedType && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <TypeIcon className="h-4 w-4" />
                  <span>{typeInfo?.label}</span>
                </div>
              )}
            </div>
            <Textarea
              id="input"
              placeholder="0x... (transaction hash or calldata) or { domain: ..., message: ... } (EIP-712 data)"
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setError(null)
              }}
              onPaste={handlePaste}
              className="font-mono min-h-[100px] text-sm"
            />
            {detectedType && (
              <p className="text-xs text-muted-foreground">{typeInfo?.description}</p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {/* Calldata 额外上下文 */}
          {detectedType === 'calldata' && (
            <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
              <p className="text-sm font-medium">Optional Context (for better analysis)</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="toAddress" className="text-xs">To Address (Contract)</Label>
                  <input
                    id="toAddress"
                    type="text"
                    placeholder="0x..."
                    value={toAddress}
                    onChange={(e) => setToAddress(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fromAddress" className="text-xs">From Address</Label>
                  <input
                    id="fromAddress"
                    type="text"
                    placeholder="0x..."
                    value={fromAddress}
                    onChange={(e) => setFromAddress(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="value" className="text-xs">Value (wei)</Label>
                <input
                  id="value"
                  type="text"
                  placeholder="0"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono"
                />
              </div>
            </div>
          )}

          {/* 选项 */}
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="explanation"
                checked={includeExplanation}
                onCheckedChange={(checked) => setIncludeExplanation(checked === true)}
              />
              <Label htmlFor="explanation" className="text-sm font-normal">
                Include AI Explanation
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="trace"
                checked={includeTrace}
                onCheckedChange={(checked) => setIncludeTrace(checked === true)}
              />
              <Label htmlFor="trace" className="text-sm font-normal">
                Include Trace Log
              </Label>
            </div>
          </div>

          {/* 提交按钮 */}
          <div className="flex justify-end">
            <Button type="submit" disabled={isLoading || !input.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Analyze
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
