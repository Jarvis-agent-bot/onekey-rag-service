import { Bot, BookOpen, ExternalLink } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ExplanationResult, SourceInfo } from '@/api/types'

function getSourceHost(value: string) {
  if (!value) return ''
  try {
    const url = new URL(value)
    return url.host
  } catch {
    return ''
  }
}
function getSourceTitle(source: SourceInfo): string {
  return source.title || source.url || '来源'
}

interface RagExplanationProps {
  explanation: ExplanationResult | null
}

export function RagExplanation({ explanation }: RagExplanationProps) {
  if (!explanation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <Bot className="h-5 w-5" />
            RAG Explanation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            RAG explanation was not requested or is not available.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <Bot className="h-5 w-5" />
          RAG Explanation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {explanation.summary || 'No summary available.'}
          </ReactMarkdown>
        </div>

        {/* Actions */}
        {explanation.actions && explanation.actions.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Detected Actions:</p>
            <div className="space-y-2">
              {explanation.actions.map((action, index) => (
                <div
                  key={index}
                  className="rounded-md bg-muted/50 p-3 text-sm"
                >
                  <pre className="whitespace-pre-wrap font-mono text-xs">
                    {JSON.stringify(action, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sources */}
        {explanation.sources && explanation.sources.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Sources
              <Badge variant="secondary" className="ml-1">
                {explanation.sources.length}
              </Badge>
            </p>
            <div className="divide-y rounded-md border border-muted/60 bg-background">
              {explanation.sources.map((source, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between w-full gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {getSourceTitle(source)}
                      </div>
                      {source.url && (
                        <div className="text-xs text-muted-foreground">
                          {getSourceHost(source.url)}
                        </div>
                      )}
                    </div>
                    {source.url && (
                      <a
                        className="inline-flex items-center gap-1 text-xs text-primary"
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-3 w-3" />
                        查看
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
