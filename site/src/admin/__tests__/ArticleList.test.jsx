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
  // Task 27, client feedback item 4: a real button, not a bare text link.
  it('shows "Nouvel article" as a styled button, with the icon staying decorative', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: [], total: 0 })
    renderList()
    await waitFor(() => expect(screen.getByRole('link', { name: 'Nouvel article' })).toBeInTheDocument())
    const link = screen.getByRole('link', { name: 'Nouvel article' })
    expect(link).toHaveAttribute('href', '/admin/articles/new')
    expect(link).toHaveClass('button')
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

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

  // Task 27, Part B4: badge, publish toggle and delete read as one designed
  // group in each row, not three unrelated elements.
  it('groups the badge, publish toggle and delete control together in each row', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: [ITEMS[0]], total: 1 })
    renderList()
    await waitFor(() => expect(screen.getByText('Porte')).toBeInTheDocument())

    const group = document.querySelector('.admin-row-actions')
    expect(group).toBeInTheDocument()
    expect(group.querySelector('.status-badge')).toBeInTheDocument()
    expect(group).toHaveTextContent('Publié')
    expect(group.querySelector('button')).toBeInTheDocument()
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

  // Task 25, client feedback item 3: DELETE existed on the API with no UI
  // calling it. Confirms the row's delete is gated behind ConfirmDelete's
  // in-page prompt and removes the row only once confirmed.
  it('deletes an article from its row only after confirming', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: [ITEMS[0]], total: 1 })
    const send = vi.spyOn(api, 'apiSend').mockResolvedValue({ ok: true })
    renderList()

    await waitFor(() => expect(screen.getByText('Porte')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(send).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    expect(send).toHaveBeenCalledWith('DELETE', '/admin/articles/1')
    await waitFor(() => expect(screen.queryByText('Porte')).not.toBeInTheDocument())
  })

  // A banner from one failed action used to stay on screen through every
  // later success, telling the artist something was broken long after it
  // had stopped being.
  it('clears a previous error banner once a later action succeeds', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: [ITEMS[0]], total: 1 })
    vi.spyOn(api, 'apiSend')
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }))
      .mockResolvedValueOnce({ ...ITEMS[0], status: 'draft' })
    renderList()

    await waitFor(() => expect(screen.getByText('Porte')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /dépublier/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /dépublier/i }))
    await waitFor(() => expect(screen.getByText('Brouillon')).toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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

  // Task 25, client feedback item 1: dragging gave no sign of where a row
  // would land. The dragged row gets a "lifted" state and the hovered row
  // gets an edge indicator, so the resulting order is visible mid-drag, not
  // just after dropping.
  it('shows a lifted state on the dragged row and a drop-indicator on the hovered row', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: [ITEMS[0], ITEMS[1]], total: 2 })
    renderList()
    await waitFor(() => expect(screen.getByText('Porte')).toBeInTheDocument())

    const rows = screen.getAllByRole('listitem')
    const dataTransfer = { setData: vi.fn(), getData: vi.fn() }

    fireEvent.dragStart(rows[0], { dataTransfer })
    expect(rows[0]).toHaveClass('is-dragging')

    // Dragging the first row down onto the second: it will land after the
    // second (reorderCategory's splice-out/splice-in), so the indicator
    // shows on the second row's trailing edge.
    fireEvent.dragOver(rows[1], { dataTransfer })
    expect(rows[1]).toHaveClass('drop-indicator-after')

    fireEvent.dragEnd(rows[0], { dataTransfer })
    expect(rows[0]).not.toHaveClass('is-dragging')
    expect(rows[1]).not.toHaveClass('drop-indicator-after')
  })

  it('shows an error and stops loading when the initial fetch fails for a non-401 reason', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue(Object.assign(new Error('down'), { status: 500 }))
    renderList()

    // loading must never be left true on a failed request: this is the
    // "hangs on a blank page" bug, so assert the visible error rather than
    // just the absence of a spinner.
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/impossible de charger/i))
  })

  it('shows an error and leaves the badge unchanged when the publish toggle fails', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: [ITEMS[0]], total: 1 })
    vi.spyOn(api, 'apiSend').mockRejectedValue(Object.assign(new Error('down'), { status: 500 }))
    renderList()

    await waitFor(() => expect(screen.getByText('Porte')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /dépublier/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    // Still "Publié": a failed PATCH must not silently leave the button
    // looking like nothing happened, but it also must not flip the badge
    // to a state the server never confirmed.
    expect(screen.getByText('Publié')).toBeInTheDocument()
  })

  it('reverts the optimistic reorder and shows an error when the reorder POST fails', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: [ITEMS[0], ITEMS[1]], total: 2 })
    const send = vi.spyOn(api, 'apiSend').mockRejectedValue(Object.assign(new Error('down'), { status: 500 }))
    renderList()

    await waitFor(() => expect(screen.getByText('Porte')).toBeInTheDocument())

    const rows = screen.getAllByRole('listitem')
    const dataTransfer = { setData: vi.fn(), getData: vi.fn() }
    fireEvent.dragStart(rows[0], { dataTransfer })
    fireEvent.dragOver(rows[1], { dataTransfer })
    fireEvent.drop(rows[1], { dataTransfer })

    await waitFor(() => expect(send).toHaveBeenCalledWith('POST', '/admin/articles/reorder', { ids: ['2', '1'] }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    // Reverted: "Porte" (article 1) leads again, matching what the server
    // actually has, instead of staying on the optimistic order that never
    // made it to the server.
    const revertedRows = screen.getAllByRole('listitem')
    expect(revertedRows[0]).toHaveTextContent('Porte')
    expect(revertedRows[1]).toHaveTextContent('Fenêtre')
  })
})
