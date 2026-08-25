/**
 * Whether a focus landed on an element by keyboard rather than by pointer.
 *
 * Both carousels pause autoplay while a control has focus, so a keyboard user
 * tabbing to an arrow is not fighting a slideshow that moves under them. A
 * mouse click focuses the button too (in Chrome; Safari and Firefox on macOS
 * do not), and that focus persists after the click -- so clicking an arrow
 * once paused autoplay permanently, on both the homepage and the gallery
 * slider. Measured: 13s after focusing an arrow, neither had advanced.
 *
 * `:focus-visible` is precisely this distinction, and the browser already
 * computes it. Defaults to true where it cannot be evaluated (jsdom's
 * matches() throws on it), keeping the pause rather than silently dropping
 * the affordance it exists for.
 */
export function isKeyboardFocus(element) {
  if (!element?.matches) return true
  try {
    return element.matches(':focus-visible')
  } catch {
    return true
  }
}
