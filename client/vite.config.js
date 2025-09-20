import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite läuft in DEV als Middleware in Express (gleicher Port)
// => Hier plugin-react EINMAL konfigurieren
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
