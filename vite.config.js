import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Verification codes are generated and checked on the mail server so the
// browser never sees them. Both the dev server and `vite preview` need to
// forward /api — `server.proxy` does not apply to preview, and without this
// the built app answers 404 for every auth request.
const proxy = {
  '/api': {
    target: `http://localhost:${process.env.VERIFY_PORT || 8787}`,
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react()],
  server: { port: 5200, proxy },
  preview: { port: 4173, proxy },
})
