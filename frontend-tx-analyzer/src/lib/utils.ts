import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function shortenAddress(address: string, chars = 4): string {
  if (!address) return ''
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

export function shortenHash(hash: string, chars = 6): string {
  if (!hash) return ''
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`
}

export function formatNumber(num: number | string): string {
  const n = typeof num === 'string' ? parseFloat(num) : num
  return new Intl.NumberFormat('en-US').format(n)
}

export function formatWei(wei: string, decimals = 18): string {
  if (!wei || wei === '0') return '0'
  const value = BigInt(wei)
  const divisor = BigInt(10 ** decimals)
  const intPart = value / divisor
  const fracPart = value % divisor

  if (fracPart === 0n) {
    return intPart.toString()
  }

  const fracStr = fracPart.toString().padStart(decimals, '0')
  const trimmed = fracStr.replace(/0+$/, '')
  return `${intPart}.${trimmed.slice(0, 6)}`
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
}

export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp)

  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text)
}

export function isValidTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash)
}

export function getExplorerUrl(chainId: number, type: 'tx' | 'address', value: string): string {
  const explorers: Record<number, string> = {
    1: 'https://etherscan.io',
    56: 'https://bscscan.com',
    137: 'https://polygonscan.com',
    42161: 'https://arbiscan.io',
    10: 'https://optimistic.etherscan.io',
  }

  const base = explorers[chainId] || 'https://etherscan.io'
  return `${base}/${type}/${value}`
}
