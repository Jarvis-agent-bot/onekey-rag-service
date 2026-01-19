import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, Shield, AlertTriangle, BarChart3 } from 'lucide-react'
import { getProjects, getStats, getCategories } from '../api/defi'
import type { ProjectCategory, RiskLevel } from '../types'
import { RISK_LABELS } from '../types'
import ProjectCard from '../components/ProjectCard'
import SearchBar from '../components/SearchBar'

export default function Home() {
  const [category, setCategory] = useState<ProjectCategory | ''>('')
  const [riskLevel, setRiskLevel] = useState<RiskLevel | ''>('')
  const [page, setPage] = useState(1)

  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ['projects', category, riskLevel, page],
    queryFn: () =>
      getProjects({
        category: category || undefined,
        risk_level: riskLevel || undefined,
        page,
        page_size: 12,
      }),
  })

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })

  const totalPages = projectsData ? Math.ceil(projectsData.total / 12) : 1

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">项目总数</p>
                <p className="text-xl font-bold text-gray-900">{stats.total_projects}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">总 TVL</p>
                <p className="text-xl font-bold text-gray-900">{stats.total_tvl_formatted || '-'}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Shield className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">精选项目</p>
                <p className="text-xl font-bold text-gray-900">{stats.featured_projects}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">高风险项目</p>
                <p className="text-xl font-bold text-gray-900">
                  {(stats.risk_distribution?.high || 0) + (stats.risk_distribution?.critical || 0)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <SearchBar className="flex-1" />
          <div className="flex flex-wrap gap-3">
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as ProjectCategory | '')
                setPage(1)
              }}
              className="px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部类别</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label} ({cat.count})
                </option>
              ))}
            </select>
            <select
              value={riskLevel}
              onChange={(e) => {
                setRiskLevel(e.target.value as RiskLevel | '')
                setPage(1)
              }}
              className="px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部风险等级</option>
              {Object.entries(RISK_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Projects Grid */}
      {projectsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-5 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-gray-200" />
                <div className="flex-1">
                  <div className="h-5 bg-gray-200 rounded w-2/3 mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
                <div className="w-12 h-12 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : projectsData && projectsData.items.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projectsData.items.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                上一页
              </button>
              <span className="px-4 py-2 text-gray-600">
                第 {page} 页 / 共 {totalPages} 页
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                下一页
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">暂无项目数据</p>
        </div>
      )}
    </div>
  )
}
