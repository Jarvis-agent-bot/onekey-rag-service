// Content script for dApp pages
// This runs in the content script context and bridges page <-> extension

import type { PendingTransaction } from '@/types/extension'

// Inject the ethereum interceptor script into the page context
function injectScript() {
  const script = document.createElement('script')
  script.src = chrome.runtime.getURL('src/content-scripts/injected/ethereum-interceptor.ts')
  script.type = 'module'
  ;(document.head || document.documentElement).appendChild(script)
  script.onload = () => script.remove()
}

// Listen for messages from the injected script
function setupMessageBridge() {
  window.addEventListener('message', async (event) => {
    // Only accept messages from the same frame
    if (event.source !== window) return

    if (event.data?.type === 'TX_ANALYZER_INTERCEPT') {
      const payload = event.data.payload as {
        txId: string
        chainId: number
        tx: { from: string; to: string; data: string; value: string }
        origin: string
      }

      // Check if interception is enabled
      const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
      if (!settings?.interceptEnabled) {
        // Pass through if interception is disabled
        window.postMessage(
          {
            type: 'TX_ANALYZER_RESPONSE',
            payload: { txId: payload.txId, action: 'approve' },
          },
          '*'
        )
        return
      }

      // Create pending transaction
      const pendingTx: PendingTransaction = {
        id: payload.txId,
        chainId: payload.chainId,
        tx: payload.tx,
        origin: payload.origin,
        timestamp: Date.now(),
      }

      // Send to background script
      try {
        await chrome.runtime.sendMessage({
          type: 'TX_INTERCEPT',
          payload: pendingTx,
        })
      } catch (error) {
        console.error('[TX Analyzer] Failed to send to background:', error)
        // If communication fails, approve the transaction
        window.postMessage(
          {
            type: 'TX_ANALYZER_RESPONSE',
            payload: { txId: payload.txId, action: 'approve' },
          },
          '*'
        )
      }
    }
  })

  // Listen for responses from the extension
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TX_ANALYZER_RESPONSE') {
      // Forward to page
      window.postMessage(message, '*')
    }
  })
}

// Initialize
if (document.contentType === 'text/html') {
  injectScript()
  setupMessageBridge()
  console.log('[TX Analyzer] Content script initialized')
}

export {}
