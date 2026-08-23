// Not given verbatim in the plan (the brief lists this file but only shows
// routes.test.js content). Written to exercise the documented interface:
// useLang() returns { lang, otherLang, href(routeKey, slug) }, and
// LangProvider derives lang from the current path via langFromPath.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider, useLang } from '../lang.jsx'

function Probe() {
  const { lang, otherLang, href } = useLang()
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="other-lang">{otherLang}</span>
      <span data-testid="works-href">{href('works')}</span>
      <span data-testid="works-slug-href">{href('works', 'press-frame')}</span>
    </div>
  )
}

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LangProvider>
        <Probe />
      </LangProvider>
    </MemoryRouter>
  )

describe('LangProvider / useLang', () => {
  it('defaults to French outside the /en prefix', () => {
    renderAt('/oeuvres')
    expect(screen.getByTestId('lang')).toHaveTextContent('fr')
    expect(screen.getByTestId('other-lang')).toHaveTextContent('en')
    expect(screen.getByTestId('works-href')).toHaveTextContent('/oeuvres')
  })

  it('detects English from the /en prefix and builds hrefs under /en', () => {
    renderAt('/en/works')
    expect(screen.getByTestId('lang')).toHaveTextContent('en')
    expect(screen.getByTestId('other-lang')).toHaveTextContent('fr')
    expect(screen.getByTestId('works-slug-href')).toHaveTextContent('/en/works/press-frame')
  })

  it('treats the root path as French', () => {
    renderAt('/')
    expect(screen.getByTestId('lang')).toHaveTextContent('fr')
  })
})
