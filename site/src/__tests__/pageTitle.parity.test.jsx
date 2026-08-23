import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '@/lang.jsx'
import * as api from '@/api.js'
import App from '../App.jsx'
import { headFor } from '../../prerender/index.js'

// Coordinator feedback (task 27): the prerender's <title> and the runtime's
// document.title must never be able to disagree -- both are built from the
// same site/src/lib/pageTitle.js helpers (articlePageTitle/staticPageTitle/
// HOME_TITLE). This test proves both halves of that: the title actually
// updates on a real client-side navigation (a Link click, not a remount),
// and the value it lands on textually matches what the prerender's own
// headFor() produces for the equivalent route and content.
describe('document.title matches the prerender for the same route', () => {
  it('updates on client-side navigation from home to biography, matching headFor', async () => {
    const BIOGRAPHY = { key: 'biography', title: 'Biographie', blocks: [{ type: 'text', value: '<p>Né en 1964</p>' }] }
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/home') return { slides: [] }
      if (path === '/pages/home') return { key: 'home', title: '', blocks: [] }
      if (path === '/pages/biography') return BIOGRAPHY
      return { items: [], total: 0 }
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <LangProvider><App /></LangProvider>
      </MemoryRouter>
    )
    await waitFor(() => expect(document.title).toBe('Philippe Gronon'))

    await userEvent.click(screen.getByRole('link', { name: 'Biographie' }))
    await waitFor(() => expect(screen.getByText('Né en 1964')).toBeInTheDocument())
    expect(document.title).toBe('Biographie | Philippe Gronon')

    // Parity: the same route and equivalent content, fed to the
    // prerender's own headFor(), must produce the identical title text.
    const head = headFor('/biographie', { articles: [], pages: { biography: { title: { fr: 'Biographie', en: '' } } } })
    expect(head).toContain(`<title>${document.title}</title>`)
  })
})
