import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  build: {
    // Production output goes directly into the Go embed directory
    outDir: '../backend/cmd/server/frontend',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Forward ALL ConnectRPC calls (/<pkg>.v1.<Service>/<Method>) to the Go
      // backend during development. Regex so new services need no config change.
      '^/[a-z0-9_]+\\.v1\\.[A-Za-z0-9]+Service/': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // Material cover images served as binary by the Go backend
      '/covers': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
