import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BlockRenderer } from '../BlockRenderer.jsx'

const img = (path) => ({ _id: path, alt: 'une porte', variants: { medium: { path, width: 1400, height: 900 }, large: { path, width: 2400, height: 1600 } } })

describe('BlockRenderer', () => {
  it('renders a text block as HTML', () => {
    render(<BlockRenderer blocks={[{ type: 'text', value: '<p>Bonjour <em>monde</em></p>' }]} />)
    expect(screen.getByText('monde')).toBeInTheDocument()
  })

  it('renders a heading at the requested level', () => {
    render(<BlockRenderer blocks={[{ type: 'heading', value: 'Provenance', level: 3 }]} />)
    expect(screen.getByRole('heading', { level: 3, name: 'Provenance' })).toBeInTheDocument()
  })

  it('renders a specs block as a definition list', () => {
    render(<BlockRenderer blocks={[{ type: 'specs', items: [{ term: 'Tirage', value: '3' }] }]} />)
    expect(screen.getByText('Tirage').tagName).toBe('DT')
    expect(screen.getByText('3').tagName).toBe('DD')
  })

  it('renders an image with alt text and explicit dimensions', () => {
    render(<BlockRenderer blocks={[{ type: 'image', image: img('a.webp'), caption: 'Légende' }]} />)
    const image = screen.getByAltText('une porte')
    expect(image).toHaveAttribute('width', '1400')
    expect(screen.getByText('Légende')).toBeInTheDocument()
  })

  it('opens the lightbox when a gallery image is activated', async () => {
    render(<BlockRenderer blocks={[{ type: 'gallery', columns: 3, items: [{ image: img('g.webp') }] }]} />)
    await userEvent.click(screen.getByRole('button', { name: /une porte/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('lets a gallery item span several columns', () => {
    render(<BlockRenderer blocks={[{ type: 'gallery', columns: 6, items: [{ image: img('a.webp'), span: 4 }, { image: img('b.webp') }] }]} />)
    const cells = screen.getAllByRole('listitem')
    expect(cells[0]).toHaveStyle({ gridColumn: 'span 4' })
    expect(cells[1]).toHaveStyle({ gridColumn: 'span 1' })
  })

  it('clamps a span wider than the gallery to the column count', () => {
    render(<BlockRenderer blocks={[{ type: 'gallery', columns: 2, items: [{ image: img('a.webp'), span: 5 }] }]} />)
    expect(screen.getAllByRole('listitem')[0]).toHaveStyle({ gridColumn: 'span 2' })
  })

  it('ignores an unknown block type instead of crashing the page', () => {
    render(<BlockRenderer blocks={[{ type: 'video', value: 'x' }, { type: 'text', value: '<p>ok</p>' }]} />)
    expect(screen.getByText('ok')).toBeInTheDocument()
  })

  // Task 27, client feedback item 1: a gallery item can be `hidden` -- kept
  // in the data (so it can also serve as the article's cover) without
  // showing in the public grid. Must be excluded from the lightbox too, or
  // a hidden image becomes reachable by arrowing through the visible ones.
  describe('hidden gallery items', () => {
    it('does not render a hidden item in the grid', () => {
      render(
        <BlockRenderer
          blocks={[{ type: 'gallery', columns: 3, items: [{ image: img('visible.webp') }, { image: img('hidden.webp'), hidden: true }] }]}
        />
      )
      expect(screen.getAllByRole('listitem')).toHaveLength(1)
    })

    it('never includes a hidden item among the lightbox images', async () => {
      render(
        <BlockRenderer
          blocks={[{
            type: 'gallery', columns: 3,
            items: [{ image: img('visible-1.webp') }, { image: img('hidden.webp'), hidden: true }, { image: img('visible-2.webp') }],
          }]}
        />
      )
      // Only two visible buttons to open the lightbox from -- the hidden
      // item never gets one at all.
      const buttons = screen.getAllByRole('button', { name: /une porte/i })
      expect(buttons).toHaveLength(2)

      await userEvent.click(buttons[1])
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByRole('img')).toHaveAttribute('src', '/media/visible-2.webp')

      // Arrowing "next" from the second visible image must wrap back to the
      // first, past only the two visible images -- never landing on the
      // hidden one in between.
      await userEvent.click(within(dialog).getByRole('button', { name: /suivant|next/i }))
      expect(within(dialog).getByRole('img')).toHaveAttribute('src', '/media/visible-1.webp')
    })

    it('renders every item when none is hidden', () => {
      render(<BlockRenderer blocks={[{ type: 'gallery', columns: 3, items: [{ image: img('a.webp') }, { image: img('b.webp') }] }]} />)
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
    })
  })
})
