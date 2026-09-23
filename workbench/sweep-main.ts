/**
 * Точка входа `sweep.html` (DS-219): ставит `window.__dsSweep` и рисует
 * последний отчёт таблицей нарушений — для глаз владельца; агент читает
 * объект, а не таблицу.
 */
import './sweep.css'
import { run, type SweepResult } from './sweep.js'
import type { SweepSpec } from './sweep-plan.js'

const USAGE = `await __dsSweep.run({
  c: 'Pagination', cases: ['base'], widths: [300, 360, 900], scales: [1, 1.5],
  targets: [{ name: 'next', selector: '.ds-pagination__next' }],
  invariants: [{ metric: 'h', min: 24 }, { metric: 'h', grows: 'scale' }, { fits: true }],
})
// отчёт: __dsSweep.last — { live, summary, violations, cells, ms }`

const root = document.getElementById('root')!
root.className = 'sw'
const usage = document.createElement('pre')
usage.className = 'sw__usage'
usage.textContent = USAGE
const summary = document.createElement('p')
summary.className = 'sw__summary'
const stage = document.createElement('div')
stage.className = 'sw__stage'
const table = document.createElement('table')
table.className = 'sw__table'
root.append(usage, summary, stage, table)

function render(r: SweepResult): void {
  summary.textContent = r.summary
  summary.classList.toggle('sw__summary--sleep', !r.live)
  table.replaceChildren()
  const head = table.insertRow()
  for (const h of ['правило', 'где', 'получено']) {
    const th = document.createElement('th')
    th.textContent = h
    head.append(th)
  }
  for (const v of r.violations) {
    const tr = table.insertRow()
    for (const s of [v.rule, v.at, v.got]) tr.insertCell().textContent = s
  }
}

declare global {
  interface Window {
    __dsSweep: {
      run: (spec: SweepSpec) => Promise<SweepResult>
      last: SweepResult | null
      error: string | null
      busy: boolean
    }
  }
}

window.__dsSweep = {
  last: null,
  error: null,
  busy: false,
  async run(spec) {
    const api = window.__dsSweep
    api.busy = true
    api.error = null
    try {
      const r = await run(spec, stage)
      api.last = r
      render(r)
      return r
    } catch (e) {
      api.error = String(e)
      summary.textContent = api.error
      throw e
    } finally {
      api.busy = false
    }
  },
}
