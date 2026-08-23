import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
