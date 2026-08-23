import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    // 30s rather than vitest's 5s default. Several tests here do real image
    // work: sharp encodes a multi-megapixel source and then re-encodes four
    // derived variants from it. That is genuinely slow, not slow because
    // something is wrong. Under full-suite load it intermittently crossed the
    // 5s line -- observed at 5044ms in imagePipeline and 5035ms in the media
    // route -- while passing every time in isolation, so the suite went red at
    // random and a real failure would have been indistinguishable from noise.
    // Set here rather than per-test: it is not one slow test, it is every test
    // that touches the image pipeline, and the next one added would hit it too.
    testTimeout: 30_000
  }
})
