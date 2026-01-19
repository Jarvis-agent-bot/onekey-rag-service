import { Link } from 'react-router-dom'
import type { ProjectListItem } from '../types'
import RiskBadge from './RiskBadge'

interface ProjectCardProps {
  project: ProjectListItem
}

export default function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link
      to={`/project/${project.slug}`}
      className="block bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all p-5"
    >
      <div className="flex items-start gap-4">
        {/* Logo */}
        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {project.logo_url ? (
            <img
              src={project.logo_url}
              alt={project.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xl font-bold text-gray-400">
              {project.name.charAt(0)}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900 truncate">{project.name}</h3>
            {project.is_featured && (
              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                精选
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="bg-gray-100 px-2 py-0.5 rounded text-xs">
              {project.category_label}
            </span>
            <span>TVL: {project.tvl_formatted || '-'}</span>
          </div>
        </div>

        {/* Score */}
        <div className="text-right flex-shrink-0">
          <div className="text-2xl font-bold text-gray-900">{project.overall_score}</div>
          <RiskBadge level={project.risk_level} size="sm" />
        </div>
      </div>
    </Link>
  )
}
