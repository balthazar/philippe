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

  // Task 29, client feedback: the confirmation is now the shared Modal --
  // a real, labelled dialog, not an inline group.
  it('shows the confirmation as a labelled dialog', async () => {
    render(<ConfirmDelete label="Porte" onConfirm={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName('Confirmer la suppression')
  })

  it('puts initial focus on Annuler, not Confirmer', async () => {
    render(<ConfirmDelete label="Porte" onConfirm={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus()
  })

  it('cancels on Escape without calling onConfirm', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<ConfirmDelete label="Porte" onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Supprimer' }))
    await user.keyboard('{Escape}')
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
  })

  it('cancels on a backdrop click without calling onConfirm', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<ConfirmDelete label="Porte" onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Supprimer' }))
    // eslint-disable-next-line testing-library/no-node-access -- the backdrop itself has no accessible role
    await user.click(document.querySelector('.modal-backdrop'))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
  })
})
