import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/agent05/',
  server: {
    port: 3000,
    proxy: {
      '/agent05/api': {
        target: 'http://127.0.0.1:8000',
        rewrite: (path) => path.replace(/^\/agent05/, '')
      },
      '/agent05/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        rewrite: (path) => path.replace(/^\/agent05/, '')
      }
    }
  }
})
