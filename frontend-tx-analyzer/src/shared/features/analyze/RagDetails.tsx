import { Bot, BookOpen, ExternalLink, Info, ShieldAlert, AlertTriangle, ArrowRightLeft, Zap, AlertCircle, Lightbulb, CheckCircle, XCircle, Building2, FileCode2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ExplanationResult, SourceInfo, RiskLevel } from '@/api/types'
import { cn } from '@/lib/utils'

interface RagDetailsProps {
  explanation: ExplanationResult | null
  /** 是否显示详细的操作描述 */
  showActionDetails?: boolean
}

const riskColors: Record<RiskLevel | 'critical', string> = {
  low: 'text-green-600 bg-green-500/10',
  medium: 'text-yellow-600 bg-yellow-500/10',
  high: 'text-red-600 bg-red-500/10',
  critical: 'text-red-700 bg-red-600/20 border-red-500',
  unknown: 'text-gray-600 bg-gray-500/10',
}

const riskLabels: Record<RiskLevel | 'critical', string> = {
  low: '低风险',
  medium: '中等风险',
  high: '高风险',
  critical: '极高风险',
  unknown: '未知',
}

/** 简单的 Markdown 渲染（支持标题、列表、粗体） */
function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: JSX.Element[] = []
  let listItems: string[] = []
  let listType: 'ul' | 'ol' | null = null

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const ListTag = listType === 'ol' ? 'ol' : 'ul'
      elements.push(
        <ListTag key={elements.length} className={cn("text-sm space-y-1 pl-4", listType === 'ol' ? 'list-decimal' : 'list-disc')}>
          {listItems.map((item, i) => (
            <li key={i} className="text-muted-foreground" dangerouslySetInnerHTML={{ __html: formatInline(item) }} />
          ))}
        </ListTag>
      )
      listItems = []
      listType = null
    }
  }

  const formatInline = (text: string) => {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground font-medium">$1</strong>')
      .replace(/`(.+?)`/g, '<code class="text-xs bg-muted px-1 py-0.5 rounded">$1</code>')
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // 标题
    if (line.startsWith('### ')) {
      flushList()
      elements.push(
        <h4 key={elements.length} className="text-sm font-medium mt-3 mb-1 flex items-center gap-1.5">
          {line.slice(4)}
        </h4>
      )
    } else if (line.startsWith('## ')) {
      flushList()
      elements.push(
        <h3 key={elements.length} className="text-base font-medium mt-4 mb-2 border-b pb-1">
          {line.slice(3)}
        </h3>
      )
    }
    // 无序列表
    else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (listType !== 'ul') {
        flushList()
        listType = 'ul'
      }
      listItems.push(line.slice(2))
    }
    // 有序列表
    else if (/^\d+\.\s/.test(line)) {
      if (listType !== 'ol') {
        flushList()
        listType = 'ol'
      }
      listItems.push(line.replace(/^\d+\.\s/, ''))
    }
    // 普通段落
    else if (line) {
      flushList()
      elements.push(
        <p key={elements.length} className="text-sm text-muted-foreground my-1" dangerouslySetInnerHTML={{ __html: formatInline(line) }} />
      )
    }
  }
  flushList()

  return <div className="space-y-1">{elements}</div>
}

function getSourceTitle(source: SourceInfo): string {
  return source.title || source.url || '来源'
}

// 检查 source 是否与协议相关
function isSourceRelevant(source: SourceInfo, protocol: string | null | undefined): boolean {
  if (!protocol) return true
  const protocolLower = protocol.toLowerCase()
  const urlLower = (source.url || '').toLowerCase()
  const titleLower = (source.title || '').toLowerCase()
  return urlLower.includes(protocolLower) || titleLower.includes(protocolLower)
}

