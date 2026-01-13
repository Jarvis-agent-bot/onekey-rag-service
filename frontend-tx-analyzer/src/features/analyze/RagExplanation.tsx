import { Bot, BookOpen } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ExplanationResult } from '@/api/types'

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
            <p className="text-sm font-medium flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Sources
              <Badge variant="secondary" className="ml-1">
                {explanation.sources.length}
              </Badge>
            </p>
            <div className="space-y-2">
              {explanation.sources.map((source, index) => (
                <div
                  key={index}
                  className="rounded-md border p-3 text-sm"
                >
                  {typeof source === 'string' ? (
                    source
                  ) : (
                    <div className="space-y-1">
                      {Object.entries(source).map(([key, value]) => (
                        <div key={key} className="flex gap-2">
                          <span className="text-muted-foreground">{key}:</span>
                          <span>{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
