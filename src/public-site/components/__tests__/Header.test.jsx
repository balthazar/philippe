import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '../../../lib/lang.jsx'
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

  it('offers a toggle to the other language', () => {
    renderAt('/oeuvres')
    expect(screen.getByRole('link', { name: /english/i })).toHaveAttribute('href', '/en/works')
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
    await user.click(screen.getByRole('link', { name: /english/i }))
    expect(document.documentElement.lang).toBe('en')
  })
})
