import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/tokens.css'
import './styles/layout.css'
import './styles/sidebar.css'
import './styles/variable-table.css'
import './styles/controls.css'
import './styles/modal-toast.css'
import './styles/settings-history.css'
import './styles/utilities.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
