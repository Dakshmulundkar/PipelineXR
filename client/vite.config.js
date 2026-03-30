import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // eslint-disable-next-line no-undef
  const env = loadEnv(mode, process.cwd(), '')
  return {
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,

    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/auth/github': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/auth/user': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/auth/logout': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', () => {}); // suppress ECONNABORTED noise on tab close/refresh
        }
      }
    }
  },
  // In production (Netlify), VITE_API_BASE_URL points to the Railway backend.
  // The client/src/services/api.js reads import.meta.env.VITE_API_BASE_URL at build time.
  define: {
    __API_BASE__: JSON.stringify(env.VITE_API_BASE_URL || ''),
  }
  }
})
