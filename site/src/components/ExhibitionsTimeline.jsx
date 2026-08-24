import { Link } from 'react-router-dom'
import { useLang } from '@/lang.jsx'
import { groupExhibitionsByYear } from '@/lib/exhibitionsOrder.js'

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
 * current) -- see ExhibitionsLayout.jsx, the shared nested layout route
 * both render through (Task 32, item 1).
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
 *
 * Task 33, section 3: `items` is now the list of EXHIBITIONS (each split
 * out of its year -- see migrate/extract.js's splitExhibitionYear), not one
 * per year, since a year can hold more than one (nine do; 2013 holds five).
 * The timeline still shows years: groupExhibitionsByYear collapses same-year
 * items into a single dot, linking to that year's own FIRST exhibition (in
 * source order) -- multiple exhibitions in one year must never produce
 * duplicate year dots. `currentYear` (not a slug -- there is no longer one
 * single "current" exhibition slug a year-level dot could match) is what
 * marks the current dot; ExhibitionsLayout.jsx computes it.
 */
export function ExhibitionsTimeline({ items, currentYear }) {
  const { href, lang } = useLang()
  const groups = groupExhibitionsByYear(items)

  return (
    <nav
      className="exhibitions-timeline"
      aria-label={lang === 'fr' ? 'Chronologie des expositions' : 'Exhibitions timeline'}
    >
      <ol>
        {groups.map((group, index) => {
          const isCurrent = group.year === currentYear
          const persistent = isPersistentDot(index, groups.length, isCurrent)
          return (
            <li key={group.slug} className={persistent ? 'is-persistent' : undefined}>
              <Link to={href('article', group.slug)} aria-current={isCurrent ? 'true' : undefined}>
                <span className="exhibitions-timeline-dot" aria-hidden="true" />
                <span className="exhibitions-timeline-label">{group.year}</span>
              </Link>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
