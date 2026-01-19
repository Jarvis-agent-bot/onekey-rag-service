import { useState, useCallback } from 'react'
import { Search, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { searchProjects } from '../api/defi'
import type { ProjectListItem } from '../types'

interface SearchBarProps {
  className?: string
}

export default function SearchBar({ className = '' }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()

  const { data: results = [] } = useQuery({
    queryKey: ['search', query],
    queryFn: () => searchProjects(query),
    enabled: query.length >= 2,
    staleTime: 30 * 1000,
  })

  const handleSelect = useCallback(
    (project: ProjectListItem) => {
      setQuery('')
      setIsOpen(false)
      navigate(`/project/${project.slug}`)
    },
    [navigate]
  )

  const handleClear = () => {
    setQuery('')
    setIsOpen(false)
  }

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="搜索项目名称..."
          className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && query.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-100 max-h-80 overflow-auto z-50">
          {results.length === 0 ? (
            <div className="p-4 text-center text-gray-500">未找到相关项目</div>
          ) : (
            results.map((project) => (
              <button
                key={project.id}
                onClick={() => handleSelect(project)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 text-left"
              >
                <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                  {project.logo_url ? (
                    <img
                      src={project.logo_url}
                      alt={project.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-bold text-gray-400">
                      {project.name.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{project.name}</div>
                  <div className="text-xs text-gray-500">{project.category_label}</div>
                </div>
                <div className="text-lg font-semibold text-gray-900">
                  {project.overall_score}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
      )}
    </div>
  )
}
