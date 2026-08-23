import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '@/lang.jsx'
import * as api from '@/api.js'
import { SimplePage } from '../SimplePage.jsx'

describe('SimplePage', () => {
  // Task 26, correction to B4: SimplePage previously returned null while
  // loading, so the first paint was header + footer only, with the footer
  // riding up near the top -- the client hit this on /contact specifically.
  it('reserves space and renders no content while loading', async () => {
    let resolvePage
    vi.spyOn(api, 'apiGet').mockImplementation(() => new Promise((resolve) => { resolvePage = resolve }))
    const { container } = render(
      <MemoryRouter><LangProvider><SimplePage pageKey="contact" /></LangProvider></MemoryRouter>
    )

    const main = container.querySelector('main')
    expect(main).toBeInTheDocument()
    expect(main).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()

    resolvePage({ key: 'contact', title: 'Contact', blocks: [] })
    await waitFor(() => expect(container.querySelector('main')).not.toHaveAttribute('aria-busy'))
  })

  it('renders the title and blocks once loaded, no longer busy', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      key: 'biography', title: 'Biographie', blocks: [{ type: 'text', value: '<p>Né en 1964</p>' }],
    })
    const { container } = render(
      <MemoryRouter><LangProvider><SimplePage pageKey="biography" /></LangProvider></MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText('Né en 1964')).toBeInTheDocument())
    expect(container.querySelector('main')).not.toHaveAttribute('aria-busy')
  })

  // Coordinator feedback (task 27): the page's own title, suffixed with the
  // site name -- the same format headFor() uses for a static page.
  it('sets document.title from the page title once loaded', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ key: 'biography', title: 'Biographie', blocks: [] })
    render(<MemoryRouter><LangProvider><SimplePage pageKey="biography" /></LangProvider></MemoryRouter>)
    await waitFor(() => expect(document.title).toBe('Biographie | Philippe Gronon'))
  })

  // Task 26, part B3: /contact is reduced, through the migration, to a
  // single block (the mailto). Centred generically, keyed to block count,
  // not to pageKey === 'contact' -- so any simple page reduced to one
  // block gets the same treatment, and a normal multi-block page does not.
  it('centres a page reduced to a single block', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      key: 'contact', title: 'Contact',
      blocks: [{ type: 'text', value: '<p><a href="mailto:info@philippegronon.com">info@philippegronon.com</a></p>' }],
    })
    const { container } = render(
      <MemoryRouter><LangProvider><SimplePage pageKey="contact" /></LangProvider></MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText('info@philippegronon.com')).toBeInTheDocument())
    expect(container.querySelector('main')).toHaveClass('page-main-centered')
  })

  // D2: the header already marks Contact as the current section, so the
  // page-level heading is redundant -- only the email.
  it('drops the page title on the Contact page', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      key: 'contact', title: 'Contact',
      blocks: [{ type: 'text', value: '<p><a href="mailto:info@philippegronon.com">info@philippegronon.com</a></p>' }],
    })
    render(
      <MemoryRouter><LangProvider><SimplePage pageKey="contact" /></LangProvider></MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText('info@philippegronon.com')).toBeInTheDocument())
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('keeps the page title on every other simple page', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      key: 'biography', title: 'Biographie', blocks: [{ type: 'text', value: '<p>Né en 1964</p>' }],
    })
    render(
      <MemoryRouter><LangProvider><SimplePage pageKey="biography" /></LangProvider></MemoryRouter>
    )
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Biographie' })).toBeInTheDocument())
  })

  it('does not centre a normal, multi-block page', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      key: 'biography', title: 'Biographie',
      blocks: [
        { type: 'text', value: '<p>Un</p>' },
        { type: 'text', value: '<p>Deux</p>' },
      ],
    })
    const { container } = render(
      <MemoryRouter><LangProvider><SimplePage pageKey="biography" /></LangProvider></MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText('Un')).toBeInTheDocument())
    expect(container.querySelector('main')).not.toHaveClass('page-main-centered')
  })
})
