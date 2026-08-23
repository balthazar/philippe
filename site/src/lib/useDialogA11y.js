import { useEffect } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'textarea:not([disabled])',
  'input:not([disabled])', 'select:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Shared dialog accessibility behaviour (task 29, client feedback on the
 * unsaved-changes guard). Used by Modal.jsx (the unsaved-changes warning,
 * ConfirmDelete) and Lightbox.jsx -- a whole-branch review flagged
 * Lightbox's `role="dialog" aria-modal="true"` as a claim about behaviour
 * with none of it actually implemented (no focus trap, no focus restore, no
 * click-outside close). This is what makes that claim true everywhere it's
 * made, one implementation instead of a third, differently-behaved copy.
 *
 * While `active`, this:
 *   - moves focus to `initialFocusRef.current` on mount (falling back to the
 *     first focusable element inside `containerRef` when none is given --
 *     callers with a destructive action alongside a safe one, e.g. "Quitter"
 *     next to "Annuler", should always pass the safe one, so a stray Enter
 *     right after opening can never fire the destructive action);
 *   - traps Tab/Shift+Tab so focus can never leave the elements inside
 *     `containerRef` while the dialog is open;
 *   - treats Escape as cancel (`onCancel`), never confirm;
 *   - restores focus to whatever had it before the dialog opened, once it
 *     closes (unmounts, or `active` goes false).
 *
 * Does NOT render anything or own any markup -- callers decide the visuals
 * (backdrop, box, buttons) and only need to forward a ref to the element
 * that should contain the trap.
 */
export function useDialogA11y({ containerRef, onCancel, initialFocusRef, active = true }) {
  useEffect(() => {
    if (!active) return undefined
    const previouslyFocused = document.activeElement

    const focusables = () => [...(containerRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || [])]
    const initial = initialFocusRef?.current || focusables()[0]
    initial?.focus()

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Guarded: the opener may itself have been unmounted (e.g. a nav
      // click that both closes this dialog and navigates away in the same
      // tick) -- restoring focus to a detached node is a silent no-op in
      // every browser, but jsdom throws, so this is checked explicitly.
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
  }, [active, containerRef, onCancel, initialFocusRef])
}
