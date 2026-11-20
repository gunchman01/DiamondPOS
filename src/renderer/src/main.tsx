import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { PrinterPrompt } from './PrinterPrompt'
import { ApplicationDialogs } from './dialogs'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <ApplicationDialogs />
    <PrinterPrompt />
  </React.StrictMode>
)
