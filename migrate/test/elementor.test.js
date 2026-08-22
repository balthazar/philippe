import { describe, it, expect } from 'vitest'
import { mapElementorToBlocks, liftSpecs, walkWidgets } from '../elementor.js'

const widget = (widgetType, settings) => ({ elType: 'widget', widgetType, settings })
const section = (children) => ({ elType: 'section', elements: [{ elType: 'column', elements: children }] })

describe('walkWidgets', () => {
  it('finds widgets nested inside sections and columns', () => {
    const tree = [section([widget('heading', { title: 'Titre' })])]
    expect([...walkWidgets(tree)].map((w) => w.widgetType)).toEqual(['heading'])
  })
})

describe('mapElementorToBlocks', () => {
  it('maps a text editor widget to a sanitized text block', () => {
    const blocks = mapElementorToBlocks([widget('text-editor', { editor: '<p class="x">Bonjour</p>' })], null, {})
    expect(blocks).toEqual([{ type: 'text', value: { fr: '<p>Bonjour</p>', en: '' } }])
  })

  it('maps a heading widget', () => {
    const blocks = mapElementorToBlocks([widget('heading', { title: 'Provenance', header_size: 'h3' })], null, {})
    expect(blocks).toEqual([{ type: 'heading', value: { fr: 'Provenance', en: '' }, level: 3 }])
  })

  it('maps an image widget to an image block with a legacy id placeholder', () => {
    const blocks = mapElementorToBlocks([widget('image', { image: { id: 4211, url: 'x.jpg' } })], null, {})
    expect(blocks).toEqual([
      { type: 'image', image: { legacyWpId: 4211 }, caption: { fr: '', en: '' }, size: 'wide' },
    ])
  })

  it('maps a gallery widget to one gallery block', () => {
    const blocks = mapElementorToBlocks(
      [widget('image-gallery', { wp_gallery: [{ id: 1 }, { id: 2 }] })],
      null,
      {}
    )
    expect(blocks[0].type).toBe('gallery')
    expect(blocks[0].items.map((i) => i.image.legacyWpId)).toEqual([1, 2])
  })

  it('maps a wpr-media-grid the same way as a gallery', () => {
    const blocks = mapElementorToBlocks([widget('wpr-media-grid', { images: [{ id: 7 }] })], null, {})
    expect(blocks[0].type).toBe('gallery')
    expect(blocks[0].items[0].image.legacyWpId).toBe(7)
  })

  it('drops chrome widgets', () => {
    const chrome = [widget('spacer', {}), widget('the7_nav-menu', {}), widget('post-navigation', {})]
    expect(mapElementorToBlocks(chrome, null, {})).toEqual([])
  })

  it('keeps a global widget by mapping its cached settings, rather than dropping it', () => {
    // The archive holds exactly one, in a published article, carrying a credit line.
    const g = widget('global', { editor: '<p>Crédit photo</p>', templateID: '19881' })
    expect(mapElementorToBlocks([g], null, {})).toEqual([
      { type: 'text', value: { fr: '<p>Crédit photo</p>', en: '' } },
    ])
  })

  it('throws on a global widget whose content cannot be inferred', () => {
    const g = widget('global', { templateID: '19881' })
    expect(() => mapElementorToBlocks([g], null, { postId: 17185 })).toThrow(/no inferable content/)
  })

  it('throws on an unknown widget rather than silently dropping content', () => {
    expect(() => mapElementorToBlocks([widget('countdown', {})], null, { postId: 42 })).toThrow(/countdown.*42/)
  })

  it('merges the English tree into the en side of each block, positionally', () => {
    const fr = [widget('text-editor', { editor: '<p>Bonjour</p>' })]
    const en = [widget('text-editor', { editor: '<p>Hello</p>' })]
    expect(mapElementorToBlocks(fr, en, {})).toEqual([
      { type: 'text', value: { fr: '<p>Bonjour</p>', en: '<p>Hello</p>' } },
    ])
  })

  it('leaves the English side empty when the trees differ in shape', () => {
    const fr = [widget('text-editor', { editor: '<p>Bonjour</p>' })]
    const en = [widget('heading', { title: 'Hello' })]
    expect(mapElementorToBlocks(fr, en, {})[0].value.en).toBe('')
  })
})

describe('liftSpecs', () => {
  it('splits a definition list out of surrounding text, preserving order', () => {
    const html = '<p>Avant</p><dl><dt>Tirage</dt><dd>3</dd><dt>Format</dt><dd>50x60</dd></dl><p>Après</p>'
    expect(liftSpecs(html)).toEqual([
      { type: 'text', html: '<p>Avant</p>' },
      { type: 'specs', items: [{ term: 'Tirage', value: '3' }, { term: 'Format', value: '50x60' }] },
      { type: 'text', html: '<p>Après</p>' },
    ])
  })

  it('returns a single text part when there is no definition list', () => {
    expect(liftSpecs('<p>Rien</p>')).toEqual([{ type: 'text', html: '<p>Rien</p>' }])
  })
})
