// Extension message types
export type MessageType =
  | 'ANALYZE_TX'
  | 'ANALYZE_TX_RESULT'
  | 'TX_INTERCEPT'
  | 'TX_INTERCEPT_RESPONSE'
  | 'GET_PENDING_TX'
  | 'OPEN_SIDEPANEL'
  | 'GET_SETTINGS'
  | 'SAVE_SETTINGS'

export interface ExtensionMessage<T = unknown> {
  type: MessageType
  payload?: T
}

// Pending transaction from content script
export interface PendingTransaction {
  id: string
  chainId: number
  tx: {
    from: string
    to: string
    data: string
    value: string
    gas?: string
    gasPrice?: string
    nonce?: string
  }
  origin: string
  timestamp: number
}

// User action for intercepted transaction
export type TxAction = 'approve' | 'reject'

// Extension settings
export interface ExtensionSettings {
  apiEndpoint: string
  autoAnalyze: boolean
  showNotifications: boolean
  language: 'zh' | 'en'
  interceptEnabled: boolean
}

const DEFAULT_API_ENDPOINT = import.meta.env.DEV
  ? 'http://127.0.0.1:8001'
  : 'https://tx-analyzer.onekey.so/api'

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiEndpoint: DEFAULT_API_ENDPOINT,
  autoAnalyze: true,
  showNotifications: true,
  language: 'zh',
  interceptEnabled: true,
}

// Storage keys
export const STORAGE_KEYS = {
  SETTINGS: 'tx_analyzer_settings',
  HISTORY: 'tx_analyzer_history',
  PENDING_TX: 'tx_analyzer_pending',
} as const
