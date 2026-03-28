import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  // In production, Django/WhiteNoise serves static files at /static/.
  // Setting base here makes Vite prefix all asset references in index.html
  // with /static/ so they match what WhiteNoise actually serves.
  // In dev, base is '/' so the Vite dev server works normally at localhost:5173.
  base: process.env.NODE_ENV === 'production' ? '/static/' : '/',

  server: {
    proxy: {
      // In desktop dev mode, Django runs via run_server.py on :8765 (not :8000).
      // Any /api/* request from Vite is forwarded there automatically.
      '/api': {
        target: 'http://localhost:8765',
        changeOrigin: true,
      },
    },
  },
})
