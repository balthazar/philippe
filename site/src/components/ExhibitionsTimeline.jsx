import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '@/lang.jsx'

/**
 * Task 28, part 3: a year timeline for the exhibitions section, rendered as
 * persistent chrome by both the /expositions index (most recent year
 * current) and every individual exhibition article page (its own year
 * current) -- see ExhibitionsChrome.jsx, the shared wrapper both use.
 *
 * `items` must already be sorted (lib/exhibitionsOrder.js): this component
 * only renders, it does not decide chronology.
 *
 * Every year is a real, always-clickable `<Link>` at its unmagnified size --
 * the dock-style hover/focus magnification in base.css is pure decoration,
 * layered on top via CSS transforms so it never affects hit target size,
 * layout, or focus order.
 */
export function ExhibitionsTimeline({ items, currentSlug }) {
  const { href, lang } = useLang()
  const currentRef = useRef(null)

  // A 25-item column is taller than most viewports. Rather than making a
  // visitor hunt for the current year, scroll it into view as soon as this
  // list (or which year is current) settles -- guarded because jsdom has no
  // scrollIntoView implementation at all, and some real browsers omit it too.
  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  }, [currentSlug, items])

  return (
    <nav
      className="exhibitions-timeline"
      aria-label={lang === 'fr' ? 'Chronologie des expositions' : 'Exhibitions timeline'}
    >
      <ol>
        {items.map((item) => {
          const isCurrent = item.slug === currentSlug
          return (
            <li key={item._id || item.slug}>
              <Link
                ref={isCurrent ? currentRef : undefined}
                to={href('article', item.slug)}
                aria-current={isCurrent ? 'true' : undefined}
              >
                {item.title}
              </Link>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
