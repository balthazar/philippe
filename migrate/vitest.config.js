import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Without this file, vitest (which finds no vite/vitest config in
    // migrate/) walks up and picks up the repo root's vite.config.js, whose
    // `include: ['src/**/*.test.{js,jsx}']` matches nothing under migrate/
    // and reports "No test files found". Scoping here, the same way
    // api/vitest.config.js already does for api/, keeps this package's test
    // run self-contained.
    include: ['test/**/*.test.js'],
  },
})
