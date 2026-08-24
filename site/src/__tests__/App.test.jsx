// Paths corrected per the Task 19 controller corrections: no `lib/` prefix
// (flattened into src/), `@/` alias for imports other files already use.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '@/lang.jsx'
import * as api from '@/api.js'
import App from '../App.jsx'

// Two articles that are counterparts of one another (fr slug 'porte-fr',
// en slug 'door-en'), used to prove the language toggle on an article page
// points at the counterpart slug, not the bare translated section.
beforeEach(() => {
  vi.spyOn(api, 'apiGet').mockImplementation(async (path, params) => {
    if (path.startsWith('/pages/')) {
      return { key: 'biography', title: 'Biographie', blocks: [{ type: 'text', value: '<p>Né en 1964</p>' }] }
    }
    if (path === '/home') return { slides: [] }
    if (path.startsWith('/articles/')) {
      return params?.lang === 'en'
        ? { slug: 'door-en', title: 'Door', blocks: [] }
        : { slug: 'porte-fr', title: 'Porte', blocks: [] }
    }
    return { items: [], total: 0 }
  })
})

const renderAt = (path) =>
  render(<MemoryRouter initialEntries={[path]}><LangProvider><App /></LangProvider></MemoryRouter>)

describe('App routing', () => {
  it('renders the French biography page', async () => {
    renderAt('/biographie')
    await waitFor(() => expect(screen.getByText('Né en 1964')).toBeInTheDocument())
  })

  it('renders the English biography page', async () => {
    renderAt('/en/biography')
    await waitFor(() => expect(screen.getByText('Né en 1964')).toBeInTheDocument())
  })

  // Task 27, Part A: with articles at the root, a single unknown path
  // segment is indistinguishable from a genuine article slug until the API
  // says otherwise -- it can no longer be the site-level 404 page. Only a
  // path with no matching route shape at all (more than one segment, here)
  // still falls through to the catch-all NotFound route.
  it('renders a 404 for an unknown multi-segment path', async () => {
    renderAt('/nonsense/extra')
    await waitFor(() => expect(screen.getByRole('heading', { name: /404/ })).toBeInTheDocument())
  })

  it('treats a single unknown path segment as a potential article slug, not the site 404 page', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue(Object.assign(new Error('nope'), { status: 404 }))
    renderAt('/nonsense')
    await waitFor(() => expect(screen.getByText(/introuvable/i)).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: /404/ })).not.toBeInTheDocument()
  })

  // Guards the wiring called out in the Task 19 controller corrections:
  // ArticleDetail's onTranslatedPath must reach Header's toggle so it points
  // at the article's own counterpart slug, not the bare translated section
  // (which counterpartPath() alone would produce). Task 27, Part A: the
  // article itself now lives at the root (/porte-fr), not under /oeuvres/.
  it('points the language toggle at an article counterpart slug, not the bare section', async () => {
    renderAt('/porte-fr')
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'EN' })).toHaveAttribute('href', '/en/door-en')
    )
  })

  // Task 27, Part A: the old WordPress URLs carried a trailing slash
  // (/<slug>/); the new root-level article URLs must resolve identically
  // with or without it, or this change loses exactly the traffic it exists
  // to keep.
  it('resolves a trailing-slash article URL the same as the slash-free form', async () => {
    renderAt('/porte-fr/')
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Porte' })).toBeInTheDocument())
  })

  // Task 33: the footer is retired outright (its links moved to /contact,
  // see SimplePage.test.jsx) -- no page renders a <footer> any more,
  // homepage included, so there is nothing left to suppress or indent.
  it('never renders a footer, on the homepage or any other page', async () => {
    renderAt('/')
    await waitFor(() => expect(screen.getByRole('navigation', { name: /navigation principale/i })).toBeInTheDocument())
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()

    renderAt('/biographie')
    await waitFor(() => expect(screen.getByText('Né en 1964')).toBeInTheDocument())
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
  })

  // Client feedback: a short page (e.g. /contact) must never scroll --
  // header + main together fit exactly one viewport. `.site-shell` wraps
  // them as a flex column with min-height: 100dvh, and .page-main's own
  // flex: 1 0 auto is what lets it absorb exactly the slack left after the
  // header's natural height -- never more, never less. Task 33: the footer
  // that used to share this shell is gone, so the shell now only ever holds
  // header + main.
  it('wraps header and main in a single flex shell that fits one viewport', async () => {
    const { container } = renderAt('/biographie')
    await waitFor(() => expect(screen.getByText('Né en 1964')).toBeInTheDocument())
    const shell = container.querySelector('.site-shell')
    expect(shell).toBeInTheDocument()
    expect(shell.querySelector(':scope > header')).toBeInTheDocument()
    expect(shell.querySelector(':scope > main')).toBeInTheDocument()
    expect(shell.querySelector(':scope > footer')).not.toBeInTheDocument()
  })

  it('keeps the flex shell on the homepage too', async () => {
    const { container } = renderAt('/')
    await waitFor(() => expect(container.querySelector('.site-shell')).toBeInTheDocument())
    const shell = container.querySelector('.site-shell')
    expect(shell.querySelector(':scope > header')).toBeInTheDocument()
    expect(shell.querySelector(':scope > footer')).not.toBeInTheDocument()
  })

  // Task 20 controller correction 2: /admin must reach the admin shell, not
  // the public 404, and it must never carry the public <Header>/<Footer>.
  it('renders the admin login at /admin, without the public header', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue(Object.assign(new Error('nope'), { status: 401 }))
    // Resolve the lazily-imported admin chunk BEFORE rendering, so React.lazy
    // has it in the module cache and settles on the first tick. Without this
    // the dynamic import races waitFor's 1s default: fine when this file runs
    // alone, and a reliable failure under full-suite load, where the import
    // lands around 1050-1200ms. Preloading fixes the race rather than hiding
    // it behind a longer timeout.
    await import('@/admin/Admin.jsx')
    renderAt('/admin')
    await waitFor(() => expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument())
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /404/ })).not.toBeInTheDocument()
  })
})
