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
import { installFrameJig } from './jig.js'

// ДО createRoot: `params.address` кадра читает `location.search`, захваченный
// до первого зеркала (`history.replaceState` через 250 мс) — тем же доводом,
// что и парсинг адреса самим `Frame` (JIG-40, спецификация раздел 0).
installFrameJig(window)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Frame />
  </StrictMode>,
)
