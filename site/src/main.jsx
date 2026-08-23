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

// prerender/index.js embeds a small, targeted preload object per route (Fix
// round 1: today just each article's counterpart-language href, not full
// page content -- see preload.jsx's own comment on why full content preload
// stays a follow-up) as window.__PRELOAD__, right before </body>. Reading it
// here is what keeps the client's first render identical to what the server
// sent: usePageData resolves synchronously from this object on mount, so
// nothing has to wait for an effect to fetch the same data again, and
// hydration has nothing to reconcile. A plain `vite build` shell (no
// prerender) or the dev server never sets this global, so `|| {}` is the
// correct fallback there.
const preloaded = window.__PRELOAD__ || {}

const app = (
  <React.StrictMode>
    <BrowserRouter>
      <PreloadProvider value={preloaded}>
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
