import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n' // i18n initialization
import './styles/design-tokens.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
