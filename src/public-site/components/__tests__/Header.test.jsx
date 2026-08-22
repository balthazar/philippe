import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '../../../lib/lang.jsx'
import { Header } from '../Header.jsx'

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LangProvider><Header /></LangProvider>
    </MemoryRouter>
  )

describe('Header', () => {
  it('shows the four French nav items', () => {
    renderAt('/')
    for (const label of ['Œuvres', 'Expositions', 'Biographie', 'Contact']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('shows English nav items under /en', () => {
    renderAt('/en')
    expect(screen.getByRole('link', { name: 'Works' })).toHaveAttribute('href', '/en/works')
  })

  it('offers a toggle to the other language', () => {
    renderAt('/oeuvres')
    expect(screen.getByRole('link', { name: /english/i })).toHaveAttribute('href', '/en/works')
  })

  it('sets the document language to match the route', () => {
    renderAt('/oeuvres')
    expect(document.documentElement.lang).toBe('fr')
    renderAt('/en/works')
    expect(document.documentElement.lang).toBe('en')
  })
})
