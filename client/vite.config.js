/* global process */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
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
            proxy.on('error', () => {});
          }
        }
      }
    },
    define: {
      __API_BASE__: JSON.stringify(env.VITE_API_BASE_URL || ''),
    }
  }
})
