import React from 'react'
import ReactDOM from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { OptionsApp } from './OptionsApp'
import '../styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TooltipProvider>
      <OptionsApp />
    </TooltipProvider>
  </React.StrictMode>
)
