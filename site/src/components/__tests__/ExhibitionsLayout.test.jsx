import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { LangProvider } from '@/lang.jsx'
import * as api from '@/api.js'
import { ExhibitionsLayout } from '../ExhibitionsLayout.jsx'
import { Exhibitions } from '@/pages/Exhibitions.jsx'
import { ArticleDetail } from '@/pages/ArticleDetail.jsx'

// Mirrors exactly how App.jsx wires this layout: `isExhibitionsArticle` is
// lifted state, threaded down to ExhibitionsLayout as a prop and to
// ArticleDetail as the setter it reports through -- the same round trip
// that caused the remount/infinite-loop regression this task fixed (see
// ExhibitionsLayout.jsx's own comment). Reproducing the real wiring here,
// rather than a fixed prop, is what lets these tests catch a regression of
// that exact shape.
function TestSection({ initialPath }) {
  const [isExhibitionsArticle, setIsExhibitionsArticle] = useState(false)
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <LangProvider>
        <Routes>
          <Route element={<ExhibitionsLayout isExhibitionsArticle={isExhibitionsArticle} />}>
            <Route path="expositions" element={<Exhibitions />} />
            <Route path=":slug" element={<ArticleDetail onExhibitionsLayout={setIsExhibitionsArticle} />} />
          </Route>
        </Routes>
      </LangProvider>
    </MemoryRouter>
  )
}

// Task 33, section 3: post-split shape -- slug/title are the exhibition's
// own (here, coincidentally still year-named for brevity), yearStart is
// what the timeline groups/sorts on now.
const exhibitionsList = [
  { _id: '1', slug: '2024', title: '2024', yearStart: 2024 },
  { _id: '2', slug: '2023', title: '2023', yearStart: 2023 },
  { _id: '3', slug: '1989', title: '1989', yearStart: 1989 },
]

const article = (slug, title) => ({
  slug, title, category: 'exhibitions', blocks: [{ type: 'text', value: `<p>${title} content</p>` }],
})

beforeEach(() => {
  vi.spyOn(api, 'apiGet').mockImplementation(async (path, params = {}) => {
    if (path === '/pages/exhibitions') return { key: 'exhibitions', title: 'Expositions', blocks: [] }
    if (path === '/articles') {
      expect(params.category).toBe('exhibitions')
      return { items: exhibitionsList, total: exhibitionsList.length }
    }
    if (path === '/articles/2024') return article('2024', '2024')
    if (path === '/articles/2023') return article('2023', '2023')
    if (path === '/articles/porte') return { slug: 'porte', title: 'Porte', category: 'works', blocks: [] }
    throw Object.assign(new Error('unexpected path ' + path), { status: 404 })
  })
})

describe('ExhibitionsLayout', () => {
  it('renders the rail on the /expositions index, current year marked', async () => {
    render(<TestSection initialPath="/expositions" />)
    await waitFor(() => expect(screen.getByRole('link', { name: '2024' })).toHaveAttribute('aria-current', 'true'))
    expect(screen.getByRole('link', { name: '2023' })).not.toHaveAttribute('aria-current')
  })

  it('renders the rail on an individual exhibition article page, its own year marked current', async () => {
    render(<TestSection initialPath="/2023" />)
    await waitFor(() => expect(screen.getByRole('link', { name: '2023' })).toHaveAttribute('aria-current', 'true'))
    expect(screen.getByRole('link', { name: '2024' })).not.toHaveAttribute('aria-current')
    // The current dot comes from the URL param directly (useParams(), read
    // by the layout itself), not from ArticleDetail's own fetch resolving
    // -- see the file comment -- so it is correct immediately, before
    // '2023 content' below even appears.
    await waitFor(() => expect(screen.getByText('2023 content')).toBeInTheDocument())
  })

  it('renders a bare outlet and no rail for a work article, fetching no exhibitions list', async () => {
    const { container } = render(<TestSection initialPath="/porte" />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Porte' })).toBeInTheDocument())
    expect(container.querySelector('.exhibitions-timeline')).not.toBeInTheDocument()
    expect(container.querySelector('.exhibitions-layout')).not.toBeInTheDocument()
    expect(api.apiGet).not.toHaveBeenCalledWith('/articles', expect.anything())
  })

  // The actual bug this task fixed: ExhibitionsLayout used to render
  // `<Outlet/>` at a different tree depth depending on whether the rail was
  // showing, which unmounted/remounted ArticleDetail on every toggle of
  // `isExhibitionsArticle` -- and ArticleDetail's own unmount cleanup reset
  // that same flag, closing an infinite loop (unbounded `/articles/:slug`
  // requests, page never finishes loading). Landing directly on an
  // exhibition article's URL is exactly the sequence that toggles the flag
  // once (false while loading, true once the fetch resolves), so it is the
  // right case to guard: the request count must settle, not keep climbing.
  it('does not loop when isExhibitionsArticle flips from false to true on first load', async () => {
    render(<TestSection initialPath="/2023" />)
    await waitFor(() => expect(screen.getByText('2023 content')).toBeInTheDocument())
    // The timeline's item list is a SEPARATE fetch from the article's own
    // (see ExhibitionsLayout.jsx), and it can still be in flight when the
    // article's text lands. Snapshotting the call count here rather than
    // there made this test flaky under full-suite load: that legitimate
    // second request would arrive inside the window below and be counted as
    // a runaway loop. Waiting for the rail to render is what says both
    // fetches have settled, the same way the next test does it.
    await waitFor(() => expect(screen.getByRole('link', { name: '2024' })).toBeInTheDocument())
    const callsAfterSettling = api.apiGet.mock.calls.length
    // Give any runaway effect loop a further tick to reveal itself.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(api.apiGet.mock.calls.length).toBe(callsAfterSettling)
  })

  it('keeps the same timeline DOM node across navigation between two exhibition years (no remount)', async () => {
    const { container } = render(<TestSection initialPath="/2023" />)
    await waitFor(() => expect(screen.getByText('2023 content')).toBeInTheDocument())
    // The timeline's own item list is a separate fetch from the article
    // itself (see ExhibitionsLayout.jsx) -- wait for it to actually land
    // before trying to click one of its links.
    await waitFor(() => expect(screen.getByRole('link', { name: '2024' })).toBeInTheDocument())

    const timelineBefore = container.querySelector('.exhibitions-timeline')
    expect(timelineBefore).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: '2024' }))
    await waitFor(() => expect(screen.getByText('2024 content')).toBeInTheDocument())

    const timelineAfter = container.querySelector('.exhibitions-timeline')
    expect(timelineAfter).toBe(timelineBefore)
  })
})
