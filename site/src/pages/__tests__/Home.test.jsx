import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '@/lang.jsx'
import * as api from '@/api.js'
import { Home } from '../Home.jsx'

const renderHome = () =>
  render(<MemoryRouter><LangProvider><Home /></LangProvider></MemoryRouter>)

describe('Home', () => {
  // Task 26, correction to B4: the fetch previously made Home.jsx return
  // null while in flight (`if (!state) return null`), so the first paint
  // was header + footer only, with the footer riding up near the top of the
  // page, then everything jumped once the data landed. `<main>` must be
  // present, and reserve the slideshow's own known height, from the very
  // first render, not just after the fetch resolves.
  it('renders a <main> that reserves the slideshow height immediately, before the fetch resolves', async () => {
    let resolveFetch
    vi.spyOn(api, 'apiGet').mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve })
    )
    const { container } = renderHome()

    expect(container.querySelector('main')).toBeInTheDocument()
    // Reuses .slideshow's own height rule rather than a spinner or a fade:
    // there is nothing rendered yet to animate in, just reserved space.
    expect(container.querySelector('main > .slideshow[aria-hidden="true"]')).toBeInTheDocument()

    resolveFetch({ slides: [] })
    await waitFor(() => expect(api.apiGet).toHaveBeenCalled())
  })

  it('renders the real slideshow once the data has loaded', async () => {
    const slide = {
      image: { variants: { large: { path: 'a.webp', width: 2000, height: 1400 } } },
      article: { slug: 'porte', title: 'Porte' },
      caption: 'Porte',
    }
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) =>
      path === '/home' ? { slides: [slide] } : { key: 'home', blocks: [] }
    )
    renderHome()
    await waitFor(() => expect(screen.getByRole('region', { name: /diaporama/i })).toBeInTheDocument())
  })

  // Coordinator feedback (task 27): the prerender computed the right
  // <title> but nothing set document.title at runtime. Unconditional here
  // (unlike every other route): the home title never depends on fetched
  // data, matching headFor()'s own home special case.
  it('sets document.title to the bare site name, even before the fetch resolves', () => {
    vi.spyOn(api, 'apiGet').mockImplementation(() => new Promise(() => {}))
    renderHome()
    expect(document.title).toBe('Philippe Gronon')
  })
})
