import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { migrateLegacyRouteUrl } from './lib/appRoute'

migrateLegacyRouteUrl()

if (import.meta.env.DEV) {
  void import('./debug/overflowGuard').then(
    ({ installHorizontalOverflowGuard }) => {
      installHorizontalOverflowGuard()
    },
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
