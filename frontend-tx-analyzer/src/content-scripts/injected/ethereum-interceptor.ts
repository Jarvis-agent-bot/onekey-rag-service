// This script is injected into the page context to intercept ethereum provider calls

interface PendingTx {
  id: string
  chainId: number
  tx: {
    from: string
    to: string
    data: string
    value: string
    gas?: string
    gasPrice?: string
  }
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  isMetaMask?: boolean
  isOneKey?: boolean
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
    __TX_ANALYZER_INJECTED__?: boolean
  }
}

// Prevent double injection
if (!window.__TX_ANALYZER_INJECTED__) {
  window.__TX_ANALYZER_INJECTED__ = true

  const pendingTxs = new Map<string, PendingTx>()

  function generateTxId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  function interceptEthereum() {
    const provider = window.ethereum
    if (!provider) {
      console.log('[TX Analyzer] No ethereum provider found')
      return
    }

    const originalRequest = provider.request.bind(provider)

    provider.request = async (args: { method: string; params?: unknown[] }) => {
      // Only intercept eth_sendTransaction
      if (args.method === 'eth_sendTransaction' && args.params?.[0]) {
        const tx = args.params[0] as Record<string, string>

        // Get current chain ID
        let chainId: number
        try {
          const chainIdHex = (await originalRequest({ method: 'eth_chainId' })) as string
          chainId = parseInt(chainIdHex, 16)
        } catch {
          chainId = 1 // Default to mainnet
        }

        return new Promise((resolve, reject) => {
          const txId = generateTxId()

          pendingTxs.set(txId, {
            id: txId,
            chainId,
            tx: {
              from: tx.from || '',
              to: tx.to || '',
              data: tx.data || '0x',
              value: tx.value || '0x0',
              gas: tx.gas,
              gasPrice: tx.gasPrice,
            },
            resolve,
            reject,
          })

          // Notify content script about the intercepted transaction
          window.postMessage(
            {
              type: 'TX_ANALYZER_INTERCEPT',
              payload: {
                txId,
                chainId,
                tx: {
                  from: tx.from || '',
                  to: tx.to || '',
                  data: tx.data || '0x',
                  value: tx.value || '0x0',
                },
                origin: window.location.origin,
              },
            },
            '*'
          )
        })
      }

      // Pass through all other requests
      return originalRequest(args)
    }

    // Listen for responses from the extension
    window.addEventListener('message', (event) => {
      if (event.source !== window) return
      if (event.data?.type !== 'TX_ANALYZER_RESPONSE') return

      const { txId, action } = event.data.payload as { txId: string; action: 'approve' | 'reject' }
      const pending = pendingTxs.get(txId)

      if (!pending) {
        console.warn('[TX Analyzer] No pending tx found for:', txId)
        return
      }

      pendingTxs.delete(txId)

      if (action === 'approve') {
        // Continue with original transaction
        const originalRequest = window.ethereum!.request.bind(window.ethereum)
        // Temporarily restore original request for this call
        const interceptedRequest = window.ethereum!.request
        window.ethereum!.request = originalRequest

        originalRequest({
          method: 'eth_sendTransaction',
          params: [pending.tx],
        })
          .then(pending.resolve)
          .catch(pending.reject)
          .finally(() => {
            // Restore interceptor
            window.ethereum!.request = interceptedRequest
          })
      } else {
        pending.reject(new Error('Transaction rejected by TX Analyzer'))
      }
    })

    console.log('[TX Analyzer] Ethereum provider intercepted')
  }

  // Wait for ethereum provider to be available
  if (window.ethereum) {
    interceptEthereum()
  } else {
    // Some wallets inject ethereum asynchronously
    const checkInterval = setInterval(() => {
      if (window.ethereum) {
        clearInterval(checkInterval)
        interceptEthereum()
      }
    }, 100)

    // Stop checking after 10 seconds
    setTimeout(() => clearInterval(checkInterval), 10000)
  }
}

export {}
