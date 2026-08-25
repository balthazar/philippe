import { beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { clearPageDataCache } from '@/preload.jsx'

/**
 * vite.config.js used to point `setupFiles` straight at
 * `@testing-library/jest-dom/vitest`, on the grounds that a setup file which
 * only re-exported it would be a file for nothing. That held until
 * usePageData grew a session cache (see preload.jsx).
 *
 * That cache is module state, deliberately: it has to survive components
 * unmounting and remounting, which is the whole point of it. Module state
 * also survives from one test to the next, and these tests mount the same
 * keys over and over against different mocked responses -- so without this,
 * the first test to fetch `page:biography:fr` decides what every later test
 * sees under that key, and a dozen unrelated assertions fail on data they
 * never asked for.
 *
 * Cleared before each test rather than after, so a test that fails part-way
 * cannot poison the next one.
 */
beforeEach(() => {
  clearPageDataCache()
})
