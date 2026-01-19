import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  ExternalLink,
  AlertTriangle,
  TrendingUp,
  Clock,
  Globe,
  FileCode,
} from 'lucide-react'
import { getProject } from '../api/defi'
import { CATEGORY_LABELS } from '../types'
import RiskBadge from '../components/RiskBadge'
import ScoreChart from '../components/ScoreChart'

function formatTVL(tvl: number | null): string {
  if (tvl === null) return '-'
  if (tvl >= 1e9) return `$${(tvl / 1e9).toFixed(2)}B`
  if (tvl >= 1e6) return `$${(tvl / 1e6).toFixed(2)}M`
  if (tvl >= 1e3) return `$${(tvl / 1e3).toFixed(2)}K`
  return `$${tvl.toFixed(2)}`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

const SCORE_LABELS: Record<string, { label: string }> = {
  contract_security: { label: '合约安全' },
  team: { label: '团队背景' },
  tokenomics: { label: '代币经济' },
  operation: { label: '运营历史' },
}

export default function ProjectDetail() {
  const { slug } = useParams<{ slug: string }>()

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', slug],
    queryFn: () => getProject(slug!),
    enabled: !!slug,
  })

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-8" />
          <div className="bg-white rounded-xl p-8">
            <div className="flex items-start gap-6">
              <div className="w-20 h-20 bg-gray-200 rounded-xl" />
              <div className="flex-1">
                <div className="h-8 bg-gray-200 rounded w-1/3 mb-4" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">项目未找到</p>
          <Link to="/" className="text-blue-600 hover:underline">
            返回首页
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        返回列表
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Card */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-start gap-5">
              <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                {project.logo_url ? (
                  <img
                    src={project.logo_url}
                    alt={project.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-bold text-gray-400">
                    {project.name.charAt(0)}
                  </span>
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                  {project.is_featured && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      精选项目
                    </span>
                  )}
                </div>
                <div className="flex items-center flex-wrap gap-3 text-sm text-gray-500">
                  <span className="bg-gray-100 px-3 py-1 rounded">
                    {CATEGORY_LABELS[project.category] || project.category}
                  </span>
                  <RiskBadge level={project.risk_level} />
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-4 h-4" />
                    TVL: {formatTVL(project.tvl)}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-4xl font-bold text-gray-900">{project.overall_score}</div>
                <p className="text-sm text-gray-500 mt-1">综合评分</p>
              </div>
            </div>

            {project.description && (
              <p className="mt-5 text-gray-600">{project.description}</p>
            )}

            {/* Links */}
            <div className="mt-5 flex flex-wrap gap-3">
              {project.website && (
                <a
                  href={project.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
                >
                  <Globe className="w-4 h-4" />
                  官网
                </a>
              )}
              {project.contract_address && (
                <a
                  href={`https://etherscan.io/address/${project.contract_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
                >
                  <FileCode className="w-4 h-4" />
                  合约
                </a>
              )}
            </div>
          </div>

          {/* Score Details */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">评分详情</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <ScoreChart scores={project.score_details} />
              </div>
              <div className="space-y-4">
                {project.score_details && Object.entries(project.score_details).map(([key, value]) => {
                  const meta = SCORE_LABELS[key]
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">
                          {meta?.label || key}
                          <span className="text-gray-400 ml-1">({value?.weight ?? 0}%)</span>
                        </span>
                        <span className="font-medium text-gray-900">{value?.score ?? 0}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${value?.score ?? 0}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Risk Warnings */}
          {project.risk_warnings && project.risk_warnings.length > 0 && (
            <div className="bg-amber-50 rounded-xl p-6 border border-amber-100">
              <h2 className="text-lg font-semibold text-amber-800 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                风险提示
              </h2>
              <ul className="space-y-2">
                {project.risk_warnings.map((warning, index) => (
                  <li key={index} className="flex items-start gap-2 text-amber-700">
                    <span className="text-amber-500">•</span>
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Project Summary */}
          {project.summary && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">项目简评</h2>
              <p className="text-gray-600 text-sm leading-relaxed">{project.summary}</p>
            </div>
          )}

          {/* Info Card */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">项目信息</h2>
            <dl className="space-y-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">状态</dt>
                <dd className="font-medium text-gray-900 capitalize">{project.status}</dd>
              </div>
              {project.tokens && project.tokens.length > 0 && (
                <div>
                  <dt className="text-gray-500 mb-2">相关代币</dt>
                  <dd className="flex flex-wrap gap-1">
                    {project.tokens.map((token) => (
                      <span
                        key={token.address || token.symbol}
                        className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-xs"
                      >
                        {token.symbol}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500 flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  TVL 更新
                </dt>
                <dd className="font-medium text-gray-900">
                  {formatDate(project.tvl_updated_at)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">创建时间</dt>
                <dd className="font-medium text-gray-900">{formatDate(project.created_at)}</dd>
              </div>
            </dl>
          </div>

          {/* Source Links */}
          {project.source_links && project.source_links.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">参考链接</h2>
              <ul className="space-y-2">
                {project.source_links.map((link, index) => (
                  <li key={index}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm flex items-center gap-1 truncate"
                    >
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{link.title || link.url}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
