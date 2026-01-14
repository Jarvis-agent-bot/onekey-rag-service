import { useState } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { shortenAddress, copyToClipboard, getExplorerUrl } from '@/lib/utils'

interface AddressDisplayProps {
  address: string
  chainId: number
  label?: string
  short?: boolean
  showActions?: boolean
}

export function AddressDisplay({
  address,
  chainId,
  label,
  short = true,
  showActions = true,
}: AddressDisplayProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await copyToClipboard(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const displayAddress = short ? shortenAddress(address) : address

  return (
    <div className="flex items-center gap-1">
      {label && <span className="text-muted-foreground text-sm">{label}:</span>}
      <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">
        {displayAddress}
      </code>
      {showActions && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-3 w-3 text-risk-low" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy address</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                asChild
              >
                <a
                  href={getExplorerUrl(chainId, 'address', address)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>View on explorer</TooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  )
}
