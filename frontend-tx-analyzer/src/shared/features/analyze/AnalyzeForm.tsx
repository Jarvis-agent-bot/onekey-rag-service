import { useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useChains } from '@/api/hooks'
import { CHAIN_INFO } from '@/lib/constants'
import { isValidTxHash } from '@/lib/utils'

interface AnalyzeFormProps {
  onSubmit: (data: {
    chainId: number
    txHash: string
    includeExplanation: boolean
    includeTrace: boolean
  }) => void
  isLoading: boolean
}

export function AnalyzeForm({ onSubmit, isLoading }: AnalyzeFormProps) {
  const { data: chains } = useChains()
  const [chainId, setChainId] = useState<string>('1')
  const [txHash, setTxHash] = useState('')
  const [includeExplanation, setIncludeExplanation] = useState(true)
  const [includeTrace, setIncludeTrace] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedHash = txHash.trim()
    if (!trimmedHash) {
      setError('Please enter a transaction hash')
      return
    }

    if (!isValidTxHash(trimmedHash)) {
      setError('Invalid transaction hash format (expected 0x + 64 hex characters)')
      return
    }

    onSubmit({
      chainId: parseInt(chainId),
      txHash: trimmedHash,
      includeExplanation,
      includeTrace,
    })
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text')
    // Clean up pasted content (remove whitespace)
    const cleaned = pasted.trim().replace(/\s+/g, '')
    if (cleaned !== pasted) {
      e.preventDefault()
      setTxHash(cleaned)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Analyze Transaction
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="chain">Chain</Label>
              <Select value={chainId} onValueChange={setChainId}>
                <SelectTrigger id="chain">
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

            <div className="space-y-2">
              <Label htmlFor="txHash">Transaction Hash</Label>
              <Input
                id="txHash"
                placeholder="0x..."
                value={txHash}
                onChange={(e) => {
                  setTxHash(e.target.value)
                  setError(null)
                }}
                onPaste={handlePaste}
                className="font-mono"
              />
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="explanation"
                checked={includeExplanation}
                onCheckedChange={(checked) =>
                  setIncludeExplanation(checked === true)
                }
              />
              <Label htmlFor="explanation" className="text-sm font-normal">
                Include RAG Explanation
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="trace"
                checked={includeTrace}
                onCheckedChange={(checked) =>
                  setIncludeTrace(checked === true)
                }
              />
              <Label htmlFor="trace" className="text-sm font-normal">
                Include Trace Log
              </Label>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Analyze Transaction
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
