import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { LangProvider } from './lang.jsx'
import App from './App.jsx'
// Font faces (Libre Franklin 400/700, Didact Gothic 400) are declared in
// design/fonts.css, imported from base.css, pointing at the self-hosted
// files in public/fonts/ rather than @fontsource's CSS. Those stable paths
// are what index.html preloads; @fontsource's own CSS resolves to
// /node_modules/... paths that only exist in dev, not in a production
// build. The @fontsource packages remain dependencies as the versioned
// source the files in public/fonts/ were copied from.
import '@/design/base.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LangProvider>
        <App />
      </LangProvider>
    </BrowserRouter>
  </React.StrictMode>
)
