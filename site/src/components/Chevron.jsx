/**
 * Task 38, part 7 (client feedback: "arrows still small" after a font-size
 * bump that should have fixed exactly that).
 *
 * The arrows used to be the literal characters ‹ and › (U+2039/U+203A,
 * single angle quotation marks). A quotation mark is punctuation: the font
 * draws it small and high inside its em box, so at font-size: 22px the
 * visible stroke was a fraction of that, and raising the font-size raised
 * the empty box around it about as much as the mark itself. It also
 * explains the vertical misalignment reported alongside -- the glyph sits
 * on the text baseline, high in its box, while the counter beside it
 * centres on its own line box, so `align-items: center` was correctly
 * centring two boxes whose INK sits at different heights.
 *
 * Drawn geometry has neither problem: the stroke fills the box it is given,
 * and the box is centred on its own ink. `width`/`height` are in `em`, so
 * the button's own font-size still controls the size, as if it were still
 * type -- but now that size is what you actually see.
 *
 * `aria-hidden` + `focusable="false"`: the accessible name lives on the
 * button (aria-label), where it already did. focusable="false" is for IE/
 * legacy Edge, which otherwise put SVGs in the tab order; harmless
 * elsewhere, and cheap next to a tab stop that lands on nothing.
 */
export function Chevron({ direction = 'right' }) {
  return (
    <svg className="chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <polyline points={direction === 'left' ? '15 5 8 12 15 19' : '9 5 16 12 9 19'} />
    </svg>
  )
}
