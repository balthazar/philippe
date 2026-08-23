import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { LangProvider } from './lang.jsx'
import { PreloadProvider } from './preload.jsx'
import App from './App.jsx'
// Font faces (Libre Franklin 400/700, Didact Gothic 400) are declared in
// design/fonts.css, imported from base.css, pointing at the self-hosted
// files in public/fonts/ rather than @fontsource's CSS. Those stable paths
// are what index.html preloads; @fontsource's own CSS resolves to
// /node_modules/... paths that only exist in dev, not in a production
// build. The @fontsource packages remain dependencies as the versioned
// source the files in public/fonts/ were copied from.
import '@/design/base.css'

const root = document.getElementById('root')

const app = (
  <React.StrictMode>
    <BrowserRouter>
      {/* Task 22's prerender always calls render(route, {}): no content is
          preloaded today (see preload.jsx), only the shell and route chrome,
          so this provider's default {} is correct for both the prerendered
          and the plain-dev-server case. Every page's own usePageData() call
          fetches its content after mount either way. */}
      <PreloadProvider value={{}}>
        <LangProvider>
          <App />
        </LangProvider>
      </PreloadProvider>
    </BrowserRouter>
  </React.StrictMode>
)

// Prerendered routes ship real markup inside #root (prerender/index.js); a
// plain `dist/index.html` served straight from `vite build`, or the dev
// server, ships an empty div. hydrateRoot on an empty div throws (and warns
// of a mismatch), so which API to call is decided by what's actually there.
if (root.hasChildNodes()) {
  ReactDOM.hydrateRoot(root, app)
} else {
  ReactDOM.createRoot(root).render(app)
}
