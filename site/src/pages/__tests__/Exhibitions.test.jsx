import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '@/lang.jsx'
import * as api from '@/api.js'
import { Exhibitions } from '../Exhibitions.jsx'

// Task 28, part 3: real archive shape -- exhibitions are titled by year and
// the list API's own order (position) is a curated display order, NOT
// chronological (see lib/exhibitionsOrder.js). Deliberately out of year
// order here to prove the page sorts rather than trusting list order.
const listItems = [
  { _id: '1', slug: '2023', category: 'exhibitions', title: '2023' },
  { _id: '2', slug: '1989', category: 'exhibitions', title: '1989' },
  { _id: '3', slug: '2024', category: 'exhibitions', title: '2024' },
]

const fullArticle = (slug, title) => ({
  _id: slug, slug, title, category: 'exhibitions', blocks: [{ type: 'text', value: `<p>${title} content</p>` }],
})

beforeEach(() => {
  vi.spyOn(api, 'apiGet').mockImplementation(async (path, params = {}) => {
    if (path === '/pages/exhibitions') return { key: 'exhibitions', title: 'Expositions', blocks: [] }
    if (path === '/articles') {
      expect(params.category).toBe('exhibitions')
      return { items: listItems, total: listItems.length }
    }
    if (path === '/articles/2024') return fullArticle('2024', '2024')
    throw Object.assign(new Error('unexpected path ' + path), { status: 404 })
  })
})

const renderPage = () => render(<MemoryRouter><LangProvider><Exhibitions /></LangProvider></MemoryRouter>)

// Task 32, item 1: the timeline rail and the persistent `<main>` around it
// moved to ExhibitionsLayout.jsx (a nested layout route -- see App.jsx and
// ExhibitionsLayout.test.jsx), so this component -- reached through that
// layout's `<Outlet/>` in the real app -- is tested here for only what it
// still owns: the section's own intro copy and the current (most recent)
// year's own content. It intentionally renders no `<main>`, no timeline, no
// `.exhibitions-layout` wrapper of its own any more.
describe('Exhibitions page', () => {
  it('renders the current (most recent) year\'s own content', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('2024 content')).toBeInTheDocument())
  })

  it('fetches the exhibitions list sorted most recent first to pick the current year', async () => {
    renderPage()
    // '2024' is the most recent of the three listItems above (2023, 1989,
    // 2024) once sorted -- proven by which single article gets fetched and
    // rendered, since the mock only resolves /articles/2024.
    await waitFor(() => expect(screen.getByText('2024 content')).toBeInTheDocument())
  })

  it('renders no duplicate year heading for the current year\'s content', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('2024 content')).toBeInTheDocument())
    expect(screen.queryByRole('heading', { level: 1, name: '2024' })).not.toBeInTheDocument()
  })

  // Coordinator feedback (task 27): same reasoning as Works.jsx.
  it('sets document.title from the /pages/exhibitions title', async () => {
    renderPage()
    await waitFor(() => expect(document.title).toBe('Expositions | Philippe Gronon'))
  })

  it('renders its intro copy when the exhibitions page has blocks', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path, params = {}) => {
      if (path === '/pages/exhibitions') {
        return { key: 'exhibitions', title: 'Expositions', blocks: [{ type: 'text', value: '<p>Intro copy</p>' }] }
      }
      if (path === '/articles') {
        expect(params.category).toBe('exhibitions')
        return { items: listItems, total: listItems.length }
      }
      if (path === '/articles/2024') return fullArticle('2024', '2024')
      throw Object.assign(new Error('unexpected path ' + path), { status: 404 })
    })
    const { container } = renderPage()
    await waitFor(() => expect(screen.getByText('Intro copy')).toBeInTheDocument())
    expect(container.querySelector('.page-intro')).toBeInTheDocument()
  })

  it('renders nothing while still loading, rather than a flash of partial content', () => {
    let resolveItems
    vi.spyOn(api, 'apiGet').mockImplementation((path) => {
      if (path === '/articles') return new Promise((resolve) => { resolveItems = resolve })
      return Promise.resolve({ key: 'exhibitions', title: 'Expositions', blocks: [] })
    })
    const { container } = renderPage()
    expect(container).toBeEmptyDOMElement()
    // Silence the unused-variable warning for the (deliberately unresolved)
    // promise capture above -- the test only needs to prove the pre-load
    // render is empty, not resolve it.
    void resolveItems
  })

  it('renders the real (empty) content when the category is genuinely empty, not a loading flash', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/pages/exhibitions') return { key: 'exhibitions', title: 'Expositions', blocks: [] }
      if (path === '/articles') return { items: [], total: 0 }
      throw Object.assign(new Error('unexpected path'), { status: 404 })
    })
    const { container } = renderPage()
    await waitFor(() => expect(document.title).toBe('Expositions | Philippe Gronon'))
    expect(container).toBeEmptyDOMElement()
  })
})
