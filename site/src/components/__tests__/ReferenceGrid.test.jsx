import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReferenceGrid } from '../ReferenceGrid.jsx'
import { BlockRenderer } from '../BlockRenderer.jsx'

const image = (path = 'ab/cover.webp') => ({
  alt: 'Couverture',
  variants: {
    medium: { path, width: 1400, height: 1900 },
    large: { path: path.replace('.webp', '-l.webp'), width: 2400, height: 3200 },
  },
})

describe('ReferenceGrid', () => {
  // Task 39: the two optional fields (image, url) give three renderings, and
  // all three have to read as members of one list.
  it('renders a full card: cover, citation and link', () => {
    const { container } = render(
      <ReferenceGrid items={[{ value: '<p>Philippe Gronon, <em>Versos</em>, 2016</p>', url: 'https://example.org/versos', image: image() }]} />
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://example.org/versos')
    expect(screen.getByRole('img')).toHaveAttribute('src', '/media/ab/cover.webp')
    expect(container.querySelector('.reference-citation')).toHaveTextContent('Philippe Gronon, Versos, 2016')
    // The citation is HTML on purpose: a book title keeps its italics.
    expect(container.querySelector('.reference-citation em')).toHaveTextContent('Versos')
  })

  // An empty frame reads as a broken image; a citation on its own reads as a
  // citation. So the visual slot is absent, not a placeholder.
  it('renders a link with no visual at all when the entry has no image', () => {
    const { container } = render(
      <ReferenceGrid items={[{ value: '<p>Marges n°11</p>', url: 'https://example.org/marges' }]} />
    )
    expect(screen.getByRole('link')).toBeInTheDocument()
    expect(container.querySelector('.reference-visual')).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  // Villa(s) 6 (Villa Medici, 1995) is a real entry with no web presence
  // anywhere. It must not become a link to nothing.
  it('renders an entry with neither image nor url as a plain, unlinked citation', () => {
    const { container } = render(<ReferenceGrid items={[{ value: '<p>cat. <em>Villa(s) 6</em>, Villa Medici, 1995</p>' }]} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(container.querySelector('.reference')).not.toHaveClass('is-link')
    expect(container.querySelector('.reference-citation')).toHaveTextContent('Villa(s) 6')
  })

  it('marks linked entries so only they can style as targets', () => {
    const { container } = render(
      <ReferenceGrid items={[{ value: '<p>A</p>', url: 'https://example.org/a' }, { value: '<p>B</p>' }]} />
    )
    const entries = [...container.querySelectorAll('.reference')]
    expect(entries[0]).toHaveClass('is-link')
    expect(entries[1]).not.toHaveClass('is-link')
  })

  // Every url that survives safeUrl is absolute and off-site, so the whole
  // list opens in a new tab -- and every one of them needs noopener, which
  // is what actually closes the reverse-tabnabbing hole.
  it('opens off-site links safely', () => {
    render(<ReferenceGrid items={[{ value: '<p>A</p>', url: 'https://example.org/a' }]} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('rel')).toContain('noreferrer')
  })

  // The order of a bibliography is its meaning (chronological), so entries
  // are never regrouped by whether they happen to have a picture.
  it('keeps the given order, mixing entries with and without visuals', () => {
    const { container } = render(
      <ReferenceGrid
        items={[
          { value: '<p>Premier</p>' },
          { value: '<p>Deuxième</p>', image: image('cd/two.webp') },
          { value: '<p>Troisième</p>' },
        ]}
      />
    )
    const texts = [...container.querySelectorAll('.reference-citation')].map((el) => el.textContent)
    expect(texts).toEqual(['Premier', 'Deuxième', 'Troisième'])
  })

  it('renders nothing for an empty block rather than an empty list', () => {
    const { container } = render(<ReferenceGrid items={[]} />)
    expect(container.querySelector('.block-references')).not.toBeInTheDocument()
  })

  it('is reachable through BlockRenderer as a references block', () => {
    const { container } = render(
      <BlockRenderer blocks={[{ type: 'references', items: [{ value: '<p>Une entrée</p>', url: 'https://example.org' }] }]} />
    )
    expect(container.querySelector('.block-references')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Une entrée' })).toBeInTheDocument()
  })
})
