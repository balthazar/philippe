import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import App from './App.jsx'
import { LangProvider } from './lang.jsx'
import { PreloadProvider } from './preload.jsx'

// Renders one route to a markup string for the prerender script
// (prerender/index.js), which passes preloadFor(route, content) so that
// values which must be right in the raw HTML -- an article's
// language-toggle href today -- are resolved server-side rather than by a
// post-hydration effect. StaticRouter, not BrowserRouter/MemoryRouter, is
// what makes this safe to call outside a browser (no window/history use).
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
