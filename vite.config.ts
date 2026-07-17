import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')
          if (!normalizedId.includes('node_modules')) return

          if (
            normalizedId.includes('/react/') ||
            normalizedId.includes('/react-dom/') ||
            normalizedId.includes('/scheduler/')
          ) {
            return 'vendor-react'
          }

          if (
            normalizedId.includes('@tauri-apps/api') ||
            normalizedId.includes('@tauri-apps/plugin-dialog') ||
            normalizedId.includes('@tauri-apps/plugin-fs')
          ) {
            return 'vendor-tauri'
          }

          if (
            normalizedId.includes('@tiptap/core') ||
            normalizedId.includes('@tiptap/react') ||
            normalizedId.includes('@tiptap/starter-kit') ||
            normalizedId.includes('@tiptap/extension-placeholder') ||
            normalizedId.includes('@tiptap/extension-underline')
          ) {
            return 'editor-tiptap'
          }

          if (normalizedId.includes('recharts')) {
            return 'charts-recharts'
          }

          if (
            normalizedId.includes('@react-sigma/core') ||
            normalizedId.includes('/sigma/') ||
            normalizedId.includes('/graphology/') ||
            normalizedId.includes('graphology-layout-forceatlas2') ||
            normalizedId.includes('graphology-communities-louvain')
          ) {
            return 'graph-sigma'
          }

          if (normalizedId.includes('d3-force')) {
            return 'graph-d3'
          }
        },
      },
    },
  },
  clearScreen: false,
})
