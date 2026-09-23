import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only playground (`npm run demo`). Not part of the package build.
export default defineConfig({
  root: 'demo',
  plugins: [react()],
  // `strictPort` по той же причине, что в верстаке (DS-123): молча уехать
  // на соседний порт — значит показать человеку не тот сервер, который он открыл.
  server: { port: 5273, strictPort: true, open: false },
})
