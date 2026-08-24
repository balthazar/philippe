import { describe, it, expect } from 'vitest'
import { SITE_NAME, HOME_TITLE, articlePageTitle, staticPageTitle } from '../pageTitle.js'

describe('pageTitle', () => {
  it('HOME_TITLE is the bare site name, never suffixed', () => {
    expect(HOME_TITLE).toBe('Philippe Gronon')
    expect(HOME_TITLE).toBe(SITE_NAME)
  })

  it('articlePageTitle includes the year when given one', () => {
    expect(articlePageTitle('Porte', '2023')).toBe('Porte, 2023 | Philippe Gronon')
  })

  it('articlePageTitle omits the year when there is none', () => {
    expect(articlePageTitle('Porte', '')).toBe('Porte | Philippe Gronon')
  })

  it('staticPageTitle suffixes the site name', () => {
    expect(staticPageTitle('Biographie')).toBe('Biographie | Philippe Gronon')
  })

  // A Page's `title` is a localizedField, which defaults to '' -- and the
  // exhibitions page in production carries exactly that, which shipped
  // /expositions with a literal "<title> | Philippe Gronon</title>". The
  // fallback lives here so the prerender and the runtime cannot answer
  // "what does an untitled page's tab say" two different ways.
  it('staticPageTitle falls back to the bare site name for an untitled page', () => {
    expect(staticPageTitle('')).toBe('Philippe Gronon')
    expect(staticPageTitle(undefined)).toBe('Philippe Gronon')
    expect(staticPageTitle(null)).toBe('Philippe Gronon')
  })
})
