import {
  ExtensionSettings,
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  PendingTransaction,
} from '@/types/extension'

// Get settings from storage
export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS)
  return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] }
}

// Save settings to storage
export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  const current = await getSettings()
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: { ...current, ...settings },
  })
}

// Get pending transaction
export async function getPendingTransaction(): Promise<PendingTransaction | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PENDING_TX)
  return result[STORAGE_KEYS.PENDING_TX] || null
}

// Set pending transaction
export async function setPendingTransaction(tx: PendingTransaction | null): Promise<void> {
  if (tx) {
    await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_TX]: tx })
  } else {
    await chrome.storage.local.remove(STORAGE_KEYS.PENDING_TX)
  }
}

// History management
export interface HistoryEntry {
  chainId: number
  txHash: string
  behaviorType: string
  riskLevel: string
  timestamp: number
}

export async function getHistory(limit = 50): Promise<HistoryEntry[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.HISTORY)
  const history = result[STORAGE_KEYS.HISTORY] || []
  return history.slice(0, limit)
}

export async function addToHistory(entry: HistoryEntry): Promise<void> {
  const history = await getHistory(100)
  history.unshift(entry)
  // Keep only last 100 entries
  await chrome.storage.local.set({
    [STORAGE_KEYS.HISTORY]: history.slice(0, 100),
  })
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.HISTORY)
}
