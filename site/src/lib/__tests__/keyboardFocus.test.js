import { describe, it, expect } from 'vitest'
import { isKeyboardFocus } from '../keyboardFocus.js'

const el = (matches) => ({ matches })

describe('isKeyboardFocus', () => {
  it('is true when the browser reports :focus-visible', () => {
    expect(isKeyboardFocus(el(() => true))).toBe(true)
  })

  // The mouse-click case: Chrome focuses a clicked button, but does not make
  // it focus-visible. That focus outlives the click, which is what used to
  // latch autoplay off permanently.
  it('is false for a pointer focus', () => {
    expect(isKeyboardFocus(el(() => false))).toBe(false)
  })

  // Better to keep pausing than to silently drop the affordance keyboard
  // users depend on.
  it('defaults to true where :focus-visible cannot be evaluated', () => {
    expect(isKeyboardFocus(el(() => { throw new Error('unsupported pseudo') }))).toBe(true)
    expect(isKeyboardFocus({})).toBe(true)
    expect(isKeyboardFocus(null)).toBe(true)
  })
})
