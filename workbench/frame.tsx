/**
 * Точка входа кадра. Только стили и монтирование — всё остальное в
 * frame-app.tsx, чтобы кадр можно было отрисовать в тесте.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import '../fonts/inter.css'
import '../fonts/mono.css'
import './frame.css'
import { Frame } from './frame-app.js'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Frame />
  </StrictMode>,
)
