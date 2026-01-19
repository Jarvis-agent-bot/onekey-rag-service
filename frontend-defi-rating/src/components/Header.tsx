import { Link } from 'react-router-dom'
import { Shield } from 'lucide-react'

export default function Header() {
  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <Shield className="w-6 h-6 text-blue-600" />
            <span>DeFi 安全评分</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link to="/" className="text-gray-600 hover:text-gray-900 transition-colors">
              项目列表
            </Link>
          </nav>
        </div>
      </div>
    </header>
  )
}
