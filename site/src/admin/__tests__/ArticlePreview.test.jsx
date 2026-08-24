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
      // Task 30, part 5: `heading` is retired -- what used to be a heading
      // block is now a `text` block carrying an <h2>/<h3>.
      blocks: [{ type: 'text', value: { fr: '<h2>Section</h2>', en: '' } }],
    }
    render(<ArticlePreview article={article} lang="en" />)
    // Title and year resolve independently, then join into the one heading:
    // title.en is populated, yearLabel.en is empty so the year falls back
    // to yearLabel.fr.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title | 2020')
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
  it('degrades an unpopulated cover to a placeholder instead of throwing, when it cannot be resolved from the gallery either', () => {
    const article = { title: { fr: 'T', en: '' }, cover: 'bare-id-string', blocks: [] }
    render(<ArticlePreview article={article} lang="fr" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText(/pas d.image de couverture/i)).toBeInTheDocument()
  })

  // Task 30 bug report: `article.cover` is a bare id string right after the
  // star toggle sets a new cover pre-save, or right after a save whose
  // response wasn't populated (see api/src/routes/admin.js's POST fix) --
  // both are legitimately reachable states, not edge cases. Since the cover
  // migration, every cover is one of the article's own gallery images, so a
  // bare id can be resolved locally against the blocks the editor already
  // holds, rather than falling back to "no cover" for a display-shape
  // problem that reads to the artist as data loss.
  it('resolves a bare cover id to the matching gallery image, instead of showing a placeholder', () => {
    const image = { _id: 'img1', variants: { medium: { path: 'gallery-medium.jpg', width: 800, height: 600 } } }
    const article = {
      title: { fr: 'T', en: '' },
      cover: 'img1',
      blocks: [{ type: 'gallery', columns: 3, items: [{ image, caption: { fr: '', en: '' }, span: 1 }] }],
    }
    const { container } = render(<ArticlePreview article={article} lang="fr" />)
    expect(container.querySelector('img.article-preview-cover')).toHaveAttribute('src', '/media/gallery-medium.jpg')
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

  // Task 32, item 5: resolveBlocks.js used to resolve only captions for
  // `image`/`gallery` blocks -- `block.image`/`item.image` themselves were
  // left untouched, so an id-only reference (e.g. a save response that came
  // back unpopulated) rendered nothing at all, even when the very same
  // image was populated elsewhere in this same article (its cover, or
  // another gallery item). These prove the single shared index resolves
  // across fields, not just within one.
  it('resolves a bare block image id from the populated cover, when the two reference the same image', () => {
    const image = { _id: 'img1', variants: { medium: { path: 'gallery-medium.jpg', width: 800, height: 600 } } }
    const article = {
      title: { fr: '', en: '' },
      cover: image,
      blocks: [{ type: 'image', image: 'img1', caption: { fr: '', en: '' }, size: 'wide' }],
    }
    const { container } = render(<ArticlePreview article={article} lang="fr" />)
    expect(container.querySelector('.block-image img')).toHaveAttribute('src', '/media/gallery-medium.jpg')
  })

  it('resolves a bare gallery item image id from a populated image block elsewhere in the article', () => {
    const image = { _id: 'img2', variants: { medium: { path: 'block-medium.jpg', width: 800, height: 600 } } }
    const article = {
      title: { fr: '', en: '' },
      cover: null,
      blocks: [
        { type: 'image', image, caption: { fr: '', en: '' }, size: 'wide' },
        { type: 'gallery', columns: 3, items: [{ image: 'img2', caption: { fr: '', en: '' }, span: 1 }] },
      ],
    }
    const { container } = render(<ArticlePreview article={article} lang="fr" />)
    const galleryImg = container.querySelector('.block-gallery img')
    expect(galleryImg).toHaveAttribute('src', '/media/block-medium.jpg')
  })

  it('renders a brand-new, empty article without throwing', () => {
    const article = { title: { fr: '', en: '' }, yearLabel: { fr: '', en: '' }, cover: null, blocks: [] }
    expect(() => render(<ArticlePreview article={article} lang="fr" />)).not.toThrow()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  // Client feedback: the year is part of the heading itself, joined to the
  // title by " | " -- the same form ArticleCard.jsx uses on the works index
  // and the public ArticleBody header uses. It is no longer a line of its
  // own, so this replaces Task 27, Part B2's title/subtitle/year ordering:
  // the only thing left to order is the subtitle, which follows the
  // heading.
  it('joins the year to the title in the heading, with the subtitle below', () => {
    const article = {
      title: { fr: 'Titre', en: '' },
      subtitle: { fr: 'Numérisation, épreuves numériques pigmentaires', en: '' },
      yearLabel: { fr: '2020', en: '' },
      cover: null,
      blocks: [],
    }
    const { container } = render(<ArticlePreview article={article} lang="fr" />)
    const header = container.querySelector('.article-header')
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Titre | 2020')
    // The year is heading text, not an element beside it.
    expect(container.querySelector('.article-year')).not.toBeInTheDocument()
    const subtitle = screen.getByText('Numérisation, épreuves numériques pigmentaires')
    expect(subtitle).toHaveClass('article-subtitle')
    // eslint-disable-next-line no-bitwise
    expect(heading.compareDocumentPosition(subtitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(header).toContainElement(subtitle)
  })

  it('renders the title alone, with no separator, when there is no year', () => {
    const article = {
      title: { fr: 'Titre', en: '' },
      yearLabel: { fr: '', en: '' },
      cover: null,
      blocks: [],
    }
    render(<ArticlePreview article={article} lang="fr" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Titre$/)
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
