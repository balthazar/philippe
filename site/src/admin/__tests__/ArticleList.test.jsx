import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import * as api from '@/api.js'
import { ArticleList } from '../ArticleList.jsx'

const ITEMS = [
  { _id: '1', title: { fr: 'Porte', en: '' }, category: 'works', status: 'published', slug: { fr: 'porte' } },
  { _id: '2', title: { fr: 'Fenêtre', en: '' }, category: 'works', status: 'draft', slug: { fr: 'fenetre' } },
  { _id: '3', title: { fr: 'Rétrospective', en: '' }, category: 'exhibitions', status: 'draft', slug: { fr: 'retro' } },
]

beforeEach(() => vi.restoreAllMocks())

function renderList() {
  return render(
    <MemoryRouter>
      <ArticleList />
    </MemoryRouter>
  )
}

describe('ArticleList', () => {
  it('groups articles by category and shows a status badge and link per article', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: ITEMS, total: ITEMS.length })
    renderList()

    await waitFor(() => expect(screen.getByText('Porte')).toBeInTheDocument())

    // Category headings, in the order the works appear.
    expect(screen.getByRole('heading', { name: 'Œuvres' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Expositions' })).toBeInTheDocument()

    // Titles are French (title.fr), each linking to its editor route.
    expect(screen.getByRole('link', { name: 'Porte' })).toHaveAttribute('href', '/admin/articles/1')
    expect(screen.getByRole('link', { name: 'Fenêtre' })).toHaveAttribute('href', '/admin/articles/2')
    expect(screen.getByRole('link', { name: 'Rétrospective' })).toHaveAttribute('href', '/admin/articles/3')

    // Status badges reflect each article's own status.
    expect(screen.getByText('Publié')).toBeInTheDocument()
    expect(screen.getAllByText('Brouillon')).toHaveLength(2)
  })

  it('toggles publish status via a PATCH and updates the badge', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: [ITEMS[0]], total: 1 })
    const send = vi.spyOn(api, 'apiSend').mockResolvedValue({ ...ITEMS[0], status: 'draft' })
    renderList()

    await waitFor(() => expect(screen.getByText('Porte')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /dépublier/i }))

    expect(send).toHaveBeenCalledWith('PATCH', '/admin/articles/1', { status: 'draft' })
    await waitFor(() => expect(screen.getByText('Brouillon')).toBeInTheDocument())
  })

  it('reorders within a category on drag-drop and posts the new order', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: [ITEMS[0], ITEMS[1]], total: 2 })
    const send = vi.spyOn(api, 'apiSend').mockResolvedValue({ ok: true })
    renderList()

    await waitFor(() => expect(screen.getByText('Porte')).toBeInTheDocument())

    const rows = screen.getAllByRole('listitem')
    const dataTransfer = { setData: vi.fn(), getData: vi.fn() }

    // Drag the first row ("Porte") and drop it onto the second ("Fenêtre"):
    // the second row should now lead. fireEvent (not a raw dispatchEvent)
    // so each event's resulting state update is flushed under act() before
    // the next one fires.
    fireEvent.dragStart(rows[0], { dataTransfer })
    fireEvent.dragOver(rows[1], { dataTransfer })
    fireEvent.drop(rows[1], { dataTransfer })

    await waitFor(() =>
      expect(send).toHaveBeenCalledWith('POST', '/admin/articles/reorder', { ids: ['2', '1'] })
    )
  })
})
