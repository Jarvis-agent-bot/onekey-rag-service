import { Code, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { DecodedMethod } from '@/api/types'
import { copyToClipboard } from '@/lib/utils'

interface MethodDetailProps {
  method: DecodedMethod | null
  inputData: string
}

export function MethodDetail({ method, inputData }: MethodDetailProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await copyToClipboard(inputData)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!method) {
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
            <p className="text-sm text-muted-foreground">
              Could not decode the method call.
            </p>
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <Code className="h-5 w-5" />
          Method
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <code className="text-lg font-semibold font-mono">
            {method.name}
          </code>
          <Badge variant="outline" className="text-xs">
            {method.selector}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {method.abi_source}
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

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
