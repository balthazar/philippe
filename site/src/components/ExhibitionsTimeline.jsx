import { Link } from 'react-router-dom'
import { useLang } from '@/lang.jsx'

/**
 * Task 31, part 1: the client's "every fifth" instruction is read against the
 * dots, not the calendar -- there is one dot per exhibition YEAR (not one per
 * calendar year, so 1989-2024's gaps are never represented), and persistent
 * labels land on every fifth dot counting from the newest (index 0, 5, 10,
 * ...), plus the current year, plus the newest and oldest so the span is
 * always readable with no hover at all. Reading "every fifth" as "years
 * divisible by five" was considered and rejected (task brief, section 1): on
 * the real archive that clusters every label in the top third of the list
 * and leaves the bottom bare, which this rule does not.
 */
function isPersistentDot(index, length, isCurrent) {
  return isCurrent || index % 5 === 0 || index === length - 1
}

/**
 * Task 28, part 3 / task 31: a year timeline for the exhibitions section,
 * rendered as persistent chrome by both the /expositions index (most recent
 * year current) and every individual exhibition article page (its own year
 * current) -- see ExhibitionsChrome.jsx, the shared wrapper both use.
 *
 * `items` must already be sorted (lib/exhibitionsOrder.js): this component
 * only renders, it does not decide chronology.
 *
 * Task 31 replaces the column of 25 year labels with a rail of dots, one per
 * year, every one a real, always-clickable `<Link>` -- no size or state
 * change on hover/focus/current ever affects hit target size, layout, or
 * focus order. A dot carries no text of its own: `.exhibitions-timeline-label`
 * is what gives every link its accessible name (the year), and it stays in
 * the accessibility tree even when visually hidden by opacity in base.css --
 * unlike `display: none` or `visibility: hidden`, `opacity: 0` never removes
 * an element from the accessible-name computation. Persistent items show
 * that label at rest; everything else reveals it on hover, and identically on
 * keyboard focus (base.css's `:focus-visible` rules mirror `:hover` exactly),
 * the way a scrubber reveals a value under the pointer.
 */
export function ExhibitionsTimeline({ items, currentSlug }) {
  const { href, lang } = useLang()

  return (
    <nav
      className="exhibitions-timeline"
      aria-label={lang === 'fr' ? 'Chronologie des expositions' : 'Exhibitions timeline'}
    >
      <ol>
        {items.map((item, index) => {
          const isCurrent = item.slug === currentSlug
          const persistent = isPersistentDot(index, items.length, isCurrent)
          return (
            <li key={item._id || item.slug} className={persistent ? 'is-persistent' : undefined}>
              <Link to={href('article', item.slug)} aria-current={isCurrent ? 'true' : undefined}>
                <span className="exhibitions-timeline-dot" aria-hidden="true" />
                <span className="exhibitions-timeline-label">{item.title}</span>
              </Link>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
