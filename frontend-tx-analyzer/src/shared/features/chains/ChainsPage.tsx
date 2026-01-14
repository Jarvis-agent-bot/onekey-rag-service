import { Link2, ExternalLink, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useChains } from '@/api/hooks'
import { CHAIN_INFO } from '@/lib/constants'

export function ChainsPage() {
  const { data: chains, isLoading, refetch } = useChains()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Link2 className="h-6 w-6" />
          Supported Chains
        </h1>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[180px]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(chains || []).map((chain) => {
            const info = CHAIN_INFO[chain.chain_id]
            return (
              <Card key={chain.chain_id} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: info?.color || '#888' }}
                    >
                      {chain.native_token.charAt(0)}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{chain.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Chain ID: {chain.chain_id}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Native Token
                    </span>
                    <Badge variant="secondary">{chain.native_token}</Badge>
                  </div>

                  <Button variant="outline" className="w-full" asChild>
                    <a
                      href={chain.explorer_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Explorer
                    </a>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {!isLoading && (!chains || chains.length === 0) && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No chains available. Please check the backend service.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
