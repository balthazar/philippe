import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { LangProvider } from './lib/lang.jsx'
import App from './App.jsx'
// Libre Franklin needs both weights: captions, section/article headings and
// figure captions render at regular 400, while the header (wordmark, nav,
// FR/EN) and .category-section/.block-heading render at 700 per spec. Body
// copy (Didact Gothic) stays at regular 400 throughout.
import '@fontsource/libre-franklin/400.css'
import '@fontsource/libre-franklin/700.css'
import '@fontsource/didact-gothic/400.css'
import './design/base.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LangProvider>
        <App />
      </LangProvider>
    </BrowserRouter>
  </React.StrictMode>
)