export function RagDetails({ explanation, showActionDetails = true }: RagDetailsProps) {
  if (!explanation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Bot className="h-4 w-4" />
            AI 分析详情
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            未请求 AI 分析或分析不可用
          </p>
        </CardContent>
      </Card>
    )
  }

  // 从 actions 中提取信息
  const actions = explanation.actions || []

  // 过滤相关的 sources
  const relevantSources = explanation.sources?.filter(s => isSourceRelevant(s, explanation.protocol)) || []
  const hasIrrelevantSources = (explanation.sources?.length || 0) > relevantSources.length

  const riskLevel = (explanation.risk_level || 'unknown') as RiskLevel | 'critical'
  const riskReasons = explanation.risk_reasons || []
  const warnings = explanation.warnings || []
  const recommendations = explanation.recommendations || []
  const securityAnalysis = explanation.security_analysis
  const contractInfo = explanation.contract_info

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Bot className="h-4 w-4" />
          AI 安全分析
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 协议识别 - 来自 contract_index 的确定性结果 */}
        {contractInfo && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400">
              <Building2 className="h-4 w-4" />
              <span>协议识别</span>
              <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-600 border-green-500/20 ml-auto">
                已验证
              </Badge>
            </div>
            <div className="grid gap-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">协议:</span>
                <span className="font-medium">
                  {contractInfo.protocol}
                  {contractInfo.protocol_version && (
                    <span className="text-muted-foreground ml-1">v{contractInfo.protocol_version}</span>
                  )}
                </span>
              </div>
              {contractInfo.contract_name && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">合约:</span>
                  <div className="flex items-center gap-1.5">
                    <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{contractInfo.contract_name}</span>
                    {contractInfo.contract_type && (
                      <Badge variant="outline" className="text-[10px]">{contractInfo.contract_type}</Badge>
                    )}
                  </div>
                </div>
              )}
              {contractInfo.source_url && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">文档:</span>
                  <a
                    href={contractInfo.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    查看官方文档
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI 摘要 */}
        {explanation.summary && (
          <div className="text-sm leading-relaxed bg-muted/30 rounded-lg p-3">
            {explanation.summary}
          </div>
        )}

        {/* 风险等级 */}
        <div className="flex items-center gap-3">
          <ShieldAlert className={cn(
            "h-5 w-5",
            riskLevel === 'critical' || riskLevel === 'high' ? 'text-red-500' :
            riskLevel === 'medium' ? 'text-yellow-500' :
            riskLevel === 'low' ? 'text-green-500' : 'text-muted-foreground'
          )} />
          <span className="text-sm font-medium">风险等级</span>
          <Badge variant="outline" className={cn("text-xs font-medium", riskColors[riskLevel])}>
            {riskLabels[riskLevel]}
          </Badge>
        </div>

        {/* 警告信息 - 高优先级展示 */}
        {warnings.length > 0 && (
          <div className={cn(
            "rounded-lg border p-3 space-y-2",
            riskLevel === 'critical' || riskLevel === 'high'
              ? "bg-red-500/10 border-red-500/30"
              : "bg-yellow-500/10 border-yellow-500/30"
          )}>
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertCircle className={cn(
                "h-4 w-4",
                riskLevel === 'critical' || riskLevel === 'high' ? "text-red-500" : "text-yellow-500"
              )} />
              <span>安全警告</span>
            </div>
            <ul className="space-y-1 text-sm pl-6">
              {warnings.map((warning, index) => (
                <li key={index} className="flex items-start gap-2">
                  <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-500" />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 风险原因 */}
        {riskReasons.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">风险因素</div>
            <ul className="space-y-1.5 text-sm pl-4">
              {riskReasons.map((reason, index) => (
                <li key={index} className="flex items-start gap-2">
                  <AlertTriangle className={cn(
                    "h-3.5 w-3.5 mt-0.5 shrink-0",
                    riskLevel === 'critical' || riskLevel === 'high' ? 'text-red-500' :
                    riskLevel === 'medium' ? 'text-yellow-500' : 'text-muted-foreground'
                  )} />
                  <span className="text-muted-foreground">{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 详细安全分析 (Markdown) */}
        {securityAnalysis && (
          <div className="rounded-lg border bg-muted/20 p-4">
            <SimpleMarkdown content={securityAnalysis} />
          </div>
        )}

        {/* 安全建议 */}
        {recommendations.length > 0 && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700">
              <Lightbulb className="h-4 w-4" />
              <span>安全建议</span>
            </div>
            <ul className="space-y-1 text-sm pl-6">
              {recommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-2">
                  <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-green-600" />
                  <span className="text-muted-foreground">{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 操作详情 */}
        {showActionDetails && actions.length > 0 && (
          <details className="group" open>
            <summary className="cursor-pointer text-sm font-medium flex items-center gap-2 hover:text-primary">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span>操作详情</span>
              <span className="text-xs text-muted-foreground">({actions.length})</span>
            </summary>
            <div className="mt-2 space-y-2 pl-6">
              {actions.map((action, index) => {
                const act = action as Record<string, unknown>
                const actionType = act.type as string | undefined
                const actionProtocol = act.protocol as string | undefined
                const description = act.description as string | undefined
                const assets = act.assets as Array<{ token?: string; amount?: string; direction?: string }> | undefined

                return (
                  <div key={index} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {actionType && (
                        <Badge variant="secondary" className="text-xs">
                          {actionType}
                        </Badge>
                      )}
                      {actionProtocol && (
                        <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/20">
                          {actionProtocol}
                        </Badge>
                      )}
                    </div>
                    {description && (
                      <p className="text-sm text-muted-foreground">{description}</p>
                    )}
                    {assets && assets.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {assets.map((asset, i) => (
                          <div key={i} className="flex items-center gap-1 text-xs bg-background px-2 py-1 rounded">
                            <ArrowRightLeft className={cn(
                              "h-3 w-3",
                              asset.direction === 'in' ? 'text-green-500' :
                              asset.direction === 'out' ? 'text-red-500' : 'text-muted-foreground'
                            )} />
                            <span className="font-mono">{asset.amount || '?'}</span>
                            <span className="font-medium">{asset.token || '未知'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </details>
        )}

        {/* 地址归属信息 */}
        {explanation.address_attribution && explanation.address_attribution.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              <span>合约地址识别</span>
              <span className="text-xs">({explanation.address_attribution.length}个地址)</span>
            </summary>
            <div className="mt-2 space-y-2 pl-2 border-l-2 border-muted">
              {explanation.address_attribution.map((item, index) => (
                <div key={index} className="text-xs space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground truncate max-w-[200px]">{item.address}</span>
                    {item.is_verified !== undefined && (
                      item.is_verified
                        ? <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-600 border-green-500/20">已验证</Badge>
                        : <Badge variant="outline" className="text-[10px] bg-yellow-500/10 text-yellow-600 border-yellow-500/20">未验证</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.protocol || '未知'}</span>
                    {item.name && <span className="text-muted-foreground">· {item.name}</span>}
                    {item.evidence && <span className="text-muted-foreground/60">· {item.evidence}</span>}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Sources */}
        {relevantSources.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <BookOpen className="h-3 w-3" />
              参考来源
              {hasIrrelevantSources && (
                <span className="text-xs font-normal normal-case">(已过滤无关文档)</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {relevantSources.slice(0, 5).map((source, index) => (
                <a
                  key={index}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline bg-primary/5 px-2 py-1 rounded"
                >
                  {getSourceTitle(source)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* 无相关来源提示 - 仅在没有 contractInfo 验证时显示 */}
        {!contractInfo && relevantSources.length === 0 && explanation.sources && explanation.sources.length > 0 && (
          <div className="text-xs text-muted-foreground pt-2 border-t">
            <Info className="h-3 w-3 inline mr-1" />
            AI 分析基于模型知识，知识库中未找到 {explanation.protocol || '该协议'} 的相关文档
          </div>
        )}

        {/* 提示：AI 分析局限性 */}
        <div className="text-xs text-muted-foreground/70 pt-2 border-t flex items-start gap-1.5">
          <Info className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            AI 安全分析基于知识库检索和模型推理，仅供参考。请结合链上数据和专业判断做出决策。
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
