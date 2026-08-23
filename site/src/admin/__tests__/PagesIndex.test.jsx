import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PagesIndex } from '../PagesIndex.jsx'

// D6: neither "Accueil" nor "Expositions (intro)" has anything editable.
// Removed from the index; the other six stay.
describe('PagesIndex', () => {
  it('does not list Accueil or Expositions (intro)', () => {
    render(<MemoryRouter><PagesIndex /></MemoryRouter>)
    expect(screen.queryByRole('link', { name: 'Accueil' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Expositions (intro)' })).not.toBeInTheDocument()
  })

  it('still lists the other six pages, each linking to its own editor route', () => {
    render(<MemoryRouter><PagesIndex /></MemoryRouter>)
    const expected = {
      'Œuvres (intro)': '/admin/pages/works',
      Biographie: '/admin/pages/biography',
      Contact: '/admin/pages/contact',
      Bibliographie: '/admin/pages/bibliography',
      Liens: '/admin/pages/links',
      'Mentions légales': '/admin/pages/legal',
    }
    for (const [label, href] of Object.entries(expected)) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href)
    }
    expect(screen.getAllByRole('link')).toHaveLength(6)
  })
})
