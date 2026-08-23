import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PagePreview } from '../PagePreview.jsx'

// Task 27, Part C1: PageEditor had no live preview at all. Mirrors
// ArticlePreview.test.jsx's coverage, minus the article-only fields
// (cover, subtitle, yearLabel) a page doesn't have.
describe('PagePreview', () => {
  it('resolves the title and block text for the current language, falling back to French', () => {
    const page = {
      title: { fr: 'Titre', en: 'Title' },
      blocks: [{ type: 'heading', value: { fr: 'Section', en: '' }, level: 2 }],
    }
    render(<PagePreview page={page} lang="en" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Section' })).toBeInTheDocument()
  })

  it('renders a brand-new, empty page without throwing', () => {
    const page = { title: { fr: '', en: '' }, blocks: [] }
    expect(() => render(<PagePreview page={page} lang="fr" />)).not.toThrow()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('renders a text block through BlockRenderer, sanitized HTML included', () => {
    const page = { title: { fr: 'Contact', en: '' }, blocks: [{ type: 'text', value: { fr: '<p>Bonjour</p>', en: '' } }] }
    render(<PagePreview page={page} lang="fr" />)
    expect(screen.getByText('Bonjour')).toBeInTheDocument()
  })
})
