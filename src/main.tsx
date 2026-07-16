import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@react-sigma/core/lib/style.css'
import App from './App.tsx'
import './style.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
