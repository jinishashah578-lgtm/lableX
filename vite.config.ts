import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Browsers only expose the camera on a secure origin. http://localhost counts
// as one, so the default plain-HTTP server is enough on this machine. Reaching
// the app from a phone means a LAN address, which does not count -- so
// `npm run dev:https` serves the same app over HTTPS with a self-signed
// certificate. The browser warns about that certificate once; accept it and the
// camera works.
const https = process.env.LABELX_HTTPS === '1'

export default defineConfig({
  plugins: [react(), ...(https ? [basicSsl()] : [])],
  server: {
    port: 5173,
    // Bind to every interface so the app can be opened from a phone on the
    // same network.
    host: true,
    proxy: {
      '/api': {
        target: process.env.LABELX_API ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
