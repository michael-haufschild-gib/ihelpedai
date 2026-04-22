import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { LazyMotion } from 'motion/react'
import '@fontsource/roboto/300.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import './index.css'
import { App } from '@/App.tsx'

const loadFeatures = () => import('./features').then((res) => res.features)

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')
document.documentElement.dataset.appTheme = ''
document.documentElement.dataset.mode = 'dark-black'
document.documentElement.dataset.accent = 'violet'
createRoot(root).render(
  <StrictMode>
    <LazyMotion features={loadFeatures} strict>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LazyMotion>
  </StrictMode>,
)
