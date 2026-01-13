export const CHAIN_INFO: Record<number, {
  name: string
  shortName: string
  nativeToken: string
  color: string
  icon: string
}> = {
  1: {
    name: 'Ethereum',
    shortName: 'ETH',
    nativeToken: 'ETH',
    color: '#627eea',
    icon: 'ethereum',
  },
  56: {
    name: 'BNB Smart Chain',
    shortName: 'BSC',
    nativeToken: 'BNB',
    color: '#f3ba2f',
    icon: 'bnb',
  },
  137: {
    name: 'Polygon',
    shortName: 'POLY',
    nativeToken: 'MATIC',
    color: '#8247e5',
    icon: 'polygon',
  },
  42161: {
    name: 'Arbitrum One',
    shortName: 'ARB',
    nativeToken: 'ETH',
    color: '#28a0f0',
    icon: 'arbitrum',
  },
  10: {
    name: 'Optimism',
    shortName: 'OP',
    nativeToken: 'ETH',
    color: '#ff0420',
    icon: 'optimism',
  },
}

export const BEHAVIOR_LABELS: Record<string, { label: string; icon: string }> = {
  swap: { label: 'Swap', icon: 'ArrowLeftRight' },
  bridge: { label: 'Bridge', icon: 'ArrowRightLeft' },
  stake: { label: 'Stake', icon: 'Lock' },
  unstake: { label: 'Unstake', icon: 'Unlock' },
  lend: { label: 'Lend', icon: 'PiggyBank' },
  borrow: { label: 'Borrow', icon: 'HandCoins' },
  repay: { label: 'Repay', icon: 'Receipt' },
  liquidity_add: { label: 'Add Liquidity', icon: 'Plus' },
  liquidity_remove: { label: 'Remove Liquidity', icon: 'Minus' },
  mint: { label: 'Mint', icon: 'Sparkles' },
  burn: { label: 'Burn', icon: 'Flame' },
  nft_trade: { label: 'NFT Trade', icon: 'Image' },
  transfer: { label: 'Transfer', icon: 'Send' },
  approve: { label: 'Approve', icon: 'Check' },
  claim: { label: 'Claim', icon: 'Gift' },
  airdrop: { label: 'Airdrop', icon: 'Plane' },
  wrap: { label: 'Wrap', icon: 'Package' },
  unwrap: { label: 'Unwrap', icon: 'PackageOpen' },
  unknown: { label: 'Unknown', icon: 'HelpCircle' },
}

export const RISK_LEVELS = {
  low: { label: 'Low Risk', color: 'text-risk-low', bg: 'bg-risk-low/10' },
  medium: { label: 'Medium Risk', color: 'text-risk-medium', bg: 'bg-risk-medium/10' },
  high: { label: 'High Risk', color: 'text-risk-high', bg: 'bg-risk-high/10' },
  unknown: { label: 'Unknown', color: 'text-muted-foreground', bg: 'bg-muted' },
}

export const CONFIDENCE_LABELS = {
  high: { label: 'High', color: 'text-green-600' },
  medium: { label: 'Medium', color: 'text-yellow-600' },
  low: { label: 'Low', color: 'text-red-600' },
}
