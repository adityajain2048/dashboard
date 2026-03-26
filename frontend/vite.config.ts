import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: 'https://bridge-dashboard.blackmeadow-8da7a938.japaneast.azurecontainerapps.io', changeOrigin: true, secure: true },
    },
  },
})
