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
  test: {
    environment: 'jsdom',
    // The package ships a ./vitest export (see its package.json "exports"
    // map) that is the jest-dom matchers with no other setup baggage, so it
    // can be pointed at directly instead of a one-line src/setupTests.js
    // that just re-exported it.
    setupFiles: ['@testing-library/jest-dom/vitest'],
    globals: true,
    // Scoped to this app's own tests: without this, vitest run from the repo
    // root also discovers api/test/** (node-only, needs mongodb-memory-server)
    // and migrate/**, and a filter like `-- routes` collides with
    // api/test/routes/*.test.js since that path also contains "routes".
    include: ['src/**/*.test.{js,jsx}'],
  },
})
