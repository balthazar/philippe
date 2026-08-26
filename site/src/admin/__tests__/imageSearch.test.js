import { describe, it, expect } from 'vitest'
import { matchesQuery, normalize, searchableText } from '../imageSearch.js'

// A real legend from the archive. They are all this shape, which is why a
// contiguous substring search was so hard to use.
const VERSO = 'Verso n°27, Portrait, Anonyme, collection particulière, Malakoff - 2005, 42 x 36 cm'

describe('matchesQuery', () => {
  // The reported case. "verso" and "27" are separated by "n°" in every one of
  // these, so a single-substring search found nothing for "verso 27".
  it('finds “Verso n°27” from “ver 27”', () => {
    expect(matchesQuery(VERSO, 'ver 27')).toBe(true)
    expect(matchesQuery(VERSO, 'verso 27')).toBe(true)
  })

  it('does not care what order the words come in', () => {
    expect(matchesQuery(VERSO, '27 ver')).toBe(true)
    expect(matchesQuery(VERSO, 'malakoff portrait')).toBe(true)
  })

  it('matches each word partially, not just whole words', () => {
    expect(matchesQuery(VERSO, 'anon collect')).toBe(true)
  })

  // AND, not OR. A second word has to narrow the result, or typing more
  // would return more.
  it('requires every word, so one miss rejects the whole thing', () => {
    expect(matchesQuery(VERSO, 'verso rembrandt')).toBe(false)
    expect(matchesQuery(VERSO, 'ver 28')).toBe(false)
  })

  it('still ignores accents and case, per word', () => {
    expect(matchesQuery(VERSO, 'PARTICULIERE malakoff')).toBe(true)
    expect(matchesQuery('Cuvette de développement', 'developpement')).toBe(true)
  })

  // An empty or whitespace-only query is not a filter -- it must not hide
  // the library behind a stray space.
  it('matches everything for an empty query', () => {
    expect(matchesQuery(VERSO, '')).toBe(true)
    expect(matchesQuery(VERSO, '   ')).toBe(true)
    expect(matchesQuery(VERSO, null)).toBe(true)
  })

  it('survives runs of whitespace between words', () => {
    expect(matchesQuery(VERSO, '  ver    27  ')).toBe(true)
    expect(matchesQuery(VERSO, 'ver\t27')).toBe(true)
  })

  it('rejects rather than throws on an image with no text', () => {
    expect(matchesQuery('', 'ver')).toBe(false)
    expect(matchesQuery(null, 'ver')).toBe(false)
  })
})

describe('searchableText', () => {
  it('joins both languages, so a word in either one is findable', () => {
    const image = { alt: { fr: 'Plaque de cuivre', en: 'Copper plate' } }
    expect(matchesQuery(searchableText(image), 'copper')).toBe(true)
    expect(matchesQuery(searchableText(image), 'cuivre')).toBe(true)
  })

  // The two fields are joined with a space, so words from each can combine.
  it('lets one word match the French and another the English', () => {
    const image = { alt: { fr: 'Plaque de cuivre', en: 'Copper plate' } }
    expect(matchesQuery(searchableText(image), 'cuivre plate')).toBe(true)
  })

  it('handles a missing alt without throwing', () => {
    expect(searchableText({}).trim()).toBe('')
    expect(searchableText(null).trim()).toBe('')
  })
})

describe('normalize', () => {
  it('folds accents and lowercases', () => {
    expect(normalize('Écritoire')).toBe('ecritoire')
    expect(normalize('particulière')).toBe('particuliere')
  })
})
