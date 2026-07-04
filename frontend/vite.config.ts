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
      '/course.v1.CourseService': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/material.v1.MaterialService': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/assignment.v1.AssignmentService': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/dashboard.v1.DashboardService': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/class.v1.ClassService': {
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
