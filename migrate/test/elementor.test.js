import { describe, it, expect } from 'vitest'
import { mapElementorToBlocks, liftSpecs, walkWidgets, convertHeadingsToText } from '../elementor.js'

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

  // Task 30, part 5: retires the `heading` block type. A heading widget is
  // still recognised internally (dropTrailingHeadings/dropPlaceholderHeadings
  // below still need to key off it), but the FINAL block mapElementorToBlocks
  // emits is a `text` block carrying an `<h2>`/`<h3>`, sanitized the same way
  // any other text block is.
  it('maps a heading widget into a text block carrying an <h2>/<h3>', () => {
    // Followed by a text widget so it is not a trailing heading, which
    // dropTrailingHeadings would otherwise strip; that behaviour has its own
    // dedicated tests below.
    const blocks = mapElementorToBlocks(
      [widget('heading', { title: 'Provenance', header_size: 'h3' }), widget('text-editor', { editor: '<p>x</p>' })],
      null,
      {}
    )
    expect(blocks[0]).toEqual({ type: 'text', value: { fr: '<h3>Provenance</h3>', en: '' } })
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
      { type: 'text', value: { fr: '<h3>Musée A</h3>', en: '' } },
      { type: 'text', value: { fr: '<p>Collection A</p>', en: '' } },
      { type: 'text', value: { fr: '<h3>Musée B</h3>', en: '' } },
      { type: 'text', value: { fr: '<p>Collection B</p>', en: '' } },
    ])
  })

  it('finds the toggle repeater array by shape, not by a fixed key name', () => {
    const g = widget('toggle', {
      toggle_items: [{ tab_title: 'Musée C', tab_content: '<p>Collection C</p>' }],
    })
    expect(mapElementorToBlocks([g], null, {})).toEqual([
      { type: 'text', value: { fr: '<h3>Musée C</h3>', en: '' } },
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
    // fr: toggle (2 blocks: heading+text) then a heading widget, then a
    // trailing text widget (so the sequence does not itself end in a heading
    // and dropTrailingHeadings, tested separately, is not what is under test
    // here) = 4 blocks total.
    // en: a single text-editor widget (1 block) then a heading widget (1
    // block) = 2 blocks total.
    // Without a length guard, a positional zip could still coincidentally
    // align a French and English block of the same type and wrongly merge.
    const fr = [
      widget('toggle', { tabs: [{ tab_title: 'Musée', tab_content: '<p>Collection</p>' }] }),
      widget('heading', { title: 'Suite' }),
      widget('text-editor', { editor: '<p>Après</p>' }),
    ]
    const en = [widget('text-editor', { editor: '<p>Hello</p>' }), widget('heading', { title: 'Next' })]
    const blocks = mapElementorToBlocks(fr, en, {})
    expect(blocks).toHaveLength(4)
    expect(blocks.every((b) => b.value?.en === '')).toBe(true)
  })
})

// A lone heading is legitimately removed by dropTrailingHeadings (it would be
// labelling content that no longer exists), so each fixture below pairs the
// heading with a following text block to keep it in the output.
const body = (headingSettings) => [
  widget('heading', headingSettings),
  widget('text-editor', { editor: '<p>Contenu</p>' }),
]

