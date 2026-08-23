import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LangProvider } from '@/lang.jsx'
import * as api from '@/api.js'
import { ArticleDetail } from '../ArticleDetail.jsx'

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LangProvider>
        <Routes>
          <Route path="/oeuvres/:slug" element={<ArticleDetail routeKey="works" />} />
        </Routes>
      </LangProvider>
    </MemoryRouter>
  )

describe('ArticleDetail', () => {
  // Task 26, correction to B4: ArticleDetail previously returned null while
  // loading, so the first paint was header + footer only, with the footer
  // riding up near the top.
  it('reserves space and renders no article while loading', async () => {
    // ArticleDetail fires two apiGet calls (the article itself, and the
    // translatedPath lookup for the language toggle) -- both must resolve
    // before `article` stops being null.
    const resolvers = []
    vi.spyOn(api, 'apiGet').mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)))
    const { container } = renderAt('/oeuvres/porte')

    const main = container.querySelector('main')
    expect(main).toBeInTheDocument()
    expect(main).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()

    resolvers.forEach((resolve) => resolve({ slug: 'porte', title: 'Porte', blocks: [] }))
    await waitFor(() => expect(container.querySelector('main')).not.toHaveAttribute('aria-busy'))
  })

  it('renders the article once loaded, no longer busy', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ slug: 'porte', title: 'Porte', blocks: [] })
    const { container } = renderAt('/oeuvres/porte')
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Porte' })).toBeInTheDocument())
    expect(container.querySelector('main')).not.toHaveAttribute('aria-busy')
  })

  it('still renders the reserved-height main, not busy, on a 404', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue(Object.assign(new Error('nope'), { status: 404 }))
    const { container } = renderAt('/oeuvres/inconnu')
    await waitFor(() => expect(screen.getByText(/introuvable/i)).toBeInTheDocument())
    expect(container.querySelector('main')).not.toHaveAttribute('aria-busy')
  })

  // Task 26, part A1/B: a subtitle with nothing rendering it is half a
  // change. Read the same way as title/yearLabel: the public API already
  // resolves it to a plain string for the requested language.
  it('renders the subtitle between the title and the year label', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      slug: 'porte', title: 'Porte', subtitle: 'Numérisation, épreuves numériques pigmentaires',
      yearLabel: '2023', blocks: [],
    })
    renderAt('/oeuvres/porte')
    await waitFor(() => expect(screen.getByText('Numérisation, épreuves numériques pigmentaires')).toBeInTheDocument())
  })

  it('renders no subtitle line when the article has none', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ slug: 'expo', title: 'Expo', subtitle: '', blocks: [] })
    const { container } = renderAt('/oeuvres/expo')
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument())
    expect(container.querySelector('.article-subtitle')).not.toBeInTheDocument()
  })

  // Task 26, part B2: text left, gallery right on desktop -- a two-column
  // layout when the blocks are a clean text-then-media shape (the works
  // shape), a single column when they are not (see articleLayout.test.js).
  it('splits into a two-column layout for a text-then-gallery article', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      slug: 'chassis', title: 'Châssis', blocks: [
        { type: 'text', value: '<p>Description</p>' },
        { type: 'gallery', columns: 3, items: [] },
      ],
    })
    const { container } = renderAt('/oeuvres/chassis')
    await waitFor(() => expect(container.querySelector('.article-layout')).toBeInTheDocument())
    expect(container.querySelector('.article-text-col').textContent).toContain('Description')
    expect(container.querySelector('.article-media-col .block-gallery')).toBeInTheDocument()
  })

  it('renders a single column when text and media interleave', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      slug: 'expo-multi', title: 'Expo multi', blocks: [
        { type: 'heading', value: 'Un', level: 3 },
        { type: 'gallery', columns: 3, items: [] },
        { type: 'heading', value: 'Deux', level: 3 },
        { type: 'gallery', columns: 3, items: [] },
      ],
    })
    const { container } = renderAt('/oeuvres/expo-multi')
    await waitFor(() => expect(screen.getByText('Un')).toBeInTheDocument())
    expect(container.querySelector('.article-layout')).not.toBeInTheDocument()
    expect(screen.getByText('Deux')).toBeInTheDocument()
  })
})
