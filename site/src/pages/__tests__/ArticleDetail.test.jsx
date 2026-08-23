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

  // Coordinator feedback (task 27): the exact same format headFor() uses
  // for an article's prerendered <title> -- title, year, site name.
  it('sets document.title with the title and year once loaded', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ slug: 'porte', title: 'Porte', yearLabel: '2023', blocks: [] })
    renderAt('/oeuvres/porte')
    await waitFor(() => expect(document.title).toBe('Porte, 2023 | Philippe Gronon'))
  })

  it('omits the year from document.title when the article has none', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ slug: 'porte', title: 'Porte', blocks: [] })
    renderAt('/oeuvres/porte')
    await waitFor(() => expect(document.title).toBe('Porte | Philippe Gronon'))
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
    // Task 30, part 5: `heading` is retired -- what used to be a heading
    // block is now a `text` block carrying an <h3>.
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      slug: 'expo-multi', title: 'Expo multi', blocks: [
        { type: 'text', value: '<h3>Un</h3>' },
        { type: 'gallery', columns: 3, items: [] },
        { type: 'text', value: '<h3>Deux</h3>' },
        { type: 'gallery', columns: 3, items: [] },
      ],
    })
    const { container } = renderAt('/oeuvres/expo-multi')
    await waitFor(() => expect(screen.getByText('Un')).toBeInTheDocument())
    expect(container.querySelector('.article-layout')).not.toBeInTheDocument()
    expect(screen.getByText('Deux')).toBeInTheDocument()
  })

  // Task 28, part 1: the client found the previous/next pager ugly and
  // wants it gone. The API still computes prev/next (left in place on
  // purpose -- see api/src/routes/public.js), so the fixture below
  // deliberately includes both to prove removal isn't just "the fixture
  // never had a sibling".
  it('renders no article pager, even when the article has prev/next siblings', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      slug: 'porte', title: 'Porte', blocks: [],
      prev: { slug: 'avant', title: 'Avant' },
      next: { slug: 'apres', title: 'Après' },
    })
    const { container } = renderAt('/oeuvres/porte')
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument())
    expect(container.querySelector('.article-pager')).not.toBeInTheDocument()
    expect(screen.queryByText(/précédent/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/suivant/i)).not.toBeInTheDocument()
  })

  // Task 28, part 2: the client's reference shows the gallery's top edge
  // level with the top of the title. The header used to render entirely
  // above the two-column grid (a sibling, not a grid item), which is
  // exactly what put the gallery a header's-height below the title instead
  // of level with it -- broken by moving the header back out of
  // `.article-layout` (the regression this guards against).
  it('renders the header as the first item inside the two-column grid, not above it', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      slug: 'chassis', title: 'Châssis', blocks: [
        { type: 'text', value: '<p>Description</p>' },
        { type: 'gallery', columns: 3, items: [] },
      ],
    })
    const { container } = renderAt('/oeuvres/chassis')
    await waitFor(() => expect(container.querySelector('.article-layout')).toBeInTheDocument())
    const layout = container.querySelector('.article-layout')
    expect(layout.querySelector(':scope > .article-header')).toBeInTheDocument()
    expect(layout.querySelector(':scope > .article-header h1')).toHaveTextContent('Châssis')
  })

  // Task 28, part 3: the exhibitions timeline is persistent chrome for the
  // whole section, not a one-off index widget -- an exhibition article's
  // own page shows the same year list, with its own year marked current.
  describe('exhibition articles', () => {
    const mockExhibitionApi = () =>
      vi.spyOn(api, 'apiGet').mockImplementation((path, params = {}) => {
        if (path === '/articles/2023') {
          return Promise.resolve({ slug: '2023', title: '2023', category: 'exhibitions', blocks: [] })
        }
        if (path === '/articles') {
          expect(params.category).toBe('exhibitions')
          return Promise.resolve({
            items: [
              { _id: '1', slug: '2024', title: '2024' },
              { _id: '2', slug: '2023', title: '2023' },
              { _id: '3', slug: '1989', title: '1989' },
            ],
            total: 3,
          })
        }
        return Promise.reject(Object.assign(new Error('unexpected path'), { status: 404 }))
      })

    it('wraps an exhibition article in the timeline, with its own year current', async () => {
      mockExhibitionApi()
      renderAt('/oeuvres/2023')
      // The nav itself renders as soon as the article loads, with an empty
      // item list until the timeline's own (separate) fetch resolves --
      // waiting on the nav's mere presence would be a race against that
      // second fetch. Wait on the actual link instead.
      const current = await screen.findByRole('link', { name: '2023' })
      expect(current).toHaveAttribute('aria-current', 'true')
      expect(current).toHaveAttribute('href', '/2023')

      const other = screen.getByRole('link', { name: '2024' })
      expect(other).not.toHaveAttribute('aria-current')
      expect(other).toHaveAttribute('href', '/2024')
    })

    it('does not fetch the exhibitions timeline for a non-exhibition (works) article', async () => {
      const spy = vi.spyOn(api, 'apiGet').mockResolvedValue({ slug: 'porte', title: 'Porte', blocks: [] })
      renderAt('/oeuvres/porte')
      await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument())
      expect(spy).not.toHaveBeenCalledWith('/articles', expect.anything())
    })

    // Task 29, part 1: the timeline already marks its own year current
    // (checked above) -- an h1 repeating the year beside it is a duplicate
    // label, not new information.
    it('renders no year heading for an exhibition article', async () => {
      mockExhibitionApi()
      renderAt('/oeuvres/2023')
      await screen.findByRole('link', { name: '2023' })
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    })

    // Task 29, part 2 and 3: an exhibition entry is heading, gallery, credit
    // (the credit reordered in the DATA, not the renderer -- see migrate/
    // extract.js's moveCreditsAfterGallery); rendered stacked, full width,
    // in that exact source order -- never the works-style two-column split
    // (.article-layout), which is what produced the huge vertical gaps the
    // client saw (a couple of short text lines beside a tall gallery).
    it('renders an exhibition entry stacked full width, in heading/gallery/credit order, not the works two-column split', async () => {
      // Task 30, part 5: `heading` is retired -- what used to be a heading
      // block is now a `text` block carrying an <h2>, so the exhibition
      // entry's first two blocks are both `.block-text` now.
      vi.spyOn(api, 'apiGet').mockImplementation((path, params = {}) => {
        if (path === '/articles/2023') {
          return Promise.resolve({
            slug: '2023', title: '2023', category: 'exhibitions',
            blocks: [
              { type: 'text', value: '<h2>Rectos / Versos, Galerie Espace Muraille</h2>' },
              { type: 'gallery', columns: 3, items: [] },
              { type: 'text', value: '<p>© Luca Fascini 2023</p>' },
            ],
          })
        }
        if (path === '/articles') {
          expect(params.category).toBe('exhibitions')
          return Promise.resolve({ items: [{ _id: '1', slug: '2023', title: '2023' }], total: 1 })
        }
        return Promise.reject(Object.assign(new Error('unexpected path'), { status: 404 }))
      })

      const { container } = renderAt('/oeuvres/2023')
      await waitFor(() => expect(screen.getByText('Rectos / Versos, Galerie Espace Muraille')).toBeInTheDocument())

      expect(container.querySelector('.article-layout')).not.toBeInTheDocument()

      const content = container.querySelector('.exhibitions-content')
      expect([...content.children].map((el) => el.className)).toEqual(['block-text', 'block-gallery', 'block-text'])
    })

    // The plain, no-credit shape (10 of the 25 years: just a heading then a
    // gallery) is exactly what splitArticleLayout's text-then-media
    // heuristic mistakes for the works shape (a short text column beside a
    // tall gallery) -- the actual bug the client saw as huge vertical gaps.
    // Exhibitions must never take that path, regardless of how clean a
    // single entry's own heading+gallery pair looks in isolation.
    it('never splits a plain heading+gallery entry into the works two-column layout', async () => {
      vi.spyOn(api, 'apiGet').mockImplementation((path, params = {}) => {
        if (path === '/articles/2021') {
          return Promise.resolve({
            slug: '2021', title: '2021', category: 'exhibitions',
            blocks: [
              { type: 'text', value: '<h2>Musée Untel</h2>' },
              { type: 'gallery', columns: 3, items: [] },
            ],
          })
        }
        if (path === '/articles') {
          expect(params.category).toBe('exhibitions')
          return Promise.resolve({ items: [{ _id: '1', slug: '2021', title: '2021' }], total: 1 })
        }
        return Promise.reject(Object.assign(new Error('unexpected path'), { status: 404 }))
      })

      const { container } = renderAt('/oeuvres/2021')
      await waitFor(() => expect(screen.getByText('Musée Untel')).toBeInTheDocument())

      expect(container.querySelector('.article-layout')).not.toBeInTheDocument()
      expect(container.querySelector('.article-text-col')).not.toBeInTheDocument()
      const content = container.querySelector('.exhibitions-content')
      expect([...content.children].map((el) => el.className)).toEqual(['block-text', 'block-gallery'])
    })

    // A year with more than one entry (e.g. "hghg") renders every entry the
    // same way, one after another down the page -- not split into columns
    // the moment a second heading/gallery pair appears.
    it('stacks multiple entries in the same year one after another, in source order', async () => {
      vi.spyOn(api, 'apiGet').mockImplementation((path, params = {}) => {
        if (path === '/articles/2019') {
          return Promise.resolve({
            slug: '2019', title: '2019', category: 'exhibitions',
            blocks: [
              { type: 'text', value: '<h2>Premier lieu</h2>' },
              { type: 'gallery', columns: 3, items: [] },
              { type: 'text', value: '<h2>Second lieu</h2>' },
              { type: 'gallery', columns: 3, items: [] },
            ],
          })
        }
        if (path === '/articles') {
          expect(params.category).toBe('exhibitions')
          return Promise.resolve({ items: [{ _id: '1', slug: '2019', title: '2019' }], total: 1 })
        }
        return Promise.reject(Object.assign(new Error('unexpected path'), { status: 404 }))
      })

      const { container } = renderAt('/oeuvres/2019')
      await waitFor(() => expect(screen.getByText('Second lieu')).toBeInTheDocument())

      expect(container.querySelector('.article-layout')).not.toBeInTheDocument()
      const content = container.querySelector('.exhibitions-content')
      expect([...content.children].map((el) => el.className)).toEqual([
        'block-text', 'block-gallery', 'block-text', 'block-gallery',
      ])
    })
  })
})
