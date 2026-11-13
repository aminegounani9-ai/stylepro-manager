import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Storefront from './Storefront'
import ErrorBoundary from './ErrorBoundary'

const isStorefront = window.location.pathname.startsWith('/shop/')
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isStorefront ? <Storefront /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
)
