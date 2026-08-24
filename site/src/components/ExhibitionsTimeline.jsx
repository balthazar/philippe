import { Link } from 'react-router-dom'
import { useLang } from '@/lang.jsx'
import { groupExhibitionsByYear } from '@/lib/exhibitionsOrder.js'

/**
 * Task 31, part 1 / task 35, Part B: the client's "every fifth" instruction
 * is read against the dots, not the calendar -- there is one dot per
 * exhibition (not one per calendar year, so 1989-2024's gaps are never
 * represented), and persistent labels land on every fifth dot counting from
 * the newest (index 0, 5, 10, ...), plus the current year, plus the newest
 * and oldest so the span is always readable with no hover at all.
 *
 * Re-checked against the move from 25 dots (one per year) to 39 (one per
 * exhibition): "every fifth" now counts across the flat EXHIBITION sequence
 * -- the thing that grew -- not across the ~25 year groups, which barely
 * changed in number. A year's label is persistent whenever ANY of its own
 * dots lands on the rule, so a multi-exhibition year (nine do; 2013 holds
 * five) never shows its label more than once just because it happened to
 * absorb an every-fifth hit. On the real archive this drifts the exact
 * label set by roughly one position either way versus the old 25-based
 * rule (see the task report for which years, concretely) -- still evenly
 * spread, no clustering or bare stretches worth a different rule.
 */
function isPersistentIndex(index, length, isCurrent) {
  return isCurrent || index % 5 === 0 || index === length - 1
}

/**
 * Task 28, part 3 / task 31 / task 35, Part B: a year timeline for the
 * exhibitions section, rendered as persistent chrome by both the
 * /expositions index (most recent year current) and every individual
 * exhibition article page (its own year current) -- see
 * ExhibitionsLayout.jsx, the shared nested layout route both render
 * through (Task 32, item 1).
 *
 * `items` must already be sorted (lib/exhibitionsOrder.js): this component
 * only renders, it does not decide chronology.
 *
 * Task 35, Part B: the migration that split each year article into one per
 * exhibition (39 across 25 years; nine years hold more than one, 2013 holds
 * five) left the previous one-dot-per-year rail linking only to a year's
 * FIRST exhibition -- the other 14 were unreachable from the rail at all,
 * even though every one of them has its own real URL. This version renders
 * one dot -- its own `<Link>`, its own accessible name -- per EXHIBITION,
 * all of them. The YEAR label stays shown once per year (grouped inside a
 * shared `<li>`, `groupExhibitionsByYear`), not once per dot: it is
 * `aria-hidden` (each dot's own accessible name already carries the year,
 * see below) and revealed on hover/focus of ANY dot in its group via
 * `:focus-within`/`:hover` on that shared `<li>` in base.css, the same way
 * a single dot used to reveal its own label.
 *
 * `aria-current` marks the current EXHIBITION's own link (`currentSlug`),
 * never a whole year -- a year is not "the" current exhibition once it can
 * hold several. A single-exhibition year's link is named just its year
 * ("2024"); a multi-exhibition year's links are each named the year PLUS
 * its own title ("2019 – Premier lieu"), since 39 links that can read
 * "2013" five times over would be useless to a screen reader.
 */
export function ExhibitionsTimeline({ items, currentSlug, currentYear }) {
  const { href, lang } = useLang()
  const groups = groupExhibitionsByYear(items)
  const total = items?.length || 0

  let flatIndex = -1

  return (
    <nav
      className="exhibitions-timeline"
      aria-label={lang === 'fr' ? 'Chronologie des expositions' : 'Exhibitions timeline'}
    >
      <ol>
        {groups.map((group) => {
          const isCurrentGroup = group.year === currentYear
          const multi = group.items.length > 1
          const dots = group.items.map((item) => {
            flatIndex += 1
            return { item, isCurrent: item.slug === currentSlug, isPersistentDot: isPersistentIndex(flatIndex, total, item.slug === currentSlug) }
          })
          const persistent = isCurrentGroup || dots.some((d) => d.isPersistentDot)
          const className = [persistent && 'is-persistent', isCurrentGroup && 'is-current-year'].filter(Boolean).join(' ') || undefined
          return (
            <li key={group.year} className={className}>
              <span className="exhibitions-timeline-label" aria-hidden="true">{group.year}</span>
              <ol className="exhibitions-timeline-group">
                {dots.map(({ item, isCurrent }) => (
                  <li key={item.slug}>
                    <Link
                      to={href('article', item.slug)}
                      aria-current={isCurrent ? 'true' : undefined}
                      aria-label={multi ? `${group.year} – ${item.title}` : String(group.year)}
                    >
                      <span className="exhibitions-timeline-dot" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ol>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
