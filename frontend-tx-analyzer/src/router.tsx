import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/layout'
import { AnalyzePage } from '@/features/analyze/AnalyzePage'
import { HistoryPage } from '@/features/history/HistoryPage'
import { ChainsPage } from '@/features/chains/ChainsPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <AnalyzePage />,
      },
      {
        path: 'history',
        element: <HistoryPage />,
      },
      {
        path: 'chains',
        element: <ChainsPage />,
      },
    ],
  },
])
