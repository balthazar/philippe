import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as api from '@/api.js'
import { MediaLibrary } from '../MediaLibrary.jsx'

const IMAGES = [{ _id: 'i1', filename: 'porte.jpg', alt: { fr: 'Porte', en: '' }, variants: {} }]

beforeEach(() => vi.restoreAllMocks())

// Task 25, client feedback item 3: one unconfirmed click here used to also
// destroy the archival original under _originals/, the same gap fixed on
// article delete. Confirms the in-page prompt gates the actual DELETE call.
describe('MediaLibrary delete confirmation', () => {
  it('does not call the DELETE endpoint on the first click', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: IMAGES, total: 1 })
    const send = vi.spyOn(api, 'apiSend')
    render(<MediaLibrary />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    expect(send).not.toHaveBeenCalled()
    expect(screen.getByText('Supprimer « Porte » ?')).toBeInTheDocument()
  })

  it('calls DELETE only after confirming, and removes the image from the grid', async () => {
    vi.spyOn(api, 'apiGet').mockResolvedValue({ items: IMAGES, total: 1 })
    const send = vi.spyOn(api, 'apiSend').mockResolvedValue({ ok: true })
    render(<MediaLibrary />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))

    expect(send).toHaveBeenCalledWith('DELETE', '/admin/images/i1')
    await waitFor(() => expect(screen.queryByText('Porte')).not.toBeInTheDocument())
  })
})
