// Content script for Etherscan and similar block explorers
// Adds "Analyze with AI" button to transaction pages

// Inject styles
function injectStyles() {
  if (document.getElementById('tx-analyzer-styles')) return

  const style = document.createElement('style')
  style.id = 'tx-analyzer-styles'
  style.textContent = `
    .tx-analyzer-container {
      display: inline-flex;
      align-items: center;
      margin-left: 12px;
      margin-top: 8px;
    }
    .tx-analyzer-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 500;
      color: #ffffff;
      background: linear-gradient(135deg, #00b894 0%, #00a085 100%);
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 2px 8px rgba(0, 184, 148, 0.3);
    }
    .tx-analyzer-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 184, 148, 0.4);
    }
    .tx-analyzer-btn:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
    .tx-analyzer-spinner {
      animation: tx-analyzer-spin 1s linear infinite;
    }
    @keyframes tx-analyzer-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `
  document.head.appendChild(style)
}

interface ChainConfig {
  chainId: number
  name: string
  hostPattern: RegExp
}

const SUPPORTED_CHAINS: ChainConfig[] = [
  { chainId: 1, name: 'Ethereum', hostPattern: /etherscan\.io/ },
  { chainId: 56, name: 'BSC', hostPattern: /bscscan\.com/ },
  { chainId: 137, name: 'Polygon', hostPattern: /polygonscan\.com/ },
  { chainId: 42161, name: 'Arbitrum', hostPattern: /arbiscan\.io/ },
  { chainId: 10, name: 'Optimism', hostPattern: /optimistic\.etherscan\.io/ },
]

function getChainFromHost(): ChainConfig | null {
  const host = window.location.hostname
  return SUPPORTED_CHAINS.find((chain) => chain.hostPattern.test(host)) || null
}

function getTxHashFromUrl(): string | null {
  const match = window.location.pathname.match(/\/tx\/(0x[a-fA-F0-9]{64})/)
  return match ? match[1] : null
}

function createAnalyzeButton(chainId: number, txHash: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.className = 'tx-analyzer-btn'
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
    <span>AI Analysis</span>
  `

  button.addEventListener('click', async () => {
    button.disabled = true
    button.innerHTML = `
      <svg class="tx-analyzer-spinner" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
      </svg>
      <span>Analyzing...</span>
    `

    try {
      // Send message to background to analyze and open sidepanel
      await chrome.runtime.sendMessage({
        type: 'ANALYZE_TX',
        payload: {
          chainId,
          txHash,
          options: { include_explanation: true },
        },
      })

      // Try to open sidepanel
      await chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' })

      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Done</span>
      `
    } catch (error) {
      console.error('[TX Analyzer] Analysis failed:', error)
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>Failed</span>
      `
    }

    setTimeout(() => {
      button.disabled = false
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <span>AI Analysis</span>
      `
    }, 3000)
  })

  return button
}

function injectButton() {
  const chain = getChainFromHost()
  const txHash = getTxHashFromUrl()

  if (!chain || !txHash) return

  // Find the transaction hash header section
  // Etherscan structure varies, try multiple selectors
  const selectors = [
    '#ContentPlaceHolder1_maintable .card-header',
    '.card-header:has(#spanTxHash)',
    '.row .col-md-9:has(#spanTxHash)',
    '#ContentPlaceHolder1_divSummary .card-body',
  ]

  let targetElement: Element | null = null
  for (const selector of selectors) {
    targetElement = document.querySelector(selector)
    if (targetElement) break
  }

  // If no specific element found, try to find hash display
  if (!targetElement) {
    const hashElement = document.querySelector('#spanTxHash, .hash-tag')
    if (hashElement) {
      targetElement = hashElement.closest('.row, .card-body, .d-flex')
    }
  }

  if (!targetElement) {
    console.log('[TX Analyzer] Could not find target element for button injection')
    return
  }

  // Check if button already exists
  if (document.querySelector('.tx-analyzer-btn')) return

  const button = createAnalyzeButton(chain.chainId, txHash)

  // Create container
  const container = document.createElement('div')
  container.className = 'tx-analyzer-container'
  container.appendChild(button)

  // Insert after target element or at the end
  if (targetElement.parentNode) {
    targetElement.parentNode.insertBefore(container, targetElement.nextSibling)
  } else {
    targetElement.appendChild(container)
  }

  console.log('[TX Analyzer] Button injected for', chain.name, 'tx:', txHash)
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    injectStyles()
    injectButton()
  })
} else {
  injectStyles()
  injectButton()
}

// Also handle SPA navigation
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      // Check if we need to re-inject button
      if (!document.querySelector('.tx-analyzer-btn')) {
        injectButton()
      }
    }
  }
})

observer.observe(document.body, { childList: true, subtree: true })

export {}
