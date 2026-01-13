import { Outlet } from 'react-router-dom'
import { Header } from './Header'

export function AppLayout() {
  return (
    <div className="relative min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container py-6">
        <Outlet />
      </main>
      <footer className="border-t py-4">
        <div className="container flex items-center justify-center text-sm text-muted-foreground">
          <span>Web3 Transaction Analyzer</span>
          <span className="mx-2">•</span>
          <span>Powered by OneKey RAG</span>
        </div>
      </footer>
    </div>
  )
}
