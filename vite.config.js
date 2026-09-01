import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5200,
    proxy: {
      // Verification codes are generated and checked on the server so the
      // browser never sees them.
      '/api': {
        target: `http://localhost:${process.env.VERIFY_PORT || 8787}`,
        changeOrigin: true,
      },
    },
  },
})
