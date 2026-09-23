/**
 * Точка входа оболочки. Только стили и монтирование — всё остальное в
 * shell-app.tsx, чтобы оболочку можно было отрисовать в тесте.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../tokens/tokens.css'
import '../fonts/inter.css'
import '../fonts/mono.css'
import './shell.css'
import { Shell } from './shell-app.js'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
)
