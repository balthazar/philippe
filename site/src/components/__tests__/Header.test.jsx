import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '@/lang.jsx'
import { PreloadProvider } from '@/preload.jsx'
import { Header } from '../Header.jsx'

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LangProvider><Header /></LangProvider>
    </MemoryRouter>
  )

describe('Header', () => {
  // testing-library's auto-registered afterEach(cleanup) unmounts React
  // trees but does not reset document.documentElement.lang, and jsdom sets
  // no default. Without this reset, a test earlier in the file can leave
  // 'fr' in place and let a later assertion pass for the wrong reason.
  beforeEach(() => {
    document.documentElement.removeAttribute('lang')
  })

  it('shows the four French nav items', () => {
    renderAt('/')
    for (const label of ['Œuvres', 'Expositions', 'Biographie', 'Contact']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('shows English nav items under /en', () => {
    renderAt('/en')
    expect(screen.getByRole('link', { name: 'Works' })).toHaveAttribute('href', '/en/works')
  })

  it('shows both language codes with the current one marked active', () => {
    renderAt('/oeuvres')
    expect(screen.getByText('FR')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('EN').closest('a')).not.toBeNull()
  })

  it('links the inactive language to the counterpart path', () => {
    renderAt('/oeuvres')
    expect(screen.getByRole('link', { name: 'EN' })).toHaveAttribute('href', '/en/works')
  })

  // Fix round 1 (Task 22): on an article page, the naive counterpartPath
  // guess (same slug, other language prefix) is wrong whenever the two
  // languages have different slugs. Without the `translatedPath` prop
  // (which real ArticleDetail only ever sets from a *client* effect --
  // never during SSR), this pins that the preload path, read straight from
  // context, is what makes the link right on the very first render instead.
  it('prefers a preloaded translatedPath over the naive same-slug guess, with no translatedPath prop set', () => {
    render(
      <MemoryRouter initialEntries={['/oeuvres/tableaux-electriques-2007-2010']}>
        <PreloadProvider value={{ 'translatedPath:works:tableaux-electriques-2007-2010:fr': '/en/works/switchboards-2007-2010' }}>
          <LangProvider><Header /></LangProvider>
        </PreloadProvider>
      </MemoryRouter>
    )
    expect(screen.getByRole('link', { name: 'EN' })).toHaveAttribute('href', '/en/works/switchboards-2007-2010')
  })

  it('sets the document language to match the route', () => {
    renderAt('/oeuvres')
    expect(document.documentElement.lang).toBe('fr')
    renderAt('/en/works')
    expect(document.documentElement.lang).toBe('en')
  })

  // Each renderAt above is a fresh mount, and React runs a mount's effects
  // regardless of its dependency array, so those two assertions can't tell
  // useEffect(fn, [lang]) apart from a broken useEffect(fn, []). This test
  // mounts once and navigates within that same tree (via the toggle link a
  // visitor would actually click) so the effect must re-run on a location
  // change, not just on mount, to pass.
  it('updates the document language during client-side navigation', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/oeuvres']}>
        <LangProvider><Header /></LangProvider>
      </MemoryRouter>
    )
    expect(document.documentElement.lang).toBe('fr')
    await user.click(screen.getByRole('link', { name: 'EN' }))
    expect(document.documentElement.lang).toBe('en')
  })
})
