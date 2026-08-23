import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import App from './App.jsx'
import { LangProvider } from './lang.jsx'
import { PreloadProvider } from './preload.jsx'

// Renders one route to a markup string for the prerender script
// (prerender/index.js). `preload` is intentionally {} for every route today:
// see the note in preload.jsx. StaticRouter, not BrowserRouter/MemoryRouter,
// is what makes this safe to call outside a browser (no window/history use).
export function render(url, preload) {
  return {
    html: renderToString(
      <StaticRouter location={url}>
        <PreloadProvider value={preload}>
          <LangProvider>
            <App />
          </LangProvider>
        </PreloadProvider>
      </StaticRouter>
    ),
  }
}
