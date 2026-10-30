import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // API_URL / API_KEY are not VITE_-prefixed, so they stay in the dev server and never reach the browser.
  // In production, api/[...path].ts does the same job on Vercel.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      proxy: {
        '/api': {
          target: env.API_URL || 'http://localhost:8703',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
          headers: { 'X-API-Key': env.API_KEY ?? '' },
          // Same admin-key gate as api/proxy.ts.
          bypass: (req, res) => {
            if (!/^\/api\/reset\/*(\?|$)/.test(req.url ?? '')) return
            const ok = env.ADMIN_KEY && req.headers['x-admin-key'] === env.ADMIN_KEY
            if (ok) return
            res!.statusCode = env.ADMIN_KEY ? 401 : 404
            res!.setHeader('content-type', 'application/json')
            res!.end(JSON.stringify({ error: env.ADMIN_KEY ? 'wrong admin key' : 'not found' }))
            return false
          },
        },
      },
    },
  }
})
