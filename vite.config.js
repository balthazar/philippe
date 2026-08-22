import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
    setupFiles: './src/setupTests.js',
    globals: true,
    // Scoped to this app's own tests: without this, vitest run from the repo
    // root also discovers api/test/** (node-only, needs mongodb-memory-server)
    // and migrate/**, and a filter like `-- routes` collides with
    // api/test/routes/*.test.js since that path also contains "routes".
    include: ['src/**/*.test.{js,jsx}'],
  },
})
