import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // Dev only. In production nginx serves the bundle and the Traefik ingress
      // routes /api and /media to the API, so no proxy is involved.
      // 8090 rather than 8080: an unrelated dev server occupies 8080 on this machine.
      '/api': process.env.VITE_API_PROXY || 'http://localhost:8090',
      '/media': process.env.VITE_API_PROXY || 'http://localhost:8090',
    },
  },
  // `vite preview` serves the real production build (dist/), used to verify
  // the prerendered output (Task 22) the way `vite dev` never can. It has
  // its own proxy config, separate from `server` above, or /api and /media
  // 404 against the static file server and every page looks stuck loading.
  preview: {
    proxy: {
      '/api': process.env.VITE_API_PROXY || 'http://localhost:8090',
      '/media': process.env.VITE_API_PROXY || 'http://localhost:8090',
    },
  },
  test: {
    environment: 'jsdom',
    // This used to point straight at '@testing-library/jest-dom/vitest',
    // since a setup file that only re-exported it would be a file for
    // nothing. usePageData's session cache (preload.jsx) changed that: it is
    // module state by design, so it also outlives a test, and every suite
    // needs it cleared between cases. See src/setupTests.js.
    setupFiles: ['./src/setupTests.js'],
    globals: true,
    // Scoped to this app's own tests: without this, vitest run from the repo
    // root also discovers api/test/** (node-only, needs mongodb-memory-server)
    // and migrate/**, and a filter like `-- routes` collides with
    // api/test/routes/*.test.js since that path also contains "routes".
    // prerender/**/*.test.js (Task 22) is included the same way, alongside
    // src/**: it is this app's own build step, not a separate package.
    include: ['src/**/*.test.{js,jsx}', 'prerender/**/*.test.js'],
  },
})
