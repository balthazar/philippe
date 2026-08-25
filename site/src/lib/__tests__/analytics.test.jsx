import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useAnalytics, GA_MEASUREMENT_ID } from '../analytics.js'

// The hook is a no-op in dev (import.meta.env.DEV), which is what every test
// run is. Flipping it here is what lets the production behaviour be tested at
// all -- without it these would all trivially pass by doing nothing.
beforeEach(() => {
  vi.stubEnv('DEV', false)
  delete window.gtag
  delete window.dataLayer
  document.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove())
})
afterEach(() => vi.unstubAllEnvs())

function Probe() {
  useAnalytics()
  return null
}

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>
  )

const pageViews = () =>
  (window.dataLayer || []).filter((args) => args[0] === 'event' && args[1] === 'page_view')

const tagScript = () => document.querySelector('script[src*="googletagmanager"]')

describe('useAnalytics', () => {
  it('loads the tag and sends one page view for the route', () => {
    renderAt('/porte-abri')
    expect(tagScript()?.src).toContain(GA_MEASUREMENT_ID)
    expect(pageViews()).toHaveLength(1)
    expect(pageViews()[0][2].page_path).toBe('/porte-abri')
  })

  // gtag's own automatic page view fires once on script load and never
  // again, so a SPA has to send them itself -- which only works if the
  // automatic one is off, or the first route is counted twice.
  it('turns off gtag’s automatic page view', () => {
    renderAt('/')
    const config = window.dataLayer.find((args) => args[0] === 'config')
    expect(config[2]).toEqual({ send_page_view: false })
  })

  it('keeps the query string, since it distinguishes two views of one path', () => {
    renderAt('/oeuvres?filter=versos')
    expect(pageViews()[0][2].page_path).toBe('/oeuvres?filter=versos')
  })

  it('reports the title the page actually ended up with', () => {
    document.title = 'Porte, abri — Philippe Gronon'
    renderAt('/porte-abri')
    expect(pageViews()[0][2].page_title).toBe('Porte, abri — Philippe Gronon')
  })

  // The artist editing his own site is not traffic, and every article opened
  // in the editor would otherwise report a view of that article.
  it('sends nothing at all on /admin, and never loads the tag there', () => {
    renderAt('/admin/articles/abc123')
    expect(tagScript()).toBeNull()
    expect(window.dataLayer).toBeUndefined()
  })

  it('excludes /admin itself, not just its children', () => {
    renderAt('/admin')
    expect(tagScript()).toBeNull()
  })

  // A public route that merely starts with the same letters is not the admin.
  it('does not mistake a slug like /administration for the admin', () => {
    renderAt('/administration')
    expect(pageViews()).toHaveLength(1)
  })

  // React 18 StrictMode double-mounts effects; a re-render at the same route
  // must not be reported twice.
  it('sends one view per route, not one per render', () => {
    const { rerender } = renderAt('/')
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <Routes><Route path="*" element={<Probe />} /></Routes>
      </MemoryRouter>
    )
    expect(pageViews()).toHaveLength(1)
  })

  it('stays silent in development', () => {
    vi.stubEnv('DEV', true)
    renderAt('/')
    expect(tagScript()).toBeNull()
    expect(window.dataLayer).toBeUndefined()
  })
})
