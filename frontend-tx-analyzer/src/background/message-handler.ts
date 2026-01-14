import type { ExtensionMessage, PendingTransaction, TxAction } from '@/types/extension'
import { api } from './api'
import {
  getSettings,
  saveSettings,
  getPendingTransaction,
  setPendingTransaction,
  addToHistory,
} from './storage'

// Handle messages from content scripts and popup
export function setupMessageHandler() {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse).catch((error) => {
      console.error('Message handler error:', error)
      sendResponse({ error: error.message })
    })
    // Return true to indicate we'll respond asynchronously
    return true
  })
}

async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (message.type) {
    case 'ANALYZE_TX': {
      const { chainId, txHash, options } = message.payload as {
        chainId: number
        txHash: string
        options?: { include_explanation?: boolean; include_trace?: boolean }
      }

      const result = await api.analyzeTransaction({
        chain_id: chainId,
        tx_hash: txHash,
        options: {
          include_explanation: options?.include_explanation ?? true,
          include_trace: options?.include_trace ?? false,
          language: (await getSettings()).language,
        },
      })

      // Add to history
      if (result.parse_result) {
        await addToHistory({
          chainId,
          txHash,
          behaviorType: result.parse_result.behavior.type,
          riskLevel: result.explanation?.risk_level || 'unknown',
          timestamp: Date.now(),
        })
      }

      return result
    }

    case 'TX_INTERCEPT': {
      const tx = message.payload as PendingTransaction
      await setPendingTransaction(tx)

      // Open popup to show intercepted transaction
      // Note: In MV3, we can't programmatically open popup
      // Instead, we'll use a badge to notify user
      await chrome.action.setBadgeText({ text: '!' })
      await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' })

      // 自动打开侧边栏展示分析详情
      if (sender.tab?.windowId) {
        try {
          await chrome.sidePanel.open({ windowId: sender.tab.windowId })
        } catch (error) {
          console.error('[TX Analyzer] Failed to open side panel:', error)
        }
      }

      return { received: true }
    }

    case 'TX_INTERCEPT_RESPONSE': {
      const { txId, action } = message.payload as { txId: string; action: TxAction }
      const pending = await getPendingTransaction()

      if (pending && pending.id === txId) {
        // Clear pending transaction
        await setPendingTransaction(null)
        await chrome.action.setBadgeText({ text: '' })

        // Send response back to content script
        if (sender.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'TX_ANALYZER_RESPONSE',
            payload: { txId, action },
          })
        }
      }

      return { success: true }
    }

    case 'GET_PENDING_TX': {
      return await getPendingTransaction()
    }

    case 'OPEN_SIDEPANEL': {
      if (sender.tab?.windowId) {
        await chrome.sidePanel.open({ windowId: sender.tab.windowId })
      }
      return { success: true }
    }

    case 'GET_SETTINGS': {
      return await getSettings()
    }

    case 'SAVE_SETTINGS': {
      await saveSettings(message.payload as Parameters<typeof saveSettings>[0])
      return { success: true }
    }

    default:
      return { error: 'Unknown message type' }
  }
}
