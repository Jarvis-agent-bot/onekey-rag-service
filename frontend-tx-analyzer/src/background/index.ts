import { setupMessageHandler } from './message-handler'

// Initialize service worker
console.log('[TX Analyzer] Service Worker started')

// Setup message handler
setupMessageHandler()

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[TX Analyzer] Extension installed:', details.reason)

  if (details.reason === 'install') {
    // Open options page on first install
    chrome.runtime.openOptionsPage()
  }
})

// Listen for startup
chrome.runtime.onStartup.addListener(() => {
  console.log('[TX Analyzer] Browser started')
  // Clear any stale pending transactions
  chrome.storage.local.remove('tx_analyzer_pending')
  chrome.action.setBadgeText({ text: '' })
})

// Setup side panel behavior
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[TX Analyzer] Side panel setup error:', error))

// Context menu for quick analysis (right-click on tx hash)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'analyze-selection',
    title: 'Analyze Transaction with TX Analyzer',
    contexts: ['selection'],
  })
})

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'analyze-selection' && info.selectionText) {
    const text = info.selectionText.trim()
    // Check if it looks like a tx hash (0x + 64 hex chars)
    if (/^0x[a-fA-F0-9]{64}$/.test(text)) {
      // Open popup with the tx hash
      // Since we can't pass data directly, we'll store it temporarily
      chrome.storage.local.set({
        tx_analyzer_quick_analyze: {
          txHash: text,
          timestamp: Date.now(),
        },
      })
      // The popup will check for this on open
    }
  }
})

export {}
