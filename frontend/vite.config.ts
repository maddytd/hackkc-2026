import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Allow access through a tunnel host (e.g. *.trycloudflare.com) for sharing a demo.
    allowedHosts: true,
    // When VITE_API_URL=/api, same-origin calls are proxied to the local backend,
    // so the whole app works behind a single public URL with no CORS setup.
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