describe('plain-text entity decoding', () => {
  // sanitize-html decodes entities while parsing, then re-encodes the three
  // characters that are unsafe in HTML text (& < >) on the way out. Heading
  // titles go through exactly one unescape (stripTags/unescapeTextEntities,
  // widgetToBlocks' 'heading' case) BEFORE headingToText wraps them in
  // <h2>/<h3> -- that decoded plain text is then re-escaped (headingToText's
  // own escapeHtml) so it can be interposed into an HTML tag safely, and
  // clean()'s own parse-then-reencode pass (this is now a real `text` block,
  // sanitized the same as any other) is what produces the final stored HTML.
  // The real biography page shipped "BOURSES &amp;amp; RESIDENCES" from the
  // old (pre-Task 30) direct-to-plain-text path; wrapping in a sanitized
  // text block is what keeps this correct now that it round-trips through
  // an actual HTML sanitizer rather than being stored as bare text.
  it('decodes an escaped ampersand in a heading, then re-escapes it correctly inside the wrapping <h2>', () => {
    const blocks = mapElementorToBlocks(body({ title: 'BOURSES &amp; RÉSIDENCES' }), null, {})
    expect(blocks[0]).toEqual({ type: 'text', value: { fr: '<h2>BOURSES &amp; RÉSIDENCES</h2>', en: '' } })
  })

  it('decodes escaped angle brackets in a heading without letting them be parsed as markup', () => {
    const blocks = mapElementorToBlocks(body({ title: '&lt;Verso&gt;' }), null, {})
    expect(blocks[0].value.fr).toBe('<h2>&lt;Verso&gt;</h2>')
  })

  // Order matters: &amp; must be reversed LAST. Reversing it first would turn
  // "&amp;lt;" into "&lt;" and then into "<", collapsing two levels of
  // escaping instead of one and inventing markup that was never in the source.
  it('unescapes exactly one level, so a literal entity name survives', () => {
    const blocks = mapElementorToBlocks(body({ title: '&amp;lt; is how you write &amp;amp;lt;' }), null, {})
    expect(blocks[0].value.fr).toBe('<h2>&amp;lt; is how you write &amp;amp;lt;</h2>')
  })

  it('leaves text with no entities untouched', () => {
    const blocks = mapElementorToBlocks(body({ title: 'Observatoires' }), null, {})
    expect(blocks[0].value.fr).toBe('<h2>Observatoires</h2>')
  })
})

describe('dropTrailingHeadings (via mapElementorToBlocks)', () => {
  it('drops a single trailing heading', () => {
    const nodes = [
      widget('text-editor', { editor: '<p>Intro</p>' }),
      widget('heading', { title: 'Éditions' }),
    ]
    expect(mapElementorToBlocks(nodes, null, {})).toEqual([
      { type: 'text', value: { fr: '<p>Intro</p>', en: '' } },
    ])
  })

  it('drops several trailing headings in a row', () => {
    const nodes = [
      widget('text-editor', { editor: '<p>Intro</p>' }),
      widget('heading', { title: 'Éditions' }),
      widget('heading', { title: 'Commandes publiques' }),
    ]
    expect(mapElementorToBlocks(nodes, null, {})).toEqual([
      { type: 'text', value: { fr: '<p>Intro</p>', en: '' } },
    ])
  })

  it('keeps a heading followed by real content', () => {
    const nodes = [
      widget('heading', { title: 'Provenance' }),
      widget('text-editor', { editor: '<p>Corps</p>' }),
      widget('heading', { title: 'Éditions' }),
    ]
    expect(mapElementorToBlocks(nodes, null, {})).toEqual([
      { type: 'text', value: { fr: '<h2>Provenance</h2>', en: '' } },
      { type: 'text', value: { fr: '<p>Corps</p>', en: '' } },
    ])
  })

  it('leaves a block list with no headings unchanged', () => {
    const nodes = [
      widget('text-editor', { editor: '<p>Un</p>' }),
      widget('text-editor', { editor: '<p>Deux</p>' }),
    ]
    expect(mapElementorToBlocks(nodes, null, {})).toEqual([
      { type: 'text', value: { fr: '<p>Un</p>', en: '' } },
      { type: 'text', value: { fr: '<p>Deux</p>', en: '' } },
    ])
  })

  it('reduces an all-headings list to empty', () => {
    const nodes = [
      widget('heading', { title: 'Un' }),
      widget('heading', { title: 'Deux' }),
    ]
    expect(mapElementorToBlocks(nodes, null, {})).toEqual([])
  })
})

