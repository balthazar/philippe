import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { usePageTitle } from '../usePageTitle.js'

function Probe({ title }) {
  usePageTitle(title)
  return null
}

describe('usePageTitle', () => {
  it('sets document.title to the given value', () => {
    render(<Probe title="Porte, 2023 | Philippe Gronon" />)
    expect(document.title).toBe('Porte, 2023 | Philippe Gronon')
  })

  it('updates document.title when the value changes', () => {
    const { rerender } = render(<Probe title="Une page | Philippe Gronon" />)
    expect(document.title).toBe('Une page | Philippe Gronon')
    rerender(<Probe title="Une autre page | Philippe Gronon" />)
    expect(document.title).toBe('Une autre page | Philippe Gronon')
  })

  // Loading state: don't blank the previous title out while new data is
  // still on the way in -- same "no flash of missing content" reasoning
  // this project already applies elsewhere (task 26, correction to B4).
  it('leaves document.title untouched while the value is falsy', () => {
    document.title = 'Ce qui existait déjà'
    render(<Probe title="" />)
    expect(document.title).toBe('Ce qui existait déjà')
  })
})
