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

  // Client feedback: no simple page prints its own title any more. D2 had
  // already dropped it on Contact, reasoning that the header's active nav
  // link says where you are; the client extended that to bio and
  // bibliography (which have the same nav marker) and then to links and
  // legal, which do not -- their own call, made knowing that. The title is
  // still fetched and still drives the tab title through usePageTitle; it
  // just never renders in the page.
  it.each([
    ['biography', 'Biographie'],
    ['bibliography', 'Bibliographie'],
    ['contact', 'Contact'],
    ['links', 'Liens'],
    ['legal', 'Mentions légales'],
  ])('drops the page title on the %s page', async (pageKey, title) => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({
      key: pageKey, title, blocks: [{ type: 'text', value: '<p>Contenu</p>' }],
    })
    render(
      <MemoryRouter><LangProvider><SimplePage pageKey={pageKey} /></LangProvider></MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText('Contenu')).toBeInTheDocument())
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.queryByText(title)).not.toBeInTheDocument()
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

  // Task 33: the retired footer's contents (bibliography/links/legal, and
  // the copyright line) move to /contact, which becomes the site's
  // colophon -- the address (already there via BlockRenderer), then what
  // remains of those links, then the copyright, set beneath. Only /contact
  // grows this; every other simple page is unaffected.
  describe('contact page colophon (Task 33)', () => {
    beforeEach(() => {
      vi.spyOn(api, 'apiGet').mockResolvedValue({
        key: 'contact', title: 'Contact',
        blocks: [{ type: 'text', value: '<p><a href="mailto:info@philippegronon.com">info@philippegronon.com</a></p>' }],
      })
    })

    it('renders the former-footer links on /contact', async () => {
      render(<MemoryRouter><LangProvider><SimplePage pageKey="contact" /></LangProvider></MemoryRouter>)
      await waitFor(() => expect(screen.getByText('info@philippegronon.com')).toBeInTheDocument())
      expect(screen.getByRole('link', { name: 'Mentions légales' })).toHaveAttribute('href', '/mentions-legales')
    })

    // Client feedback: the links page's content was folded into the
    // bibliography page as its own "Liens" subsection, so this entry
    // pointed at a second, duplicate copy of it. The /liens route itself is
    // deliberately left working (the move was a one-off script against the
    // production database; keeping the source reachable is what makes it
    // reversible without a restore) -- it is simply no longer linked.
    it('no longer links Liens from /contact', async () => {
      render(<MemoryRouter><LangProvider><SimplePage pageKey="contact" /></LangProvider></MemoryRouter>)
      await waitFor(() => expect(screen.getByText('info@philippegronon.com')).toBeInTheDocument())
      expect(screen.queryByRole('link', { name: 'Liens' })).not.toBeInTheDocument()
    })

    // Client feedback: Bibliographie moved out of the colophon and into the
    // header's Bio/Bibliographie nav slot (see Header.jsx). It is reachable
    // from every page now, so repeating it here would be a second route to
    // the same page from the one page that already links everything else.
    it('no longer links Bibliographie from /contact', async () => {
      render(<MemoryRouter><LangProvider><SimplePage pageKey="contact" /></LangProvider></MemoryRouter>)
      await waitFor(() => expect(screen.getByText('info@philippegronon.com')).toBeInTheDocument())
      expect(screen.queryByRole('link', { name: 'Bibliographie' })).not.toBeInTheDocument()
    })

    it('renders the copyright line beneath the links on /contact', async () => {
      render(<MemoryRouter><LangProvider><SimplePage pageKey="contact" /></LangProvider></MemoryRouter>)
      await waitFor(() => expect(screen.getByText('© Philippe Gronon')).toBeInTheDocument())
    })

    it('localizes the colophon links in English', async () => {
      render(
        <MemoryRouter initialEntries={['/en/contact']}>
          <LangProvider><SimplePage pageKey="contact" /></LangProvider>
        </MemoryRouter>
      )
      await waitFor(() => expect(screen.getByText('info@philippegronon.com')).toBeInTheDocument())
      expect(screen.queryByRole('link', { name: 'Bibliography' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Links' })).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Terms and Conditions' })).toHaveAttribute('href', '/en/terms')
    })

    it('does not render the colophon links on another simple page', async () => {
      vi.spyOn(api, 'apiGet').mockResolvedValue({
        key: 'biography', title: 'Biographie', blocks: [{ type: 'text', value: '<p>Né en 1964</p>' }],
      })
      render(<MemoryRouter><LangProvider><SimplePage pageKey="biography" /></LangProvider></MemoryRouter>)
      await waitFor(() => expect(screen.getByText('Né en 1964')).toBeInTheDocument())
      expect(screen.queryByRole('link', { name: 'Bibliographie' })).not.toBeInTheDocument()
      expect(screen.queryByText('© Philippe Gronon')).not.toBeInTheDocument()
    })
  })
})
