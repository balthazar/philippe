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
})
