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
      // Forward all ConnectRPC calls to the Go backend during development
      '/user.v1.UserService': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
