import { describe, it, expect } from 'vitest'
import { buildUsageMap, roleOf, ROLES } from '../../src/lib/imageUsage.js'

const gallery = (...ids) => ({ type: 'gallery', items: ids.map((image) => ({ image })) })
const references = (...ids) => ({ type: 'references', items: ids.map((image) => ({ image })) })
const imageBlock = (image) => ({ type: 'image', image })

describe('buildUsageMap', () => {
  it('treats a gallery item as fullscreen: the lightbox serves large and zooms into it', () => {
    const usage = buildUsageMap({ articles: [{ blocks: [gallery('a')] }] })
    expect(roleOf(usage, 'a')).toBe(ROLES.FULLSCREEN)
  })

  it('treats an article cover as fullscreen: the homepage slideshow serves large', () => {
    const usage = buildUsageMap({ articles: [{ cover: 'c', blocks: [] }] })
    expect(roleOf(usage, 'c')).toBe(ROLES.FULLSCREEN)
  })

  it('treats a standalone image block as fullscreen, since it renders at 100vw', () => {
    const usage = buildUsageMap({ articles: [{ blocks: [imageBlock('i')] }] })
    expect(roleOf(usage, 'i')).toBe(ROLES.FULLSCREEN)
  })

  it('treats a bibliography entry as a reference, set at 30vw and no larger', () => {
    const usage = buildUsageMap({ pages: [{ blocks: [references('r')] }] })
    expect(roleOf(usage, 'r')).toBe(ROLES.REFERENCE)
  })

  it('reports an unreferenced image as unused', () => {
    expect(roleOf(buildUsageMap({}), 'nowhere')).toBe(ROLES.UNUSED)
  })

  // Being a reference cover in one place does not excuse being soft in a
  // lightbox somewhere else, so the most demanding use wins.
  it('takes the most demanding role, in either order', () => {
    const both = [{ blocks: [references('x')] }, { blocks: [gallery('x')] }]
    expect(roleOf(buildUsageMap({ articles: both }), 'x')).toBe(ROLES.FULLSCREEN)
    expect(roleOf(buildUsageMap({ articles: [...both].reverse() }), 'x')).toBe(ROLES.FULLSCREEN)
  })

  it('reads pages as well as articles, which share the same block schema', () => {
    const usage = buildUsageMap({ pages: [{ blocks: [gallery('p')] }] })
    expect(roleOf(usage, 'p')).toBe(ROLES.FULLSCREEN)
  })

  it('survives blocks with no items and items with no image', () => {
    const usage = buildUsageMap({
      articles: [{ cover: null, blocks: [{ type: 'text' }, { type: 'gallery', items: [{}] }] }],
    })
    expect(usage.size).toBe(0)
  })

  it('matches on the id whether it arrives as a string or an object id', () => {
    const objectish = { toString: () => 'abc' }
    const usage = buildUsageMap({ articles: [{ blocks: [gallery(objectish)] }] })
    expect(roleOf(usage, 'abc')).toBe(ROLES.FULLSCREEN)
  })
})
