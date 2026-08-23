import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDelete } from '../ConfirmDelete.jsx'

describe('ConfirmDelete', () => {
  it('does not call onConfirm on the first click: it shows an in-page prompt instead', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmDelete label="Porte" onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByText('Supprimer « Porte » ?')).toBeInTheDocument()
  })

  it('calls onConfirm only after the confirmation click', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmDelete label="Porte" onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cancels back to the plain button without calling onConfirm', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmDelete label="Porte" onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
    expect(screen.queryByText('Supprimer « Porte » ?')).not.toBeInTheDocument()
  })
})
