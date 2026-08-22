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

  it('reads wpr-media-grid images from query_manual_attachment, the shape every real instance in the archive uses', () => {
    const blocks = mapElementorToBlocks(
      [widget('wpr-media-grid', { query_selection: 'manual', query_manual_attachment: [{ id: 16098 }, { id: 16099 }] })],
      null,
      {}
    )
    expect(blocks[0].type).toBe('gallery')
    expect(blocks[0].items.map((i) => i.image.legacyWpId)).toEqual([16098, 16099])
  })

  it('drops chrome widgets', () => {
    const chrome = [widget('spacer', {}), widget('the7_nav-menu', {}), widget('post-navigation', {})]
    expect(mapElementorToBlocks(chrome, null, {})).toEqual([])
  })

  it('drops the three dynamic widgets with no static content', () => {
    const dynamic = [
      widget('the7-post-loop', { template_id: '9780' }),
      widget('the7_content_carousel', { source: 'posts', autoplay: 'yes' }),
      widget('slider_revolution', { alias: 'home-slider' }),
    ]
    expect(mapElementorToBlocks(dynamic, null, {})).toEqual([])
  })

  it('maps a toggle widget to heading+text pairs in document order', () => {
    const g = widget('toggle', {
      tabs: [
        { tab_title: 'Musée A', tab_content: '<p>Collection A</p>' },
        { tab_title: 'Musée B', tab_content: '<p>Collection B</p>' },
      ],
    })
    expect(mapElementorToBlocks([g], null, {})).toEqual([
      { type: 'heading', value: { fr: 'Musée A', en: '' }, level: 3 },
      { type: 'text', value: { fr: '<p>Collection A</p>', en: '' } },
      { type: 'heading', value: { fr: 'Musée B', en: '' }, level: 3 },
      { type: 'text', value: { fr: '<p>Collection B</p>', en: '' } },
    ])
  })

  it('finds the toggle repeater array by shape, not by a fixed key name', () => {
    const g = widget('toggle', {
      toggle_items: [{ tab_title: 'Musée C', tab_content: '<p>Collection C</p>' }],
    })
    expect(mapElementorToBlocks([g], null, {})).toEqual([
      { type: 'heading', value: { fr: 'Musée C', en: '' }, level: 3 },
      { type: 'text', value: { fr: '<p>Collection C</p>', en: '' } },
    ])
  })

  it('throws on a toggle widget with no tab items', () => {
    const g = widget('toggle', { some_other_setting: 'x' })
    expect(() => mapElementorToBlocks([g], null, { postId: 99 })).toThrow(/no tab items/)
  })

  it('maps a button widget to a text block holding an anchor', () => {
    const g = widget('button', { text: 'Catalogue', link: { url: 'https://example.com/catalogue.pdf' } })
    expect(mapElementorToBlocks([g], null, {})).toEqual([
      { type: 'text', value: { fr: '<p><a href="https://example.com/catalogue.pdf">Catalogue</a></p>', en: '' } },
    ])
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

  it('leaves every English value empty when the trees produce a different block COUNT, even if a later pair coincides on type', () => {
    // fr: toggle (2 blocks: heading+text) then a heading widget (1 block) = 3 blocks total.
    // en: a single text-editor widget (1 block) then a heading widget (1 block) = 2 blocks total.
    // Without a length guard, index 1 on each side would both be 'heading' and
    // wrongly merge, attaching the English heading to the wrong French block.
    const fr = [
      widget('toggle', { tabs: [{ tab_title: 'Musée', tab_content: '<p>Collection</p>' }] }),
      widget('heading', { title: 'Suite' }),
    ]
    const en = [widget('text-editor', { editor: '<p>Hello</p>' }), widget('heading', { title: 'Next' })]
    const blocks = mapElementorToBlocks(fr, en, {})
    expect(blocks).toHaveLength(3)
    expect(blocks.every((b) => b.value?.en === '')).toBe(true)
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
