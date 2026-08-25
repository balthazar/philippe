import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CollectionsGrid } from '../CollectionsGrid.jsx'

const image = { variants: { medium: { path: 'a/b-medium.webp', width: 220, height: 220 } } }
const item = (name, url) => ({ image, value: `<p>${name}</p>`, url })

describe('CollectionsGrid', () => {
  it('renders nothing at all for an empty block', () => {
    const { container } = render(<CollectionsGrid items={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows each institution’s mark and name', () => {
    const { container } = render(<CollectionsGrid items={[item('Musée du Louvre, Paris')]} />)
    expect(screen.getByText('Musée du Louvre, Paris')).toBeInTheDocument()
    expect(container.querySelector('.collection-mark img')).toHaveAttribute('src', '/media/a/b-medium.webp')
  })

  // The name is right there in the markup; giving the mark the same string as
  // its alt would have a screen reader announce every institution twice.
  it('leaves the mark’s alt empty, since the name is beside it', () => {
    const { container } = render(<CollectionsGrid items={[item('Mamco')]} />)
    expect(container.querySelector('.collection-mark img')).toHaveAttribute('alt', '')
  })

  it('links out when the institution has a site', () => {
    render(<CollectionsGrid items={[item('BnF', 'https://www.bnf.fr/fr')]} />)
    const link = screen.getByRole('link', { name: 'BnF' })
    expect(link).toHaveAttribute('href', 'https://www.bnf.fr/fr')
    expect(link).toHaveAttribute('target', '_blank')
    // noopener is the one that closes the reverse-tabnabbing hole; it must
    // not depend on noreferrer's support.
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  // Three of the twenty-one have no site that answers. An unlinked cell must
  // not pretend to be a target.
  it('renders a cell with no site as plain text, not a link', () => {
    const { container } = render(<CollectionsGrid items={[item('Frac Bourgogne, Dijon')]} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(container.querySelector('.collection')).not.toHaveClass('is-link')
  })

  it('marks a linked cell so the stylesheet can tell the two apart', () => {
    const { container } = render(<CollectionsGrid items={[item('BnF', 'https://www.bnf.fr/fr')]} />)
    expect(container.querySelector('.collection')).toHaveClass('is-link')
  })

  // Sanitized on write (cleanBlocks), so a name keeps its accents and italics.
  it('renders the stored markup of a name', () => {
    const { container } = render(<CollectionsGrid items={[{ image, value: '<p>Mamco, <em>Genève</em></p>' }]} />)
    expect(container.querySelector('.collection-name em')).toHaveTextContent('Genève')
  })

  it('survives an entry with no image', () => {
    const { container } = render(<CollectionsGrid items={[{ value: '<p>Sans logo</p>' }]} />)
    expect(container.querySelector('.collection-mark')).toBeNull()
    expect(screen.getByText('Sans logo')).toBeInTheDocument()
  })
})
