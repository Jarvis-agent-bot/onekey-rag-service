import { Clock, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { TraceStep } from '@/api/types'
import { cn } from '@/lib/utils'

interface TraceTimelineProps {
  steps: TraceStep[] | null
  timings: Record<string, number>
}

export function TraceTimeline({ steps, timings }: TraceTimelineProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set())

  const toggleStep = (index: number) => {
    const next = new Set(expandedSteps)
    if (next.has(index)) {
      next.delete(index)
    } else {
      next.add(index)
    }
    setExpandedSteps(next)
  }

  const totalMs = timings.total_ms || 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Trace Timeline
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Timing summary */}
        <div className="flex flex-wrap gap-4">
          {Object.entries(timings).map(([key, value]) => (
            <div key={key} className="text-sm">
              <span className="text-muted-foreground">
                {key.replace(/_ms$/, '').replace(/_/g, ' ')}:
              </span>{' '}
              <span className="font-mono font-medium">{value}ms</span>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        {totalMs > 0 && (
          <div className="h-2 rounded-full bg-muted overflow-hidden flex">
            {Object.entries(timings)
              .filter(([key]) => key !== 'total_ms')
              .map(([key, value], index) => (
                <div
                  key={key}
                  className={cn(
                    'h-full',
                    index === 0 && 'bg-blue-500',
                    index === 1 && 'bg-green-500',
                    index === 2 && 'bg-yellow-500',
                    index === 3 && 'bg-purple-500',
                    index >= 4 && 'bg-gray-500'
                  )}
                  style={{ width: `${(value / totalMs) * 100}%` }}
                  title={`${key}: ${value}ms`}
                />
              ))}
          </div>
        )}

        {/* Steps */}
        {steps && steps.length > 0 ? (
          <div className="space-y-2">
            {steps.map((step, index) => {
              const isExpanded = expandedSteps.has(index)
              return (
                <div
                  key={index}
                  className="rounded-md border"
                >
                  <Button
                    variant="ghost"
                    className="w-full justify-start p-3 h-auto"
                    onClick={() => toggleStep(index)}
                  >
                    <div className="flex items-center gap-2 w-full">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                      <span className="font-mono text-sm">{step.name}</span>
                      <div className="flex-1" />
                      {step.duration_ms !== null && (
                        <Badge variant="outline" className="ml-2">
                          {step.duration_ms}ms
                        </Badge>
                      )}
                    </div>
                  </Button>
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2">
                      {step.input && Object.keys(step.input).length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            Input
                          </p>
                          <pre className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto">
                            {JSON.stringify(step.input, null, 2)}
                          </pre>
                        </div>
                      )}
                      {step.output && Object.keys(step.output).length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            Output
                          </p>
                          <pre className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto">
                            {JSON.stringify(step.output, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Trace log was not requested or is not available.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
