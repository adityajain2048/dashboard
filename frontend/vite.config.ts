import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: 'https://bridge-dashboard.blackmeadow-8da7a938.japaneast.azurecontainerapps.io', changeOrigin: true, secure: true },
      '/enso-api': { target: 'https://api.enso.finance', changeOrigin: true, rewrite: (path: string) => path.replace(/^\/enso-api/, '/api') },
      '/llama-api': { target: 'https://api.llama.fi', changeOrigin: true, rewrite: (path: string) => path.replace(/^\/llama-api/, '') },
    },
  },
})
