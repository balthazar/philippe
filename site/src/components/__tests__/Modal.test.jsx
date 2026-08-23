import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '../Modal.jsx'

// Task 29, client feedback: the shared modal primitive behind both the
// admin nav's unsaved-changes warning and ConfirmDelete. Tested directly
// here (rather than only through its callers) since it's the one place all
// of this behaviour is implemented.
function renderModal({ onCancel = vi.fn(), initialFocusRef } = {}) {
  const utils = render(
    <>
      <button type="button">Opener</button>
      <Modal titleId="t" onCancel={onCancel} initialFocusRef={initialFocusRef}>
        <h2 id="t">Titre</h2>
        <button type="button" ref={initialFocusRef}>Annuler</button>
        <button type="button">Confirmer</button>
      </Modal>
    </>
  )
  return { ...utils, onCancel }
}

describe('Modal', () => {
  it('renders as a labelled dialog', () => {
    renderModal()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Titre')
  })

  it('puts initial focus on the element passed as initialFocusRef, not the first tabbable child by default', () => {
    const initialFocusRef = { current: null }
    renderModal({ initialFocusRef })
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus()
  })

  it('calls onCancel, not confirm, on Escape', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    renderModal({ onCancel })
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel on a backdrop click', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    renderModal({ onCancel })
    // eslint-disable-next-line testing-library/no-node-access -- the backdrop itself has no accessible role
    await user.click(document.querySelector('.modal-backdrop'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not call onCancel when clicking inside the dialog', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    renderModal({ onCancel })
    await user.click(screen.getByRole('heading', { name: 'Titre' }))
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('traps Tab focus inside the dialog, cycling past the last item back to the first', async () => {
    const initialFocusRef = { current: null }
    const user = userEvent.setup()
    renderModal({ initialFocusRef })
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Confirmer' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus()
  })

  it('traps Shift+Tab backwards too, from the first item to the last', async () => {
    const initialFocusRef = { current: null }
    const user = userEvent.setup()
    renderModal({ initialFocusRef })
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Confirmer' })).toHaveFocus()
  })

  it('restores focus to whatever opened it once it unmounts', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    expect(opener).toHaveFocus()

    const onCancel = vi.fn()
    const { unmount } = render(
      <Modal titleId="t" onCancel={onCancel}>
        <h2 id="t">Titre</h2>
        <button type="button">Dans la boîte</button>
      </Modal>
    )
    // The dialog took focus on mount -- otherwise "restored on unmount"
    // would be true trivially, because focus never left the opener.
    expect(screen.getByRole('button', { name: 'Dans la boîte' })).toHaveFocus()

    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })
})
