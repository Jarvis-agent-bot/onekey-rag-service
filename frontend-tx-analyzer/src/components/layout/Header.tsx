import { Link, useLocation } from 'react-router-dom'
import { Search, History, Link2, Github } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useHealthCheck } from '@/api/hooks'
import { cn } from '@/lib/utils'

const navItems = [
  { path: '/', label: 'Analyze', icon: Search },
  { path: '/history', label: 'History', icon: History },
  { path: '/chains', label: 'Chains', icon: Link2 },
]

export function Header() {
  const location = useLocation()
  const { data: health } = useHealthCheck()

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <div className="mr-4 flex">
          <Link to="/" className="mr-6 flex items-center space-x-2">
            <div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
              <Search className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="hidden font-bold sm:inline-block">
              TX Analyzer
            </span>
          </Link>
          <nav className="flex items-center space-x-6 text-sm font-medium">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex items-center gap-1.5 transition-colors hover:text-foreground/80',
                    isActive ? 'text-foreground' : 'text-foreground/60'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-2">
          {health && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  health.status === 'ok' && 'bg-risk-low',
                  health.status === 'degraded' && 'bg-risk-medium',
                  health.status === 'unhealthy' && 'bg-risk-high'
                )}
              />
              <span className="hidden sm:inline">v{health.version}</span>
            </div>
          )}
          <Button variant="ghost" size="icon" asChild>
            <a
              href="https://github.com/anthropics/claude-code"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </header>
  )
}