// Task 26, part A2: 76 of 115 heading blocks across the archive are the
// literal, unfilled Elementor placeholder "Ajoutez votre titre ici". They
// must be dropped on an EXACT string match, not on any inference about
// which article/category they live in -- the ~39 real exhibition titles
// (and the biography page's toggle-derived section headings) must survive.
describe('placeholder heading removal (via mapElementorToBlocks)', () => {
  it('drops a heading that is exactly the unfilled Elementor placeholder', () => {
    const nodes = [
      widget('heading', { title: 'Ajoutez votre titre ici' }),
      widget('text-editor', { editor: '<p>Corps</p>' }),
    ]
    expect(mapElementorToBlocks(nodes, null, {})).toEqual([
      { type: 'text', value: { fr: '<p>Corps</p>', en: '' } },
    ])
  })

  it('keeps a heading with real content, even if it starts the same way', () => {
    const nodes = [
      widget('heading', { title: 'Ajoutez votre titre ici et votre sous-titre' }),
      widget('text-editor', { editor: '<p>Corps</p>' }),
    ]
    expect(mapElementorToBlocks(nodes, null, {})[0]).toEqual({
      type: 'text', value: { fr: '<h2>Ajoutez votre titre ici et votre sous-titre</h2>', en: '' },
    })
  })

  it('keeps a genuine exhibition-title heading untouched, wrapped as an <h2>', () => {
    const nodes = [
      widget('heading', { title: 'Rectos / Versos, Galerie Espace Muraille' }),
      widget('text-editor', { editor: '<p>Corps</p>' }),
    ]
    expect(mapElementorToBlocks(nodes, null, {})[0].value.fr).toBe('<h2>Rectos / Versos, Galerie Espace Muraille</h2>')
  })

  it('drops several placeholder headings in the same article', () => {
    const nodes = [
      widget('heading', { title: 'Ajoutez votre titre ici' }),
      widget('text-editor', { editor: '<p>Un</p>' }),
      widget('heading', { title: 'Ajoutez votre titre ici' }),
      widget('text-editor', { editor: '<p>Deux</p>' }),
    ]
    expect(mapElementorToBlocks(nodes, null, {})).toEqual([
      { type: 'text', value: { fr: '<p>Un</p>', en: '' } },
      { type: 'text', value: { fr: '<p>Deux</p>', en: '' } },
    ])
  })

  it('drops a placeholder heading even when it is the only block', () => {
    const nodes = [widget('heading', { title: 'Ajoutez votre titre ici' })]
    expect(mapElementorToBlocks(nodes, null, {})).toEqual([])
  })
})

// Task 30, part 5: retires the `heading` block type. Direct unit tests for
// the conversion step, on top of the mapElementorToBlocks-level tests above.
describe('convertHeadingsToText', () => {
  it('converts a level-2 heading into a text block carrying an <h2>', () => {
    const blocks = [{ type: 'heading', value: { fr: 'Titre', en: '' }, level: 2 }]
    expect(convertHeadingsToText(blocks)).toEqual([{ type: 'text', value: { fr: '<h2>Titre</h2>', en: '' } }])
  })

  it('converts a level-3 heading into a text block carrying an <h3>', () => {
    const blocks = [{ type: 'heading', value: { fr: 'Titre', en: '' }, level: 3 }]
    expect(convertHeadingsToText(blocks)).toEqual([{ type: 'text', value: { fr: '<h3>Titre</h3>', en: '' } }])
  })

  it('wraps both languages independently, leaving an empty one empty rather than <h2></h2>', () => {
    const blocks = [{ type: 'heading', value: { fr: 'Titre', en: 'Title' }, level: 2 }]
    expect(convertHeadingsToText(blocks)).toEqual([{ type: 'text', value: { fr: '<h2>Titre</h2>', en: '<h2>Title</h2>' } }])
    const blocksNoEn = [{ type: 'heading', value: { fr: 'Titre', en: '' }, level: 2 }]
    expect(convertHeadingsToText(blocksNoEn)[0].value.en).toBe('')
  })

  it('leaves every non-heading block untouched', () => {
    const blocks = [
      { type: 'text', value: { fr: '<p>x</p>', en: '' } },
      { type: 'image', image: { legacyWpId: 1 } },
    ]
    expect(convertHeadingsToText(blocks)).toEqual(blocks)
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
