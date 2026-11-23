import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

pendo.initialize({
  visitor: {
    id: '',
  },
  // Keep URL hash fragments (e.g. OIDC tokens on /callback) out of captured page URLs.
  // Safe because the app uses BrowserRouter and never routes on the hash.
  location: {
    transforms: [{ attr: 'hash', action: 'Clear' }],
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
