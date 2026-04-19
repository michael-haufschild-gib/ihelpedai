import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/roboto/300.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import './index.css'
import { App } from '@/App.tsx'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')
document.documentElement.setAttribute('data-app-theme', '')
document.documentElement.setAttribute('data-mode', 'dark-black')
document.documentElement.setAttribute('data-accent', 'violet')
createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
