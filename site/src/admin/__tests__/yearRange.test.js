import { describe, it, expect } from 'vitest'
import { deriveSortYears } from '../yearRange.js'

describe('deriveSortYears', () => {
  it('reads a single year as both ends', () => {
    expect(deriveSortYears({ fr: '2021', en: '' })).toEqual({ yearStart: 2021, yearEnd: 2021 })
  })

  it('reads a range', () => {
    expect(deriveSortYears({ fr: '2018-2021', en: '' })).toEqual({ yearStart: 2018, yearEnd: 2021 })
  })

  // "2010, 2012, 2015" is a real way to write a span, and its end is the
  // last year in it, not the second.
  it('takes the first and last year, not the first two', () => {
    expect(deriveSortYears({ fr: '2010, 2012, 2015', en: '' })).toEqual({ yearStart: 2010, yearEnd: 2015 })
  })

  it('finds the years inside surrounding words', () => {
    expect(deriveSortYears({ fr: 'vers 2004', en: '' })).toEqual({ yearStart: 2004, yearEnd: 2004 })
  })

  // Empty, not 0: the one article in the archive with no printed year has no
  // year to sort by either, and 0 would file it below 1989 rather than
  // nowhere at all.
  it('gives nothing back for a label with no year in it', () => {
    expect(deriveSortYears({ fr: '', en: '' })).toEqual({ yearStart: '', yearEnd: '' })
    expect(deriveSortYears({ fr: 'sans date', en: '' })).toEqual({ yearStart: '', yearEnd: '' })
    expect(deriveSortYears(undefined)).toEqual({ yearStart: '', yearEnd: '' })
  })

  it('falls back to English when there is no French label', () => {
    expect(deriveSortYears({ fr: '', en: '1996' })).toEqual({ yearStart: 1996, yearEnd: 1996 })
  })

  // A year is a year in both languages, so the two must never sort apart.
  it('prefers French when both are set', () => {
    expect(deriveSortYears({ fr: '1994', en: '1995' })).toEqual({ yearStart: 1994, yearEnd: 1994 })
  })

  it('ignores numbers that are not four digits', () => {
    expect(deriveSortYears({ fr: 'n°26, 2004', en: '' })).toEqual({ yearStart: 2004, yearEnd: 2004 })
  })

  // The check that justifies deriving at all: every label in the real
  // archive parses back to the numbers already stored beside it.
  it('reproduces the archive’s own stored values', () => {
    const archive = [
      ['2009', 2009, 2009],
      ['2025-2026', 2025, 2026],
      ['2018-2021', 2018, 2021],
      ['2015-2021', 2015, 2021],
      ['2013-2014', 2013, 2014],
      ['2007-2010', 2007, 2010],
      ['2001-2022', 2001, 2022],
    ]
    for (const [label, start, end] of archive) {
      expect(deriveSortYears({ fr: label, en: '' })).toEqual({ yearStart: start, yearEnd: end })
    }
  })
})
