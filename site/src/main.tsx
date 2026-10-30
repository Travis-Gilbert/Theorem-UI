import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

const container = document.getElementById('root')!
const app = (
  <StrictMode>
    <App />
  </StrictMode>
)

// The build prerenders the page; `vite dev` serves the empty template.
if (container.hasChildNodes()) hydrateRoot(container, app)
else createRoot(container).render(app)
