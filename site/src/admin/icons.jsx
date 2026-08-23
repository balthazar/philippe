/**
 * Small inline SVG icons for the admin UI, hand-drawn rather than pulled
 * from an icon library (task 25, section 5): roughly ten icons don't
 * justify a new dependency and its supply chain, keeps the admin bundle
 * small, and matches this project's existing stance of self-hosting assets
 * rather than pulling from a CDN.
 *
 * Every icon sizes via `currentColor` so it inherits the surrounding
 * button's text colour, and is purely decorative -- the accessible name for
 * each icon button comes from that button's own `aria-label`, so every icon
 * here is marked `aria-hidden` and never carries a `<title>` of its own.
 */

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  'aria-hidden': 'true',
  focusable: 'false',
}

export function ArrowUpIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  )
}

export function ArrowDownIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  )
}

export function TrashIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

export function BoldIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7 4h6a3.5 3.5 0 0 1 0 7H7z" />
      <path d="M7 11h7a3.5 3.5 0 0 1 0 7H7z" />
    </svg>
  )
}

export function ItalicIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="12" y1="4" x2="8" y2="20" />
      <line x1="14" y1="4" x2="19" y2="4" />
      <line x1="5" y1="20" x2="10" y2="20" />
    </svg>
  )
}

export function BulletListIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
    </svg>
  )
}

export function OrderedListIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <text x="1" y="9" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text>
      <text x="1" y="15" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text>
      <text x="1" y="21" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text>
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
    </svg>
  )
}

export function BlockquoteIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="6" y1="5" x2="6" y2="19" />
      <line x1="10" y1="7" x2="19" y2="7" />
      <line x1="10" y1="12" x2="19" y2="12" />
      <line x1="10" y1="17" x2="15" y2="17" />
    </svg>
  )
}

// Task 30, part 5: the RichText toolbar button that toggles a heading
// (level 2) on the current block -- a plain "H" glyph, consistent with the
// other icons here being simple line drawings rather than a mark of a
// specific typeface.
export function HeadingIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="5" y1="4" x2="5" y2="18" />
      <line x1="15" y1="4" x2="15" y2="18" />
      <line x1="5" y1="11" x2="15" y2="11" />
    </svg>
  )
}

export function LinkIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 15l6-6" />
      <path d="M11 6l1-1a3.5 3.5 0 0 1 5 5l-1 1" />
      <path d="M13 18l-1 1a3.5 3.5 0 0 1-5-5l1-1" />
    </svg>
  )
}

// Task 27, client feedback item 4: "Nouvel article" is a real button now,
// with this icon beside its own visible text -- so, same rule as every
// other icon here, it stays decorative (aria-hidden) and carries no
// aria-label/title of its own; the button's accessible name comes from its
// text, exactly like every other icon+text control in this admin.
export function PlusIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export function ExternalLinkIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

// Task 27, client feedback item 5: gallery-item controls, replacing the
// text "Retirer" button and the Cover radio / Hidden checkbox. `active`
// (a filled star / a filled eye) is a CSS state on the surrounding button
// (see admin.css), not a second icon shape -- the same convention the
// lang-toggle and rich-text toolbar buttons already use.
export function StarIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" />
    </svg>
  )
}

export function EyeIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

// Cycles a gallery item's column span. The label conveys the current value
// (e.g. "Largeur : 2 colonnes") -- this icon's shape never changes.
export function WidthIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="3" y1="12" x2="21" y2="12" />
      <polyline points="7 8 3 12 7 16" />
      <polyline points="17 8 21 12 17 16" />
    </svg>
  )
}
