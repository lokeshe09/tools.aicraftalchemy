import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    esbuildOptions: { target: 'es2022' },
    // FFmpeg spawns its own module worker; pre-bundling breaks its relative URL.
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
