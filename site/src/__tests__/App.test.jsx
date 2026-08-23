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

  it('renders a 404 for an unknown path', async () => {
    renderAt('/nonsense')
    await waitFor(() => expect(screen.getByRole('heading', { name: /404/ })).toBeInTheDocument())
  })

  // Guards the wiring called out in the Task 19 controller corrections:
  // ArticleDetail's onTranslatedPath must reach Header's toggle so it points
  // at the article's own counterpart slug, not the bare translated section
  // (which counterpartPath() alone would produce: /en/works/porte-fr).
  it('points the language toggle at an article counterpart slug, not the bare section', async () => {
    renderAt('/oeuvres/porte-fr')
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'EN' })).toHaveAttribute('href', '/en/works/door-en')
    )
  })
})
