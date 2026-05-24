import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { EnsoApp } from './EnsoApp.tsx'

const isEnso = window.location.pathname.startsWith('/enso')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isEnso ? <EnsoApp /> : <App />}
  </StrictMode>,
)
