import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '@/lang.jsx'
import { ExhibitionsTimeline } from '../ExhibitionsTimeline.jsx'

const items = [
  { _id: '1', slug: '2024', title: '2024' },
  { _id: '2', slug: '2023', title: '2023' },
  { _id: '3', slug: '1989', title: '1989' },
]

const renderTimeline = (props, path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LangProvider>
        <ExhibitionsTimeline items={items} {...props} />
      </LangProvider>
    </MemoryRouter>
  )

describe('ExhibitionsTimeline', () => {
  it('renders one link per item, at the root-level article URL for each slug', () => {
    renderTimeline({ currentSlug: '2023' })
    expect(screen.getByRole('link', { name: '2024' })).toHaveAttribute('href', '/2024')
    expect(screen.getByRole('link', { name: '2023' })).toHaveAttribute('href', '/2023')
    expect(screen.getByRole('link', { name: '1989' })).toHaveAttribute('href', '/1989')
  })

  it('builds English hrefs under /en when rendered on an English route', () => {
    renderTimeline({ currentSlug: '2023' }, '/en')
    expect(screen.getByRole('link', { name: '2024' })).toHaveAttribute('href', '/en/2024')
  })

  it('marks only the current year with aria-current="true"', () => {
    renderTimeline({ currentSlug: '2023' })
    expect(screen.getByRole('link', { name: '2023' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: '2024' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: '1989' })).not.toHaveAttribute('aria-current')
  })

  it('marks no year current when the current slug matches none of them', () => {
    renderTimeline({ currentSlug: 'not-a-year' })
    for (const item of items) {
      expect(screen.getByRole('link', { name: item.title })).not.toHaveAttribute('aria-current')
    }
  })

  // Task 28: "the list must be fully usable with no hover at all: keyboard
  // focus must move through the years". Every year is a real <a href>, so
  // Tab must walk through all of them without anything intercepting focus.
  it('lets keyboard focus reach every year, in order, via Tab', async () => {
    const user = userEvent.setup()
    renderTimeline({ currentSlug: '2023' })
    await user.tab()
    expect(screen.getByRole('link', { name: '2024' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: '2023' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: '1989' })).toHaveFocus()
  })

  // Task 28: "make sure the current year is reachable without hunting" on a
  // 25-item column. Guarded in the component itself (jsdom has no
  // scrollIntoView implementation at all), so this only asserts the call,
  // not any pixel value.
  it('scrolls the current year into view on mount', () => {
    const scrollIntoView = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView
    renderTimeline({ currentSlug: '1989' })
    expect(scrollIntoView).toHaveBeenCalled()
    delete window.HTMLElement.prototype.scrollIntoView
  })
})
