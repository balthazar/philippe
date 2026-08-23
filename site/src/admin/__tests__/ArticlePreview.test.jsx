import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArticlePreview } from '../ArticlePreview.jsx'

const POPULATED_COVER = { _id: 'c1', variants: { medium: { path: 'cover-medium.jpg', width: 800, height: 600 } } }

describe('ArticlePreview', () => {
  it('resolves title, year label and block text for the current language, falling back to French', () => {
    const article = {
      title: { fr: 'Titre', en: 'Title' },
      yearLabel: { fr: '2020', en: '' },
      cover: null,
      blocks: [{ type: 'heading', value: { fr: 'Section', en: '' }, level: 2 }],
    }
    render(<ArticlePreview article={article} lang="en" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument()
    // yearLabel.en is empty, falls back to yearLabel.fr.
    expect(screen.getByText('2020')).toBeInTheDocument()
    // block.value.en is empty, falls back to block.value.fr.
    expect(screen.getByRole('heading', { level: 2, name: 'Section' })).toBeInTheDocument()
  })

  it('shows a populated cover image', () => {
    const article = { title: { fr: 'T', en: '' }, cover: POPULATED_COVER, blocks: [] }
    // Decorative (alt=""), so it has no accessible "img" role -- queried by
    // class instead of screen.getByRole.
    const { container } = render(<ArticlePreview article={article} lang="fr" />)
    expect(container.querySelector('img.article-preview-cover')).toHaveAttribute('src', '/media/cover-medium.jpg')
  })

  // Two cases the brief calls out explicitly: an unpopulated image (a bare
  // id string rather than an object with variants) and a brand-new, mostly
  // blank article. Neither must throw.
  it('degrades an unpopulated cover to a placeholder instead of throwing', () => {
    const article = { title: { fr: 'T', en: '' }, cover: 'bare-id-string', blocks: [] }
    render(<ArticlePreview article={article} lang="fr" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText(/pas d.image de couverture/i)).toBeInTheDocument()
  })

  it('degrades an unpopulated block image to no <img>, without throwing', () => {
    const article = {
      title: { fr: '', en: '' },
      cover: null,
      blocks: [{ type: 'image', image: 'bare-id-string', caption: { fr: '', en: '' }, size: 'wide' }],
    }
    expect(() => render(<ArticlePreview article={article} lang="fr" />)).not.toThrow()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders a brand-new, empty article without throwing', () => {
    const article = { title: { fr: '', en: '' }, yearLabel: { fr: '', en: '' }, cover: null, blocks: [] }
    expect(() => render(<ArticlePreview article={article} lang="fr" />)).not.toThrow()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  // Task 27, Part B2: rendered directly under the title, before the year
  // label -- the same position the public ArticleDetail page uses.
  it('renders the subtitle between the title and the year label', () => {
    const article = {
      title: { fr: 'Titre', en: '' },
      subtitle: { fr: 'Numérisation, épreuves numériques pigmentaires', en: '' },
      yearLabel: { fr: '2020', en: '' },
      cover: null,
      blocks: [],
    }
    const { container } = render(<ArticlePreview article={article} lang="fr" />)
    const header = container.querySelector('.article-header')
    const subtitle = screen.getByText('Numérisation, épreuves numériques pigmentaires')
    expect(subtitle).toHaveClass('article-subtitle')
    // eslint-disable-next-line no-bitwise
    expect(header.querySelector('h1').compareDocumentPosition(subtitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // eslint-disable-next-line no-bitwise
    expect(subtitle.compareDocumentPosition(screen.getByText('2020')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders no subtitle line when the article has none', () => {
    const article = { title: { fr: 'Titre', en: '' }, subtitle: { fr: '', en: '' }, cover: null, blocks: [] }
    const { container } = render(<ArticlePreview article={article} lang="fr" />)
    expect(container.querySelector('.article-subtitle')).not.toBeInTheDocument()
  })

  it('resolves specs terms/values and gallery captions as plain text for the current language', () => {
    const article = {
      title: { fr: '', en: '' },
      cover: null,
      blocks: [
        { type: 'specs', items: [{ term: { fr: 'Tirage', en: '' }, value: { fr: '3/10', en: '' } }] },
        { type: 'gallery', columns: 3, items: [{ image: null, caption: { fr: 'Légende', en: '' }, span: 1 }] },
      ],
    }
    render(<ArticlePreview article={article} lang="fr" />)
    expect(screen.getByText('Tirage')).toBeInTheDocument()
    expect(screen.getByText('3/10')).toBeInTheDocument()
    expect(screen.getByText('Légende')).toBeInTheDocument()
  })
})
