import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, Outlet } from 'react-router-dom'
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

// Task 33, section 3: the real app reaches ArticleDetail through
// ExhibitionsLayout.jsx, which hands the exhibitions list down via route
// context (<Outlet context={items}/>) -- reproduced here with a minimal
// layout route, rather than a fixed prop, so these tests exercise the same
// wiring the real app uses.
const renderWithExhibitionsContext = (path, items) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LangProvider>
        <Routes>
          <Route element={<Outlet context={items} />}>
            <Route path=":slug" element={<ArticleDetail />} />
          </Route>
        </Routes>
      </LangProvider>
    </MemoryRouter>
  )

describe('ArticleDetail', () => {
  // Task 32, item 1: ArticleDetail no longer owns its own `<main>` --
  // ExhibitionsLayout.jsx (the nested layout route it is always reached
  // through in the real app) owns one persistent `<main>` for every article,
  // work or exhibition alike (see that file, and ExhibitionsLayout.test.jsx
  // for the "never unmounts" guarantee this enables). Rendered standalone
  // here (no layout ancestor, matching how this file already tested it
  // before this task), the loading state is still marked -- just via a
  // plain `[aria-busy]` region rather than a `<main>` this component doesn't
  // render any more.
  it('renders an aria-busy marker and no article while loading', async () => {
    // ArticleDetail fires two apiGet calls (the article itself, and the
    // translatedPath lookup for the language toggle) -- both must resolve
    // before `article` stops being null.
    const resolvers = []
    vi.spyOn(api, 'apiGet').mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)))
    const { container } = renderAt('/oeuvres/porte')

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()

    resolvers.forEach((resolve) => resolve({ slug: 'porte', title: 'Porte', blocks: [] }))
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).not.toBeInTheDocument())
  })

  it('renders the article once loaded, no longer busy', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ slug: 'porte', title: 'Porte', blocks: [] })
    const { container } = renderAt('/oeuvres/porte')
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Porte' })).toBeInTheDocument())
    expect(container.querySelector('[aria-busy="true"]')).not.toBeInTheDocument()
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

  it('renders the not-found message, no busy marker, on a 404', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue(Object.assign(new Error('nope'), { status: 404 }))
    const { container } = renderAt('/oeuvres/inconnu')
    await waitFor(() => expect(screen.getByText(/introuvable/i)).toBeInTheDocument())
    expect(container.querySelector('[aria-busy="true"]')).not.toBeInTheDocument()
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

  // Task 32, item 1: ArticleDetail's OWN responsibility for an exhibition
  // article is now just its content (via ArticleBody) -- the timeline, the
  // rail, and the persistent `<main>`/`.exhibitions-layout` wrapper around
  // it all moved to ExhibitionsLayout.jsx (see ExhibitionsLayout.test.jsx).
  // Rendered standalone here (no layout ancestor), an exhibition article's
  // content is bare: no `.exhibitions-content` wrapper of its own, no
  // `<article>` tag (works articles keep that; see the plain-article shape
  // above) -- exactly what ArticleBody itself produces, landing as direct
  // children of the test's own render container.
  describe('exhibition articles', () => {
    const exhibitionArticle = (slug, title, blocks) =>
      vi.spyOn(api, 'apiGet').mockImplementation((path) => {
        if (path === `/articles/${slug}`) {
          return Promise.resolve({ slug, title, category: 'exhibitions', blocks })
        }
        return Promise.reject(Object.assign(new Error('unexpected path ' + path), { status: 404 }))
      })

    it('renders no year heading for an exhibition article', async () => {
      exhibitionArticle('2023', '2023', [])
      renderAt('/oeuvres/2023')
      await waitFor(() => expect(api.apiGet).toHaveBeenCalledWith('/articles/2023', expect.anything()))
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    })

    it('never fetches the exhibitions timeline itself -- that is ExhibitionsLayout\'s job now', async () => {
      const spy = vi.spyOn(api, 'apiGet').mockResolvedValue({ slug: 'porte', title: 'Porte', blocks: [] })
      renderAt('/oeuvres/porte')
      await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument())
      expect(spy).not.toHaveBeenCalledWith('/articles', expect.anything())
    })

    // Task 29, part 2 and 3: an exhibition entry is heading, gallery, credit
    // (the credit reordered in the DATA, not the renderer -- see migrate/
    // extract.js's moveCreditsAfterGallery); rendered stacked, full width,
    // in that exact source order -- never the works-style two-column split
    // (.article-layout), which is what produced the huge vertical gaps the
    // client saw (a couple of short text lines beside a tall gallery).
    it('renders an exhibition entry stacked full width, in heading/gallery/credit order, not the works two-column split', async () => {
      exhibitionArticle('2023', '2023', [
        { type: 'text', value: '<h2>Rectos / Versos, Galerie Espace Muraille</h2>' },
        { type: 'gallery', columns: 3, items: [] },
        { type: 'text', value: '<p>© Luca Fascini 2023</p>' },
      ])

      const { container } = renderAt('/oeuvres/2023')
      await waitFor(() => expect(screen.getByText('Rectos / Versos, Galerie Espace Muraille')).toBeInTheDocument())

      expect(container.querySelector('.article-layout')).not.toBeInTheDocument()
      expect(container.querySelector('article')).not.toBeInTheDocument()
      expect([...container.children].map((el) => el.className)).toEqual(['block-text', 'block-gallery', 'block-text'])
    })

    // The plain, no-credit shape (10 of the 25 years: just a heading then a
    // gallery) is exactly what splitArticleLayout's text-then-media
    // heuristic mistakes for the works shape (a short text column beside a
    // tall gallery) -- the actual bug the client saw as huge vertical gaps.
    // Exhibitions must never take that path, regardless of how clean a
    // single entry's own heading+gallery pair looks in isolation.
    it('never splits a plain heading+gallery entry into the works two-column layout', async () => {
      exhibitionArticle('2021', '2021', [
        { type: 'text', value: '<h2>Musée Untel</h2>' },
        { type: 'gallery', columns: 3, items: [] },
      ])

      const { container } = renderAt('/oeuvres/2021')
      await waitFor(() => expect(screen.getByText('Musée Untel')).toBeInTheDocument())

      expect(container.querySelector('.article-layout')).not.toBeInTheDocument()
      expect(container.querySelector('.article-text-col')).not.toBeInTheDocument()
      expect([...container.children].map((el) => el.className)).toEqual(['block-text', 'block-gallery'])
    })

    // A year with more than one entry (e.g. "hghg") renders every entry the
    // same way, one after another down the page -- not split into columns
    // the moment a second heading/gallery pair appears.
    it('stacks multiple entries in the same year one after another, in source order', async () => {
      exhibitionArticle('2019', '2019', [
        { type: 'text', value: '<h2>Premier lieu</h2>' },
        { type: 'gallery', columns: 3, items: [] },
        { type: 'text', value: '<h2>Second lieu</h2>' },
        { type: 'gallery', columns: 3, items: [] },
      ])

      const { container } = renderAt('/oeuvres/2019')
      await waitFor(() => expect(screen.getByText('Second lieu')).toBeInTheDocument())

      expect(container.querySelector('.article-layout')).not.toBeInTheDocument()
      expect([...container.children].map((el) => el.className)).toEqual([
        'block-text', 'block-gallery', 'block-text', 'block-gallery',
      ])
    })
  })

  // Task 33, section 3: the 25 legacy exhibition-year URLs (1989..2024) used
  // to be one article's own slug; the split replaced each with N
  // per-exhibition articles, none slugged as the bare year any more, so the
  // direct fetch genuinely 404s for every one of them. A slug shaped like a
  // year is what triggers the fallback -- lists that year's own exhibitions
  // instead of a dead link.
  describe('legacy exhibition-year URLs (Task 33, section 3)', () => {
    const notFound = () => Promise.reject(Object.assign(new Error('nope'), { status: 404 }))

    it('lists that year\'s own exhibitions, linking to each one\'s own slug', async () => {
      vi.spyOn(api, 'apiGet').mockImplementation(notFound)
      const items = [
        { _id: 'a', slug: 'premier-lieu', title: 'Premier lieu', yearStart: 2013 },
        { _id: 'b', slug: 'second-lieu', title: 'Second lieu', yearStart: 2013 },
        { _id: 'c', slug: 'expo-2012', title: 'Expo 2012', yearStart: 2012 },
      ]
      renderWithExhibitionsContext('/2013', items)
      await waitFor(() => expect(screen.getByText('Premier lieu')).toBeInTheDocument())
      expect(screen.getByRole('link', { name: 'Premier lieu' })).toHaveAttribute('href', '/premier-lieu')
      expect(screen.getByRole('link', { name: 'Second lieu' })).toHaveAttribute('href', '/second-lieu')
      expect(screen.queryByText('Expo 2012')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1, name: '2013' })).toBeInTheDocument()
    })

    it('shows a loading marker, not an empty list, while the exhibitions list is still in flight', async () => {
      vi.spyOn(api, 'apiGet').mockImplementation(notFound)
      const { container } = renderWithExhibitionsContext('/2013', undefined)
      await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument())
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    })

    it('renders the ordinary not-found message for a year-shaped slug matching no real year', async () => {
      vi.spyOn(api, 'apiGet').mockImplementation(notFound)
      renderWithExhibitionsContext('/1500', [
        { _id: 'a', slug: 'premier-lieu', title: 'Premier lieu', yearStart: 2013 },
      ])
      await waitFor(() => expect(screen.getByText(/introuvable/i)).toBeInTheDocument())
    })

    it('never shadows a real, different-category article that happens to have a 4-digit slug', async () => {
      // Real content always wins: the direct fetch succeeds, so the
      // legacy-year fallback (which only ever triggers on a confirmed 404)
      // must never even be considered.
      vi.spyOn(api, 'apiGet').mockImplementation((path) =>
        path === '/articles/2013'
          ? Promise.resolve({ slug: '2013', title: 'Titled 2013', category: 'works', blocks: [] })
          : notFound()
      )
      renderWithExhibitionsContext('/2013', [
        { _id: 'a', slug: 'premier-lieu', title: 'Premier lieu', yearStart: 2013 },
      ])
      await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Titled 2013' })).toBeInTheDocument())
      expect(screen.queryByText('Premier lieu')).not.toBeInTheDocument()
    })

    it('sets document.title to the bare year for a legacy year URL', async () => {
      vi.spyOn(api, 'apiGet').mockImplementation(notFound)
      renderWithExhibitionsContext('/2013', [
        { _id: 'a', slug: 'premier-lieu', title: 'Premier lieu', yearStart: 2013 },
      ])
      await waitFor(() => expect(document.title).toBe('2013 | Philippe Gronon'))
    })
  })
})
