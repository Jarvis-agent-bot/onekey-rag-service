import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Home from './pages/Home'
import ProjectDetail from './pages/ProjectDetail'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/project/:slug" element={<ProjectDetail />} />
          </Routes>
        </main>
        <footer className="bg-gray-800 text-gray-400 py-6">
          <div className="container mx-auto px-4 text-center text-sm">
            <p>DeFi 项目安全评分系统 - 仅供参考，不构成投资建议</p>
            <p className="mt-1">数据来源: DefiLlama</p>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  )
}

export default App
