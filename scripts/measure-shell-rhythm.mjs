#!/usr/bin/env node
/**
 * Ритм тулбара оболочки: группы разделены расстоянием, а не чертой
 * (DS-151).
 *
 * ЧТО ЭТО ЗАКРЫВАЕТ. Полоса тулбара — шесть с лишним групп подряд («ширина»,
 * «масштаб», «тема», «текст», «слои», «прицел», «вид»), и до правки они
 * различались чертой в 1px, а расстоянием — вдвое: 4.6px внутри группы против
 * 9.2 между. Двойную разницу в плотной полосе глаз не читает, и работу
 * разделения делала черта — пять вертикальных линий поверх двадцати контролов.
 * Убрав черту, отношение зазоров становится ЕДИНСТВЕННЫМ, что отделяет группы,
 * и оставлять его на честном слове нельзя: любая правка `gap` полосы
 * возвращает дефект молча.
 *
 * УТВЕРЖДЕНИЕ — ОТНОШЕНИЕ, А НЕ ЧИСЛО. Масштаб интерфейса умножает оба зазора
 * разом, и записанное число протухло бы на первой правке `--wb-z`. Порог 3
 * взят с запасом вниз от того, что даёт раскладка (5.0): гейт про «читается
 * как разные группы», а не про конкретные 23px.
 *
 * И ЭТО НЕ ЮНИТ-ТЕСТ. В jsdom нет раскладки: `gap`, `margin` и перенос полосы
 * там не считаются вовсе, любой прямоугольник нулевой. Санитар на классы
 * доказывает, что разметка эмитит группы; чему равен зазор, знает только
 * браузер.
 *
 * ПЕРЕНОС ПОЛОСЫ УЧТЁН: пары сравниваются только внутри одного ряда. На узком
 * экране полоса переносится, и «зазор» между последней группой строки и первой
 * группой следующей — это не зазор, а ширина экрана.
 *
 * Usage: npm run shell-rhythm
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Во сколько раз зазор МЕЖДУ группами обязан превосходить зазор ВНУТРИ. */
const MIN_RATIO = 3

/** Сколько групп в полосе должно быть, чтобы обход не выродился в тишину. */
const MIN_GROUPS = 4

/**
 * СВОЙ порт и `--strictPort`, а не общий 5274 — тем же доводом, что в
 * `measure-dock-floor.mjs`: разработчик держит верстак поднятым службой, и
 * прогон, молча подключившийся к ЕГО серверу, проверял бы чужое дерево.
 */
const PORT = 5279
const HOST = '127.0.0.1'
const VIEWPORT = { width: 1600, height: 1000 }

const fail = (msg) => {
  console.error(`РИТМ ТУЛБАРА — ПРОВАЛ\n${msg}`)
  process.exit(1)
}

const vite = spawn(
  'npm',
  ['run', 'wb', '--', '--port', String(PORT), '--strictPort', '--host', HOST],
  { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] },
)
const stopVite = () => {
  try {
    vite.kill('SIGTERM')
  } catch {
    /* уже мёртв */
  }
}
process.on('exit', stopVite)

const ready = async () => {
  for (let i = 0; i < 150; i += 1) {
    try {
      const r = await fetch(`http://${HOST}:${PORT}/`)
      if (r.ok) return
    } catch {
      /* ещё поднимается */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  fail(`vite не поднялся на ${HOST}:${PORT}`)
}
await ready()

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
const page = await ctx.newPage()

// `domcontentloaded` плюс ожидание группы и шрифтов — тем же доводом, что в
// `measure-dock-floor.mjs`: ширина чипа это ширина ТЕКСТА, и до подмены шрифта
// полоса мерится запасным.
await page.goto(`http://${HOST}:${PORT}/?c=DataTable&sid=1&theme=light`, {
  waitUntil: 'domcontentloaded',
})
await page.waitForSelector('.wb__bar .wb__group', { timeout: 15000 })
await page.evaluate(() => document.fonts.ready)

const m = await page.evaluate(() => {
  const bar = document.querySelector('.wb__bar')
  const groups = [...bar.querySelectorAll('.wb__group')]
  const rows = groups.map((g) => {
    const r = g.getBoundingClientRect()
    const kids = [...g.children].map((k) => k.getBoundingClientRect())
    let inner = 0
    for (let i = 1; i < kids.length; i += 1) {
      inner = Math.max(inner, kids[i].left - kids[i - 1].right)
    }
    return { label: g.getAttribute('aria-label') ?? '?', top: Math.round(r.top), left: r.left, right: r.right, inner }
  })
  const between = []
  for (let i = 1; i < rows.length; i += 1) {
    // Только внутри одного ряда: на переносе «зазор» это ширина экрана.
    if (rows[i].top === rows[i - 1].top) {
      between.push({ pair: `${rows[i - 1].label} → ${rows[i].label}`, gap: rows[i].left - rows[i - 1].right })
    }
  }
  // Черта, если она вернётся, видна отдельно: у группы не должно быть
  // содержательного ::before. Проверяется НЕ вместо отношения, а вместе с ним —
  // черта поверх правильного ритма это уже вопрос вкуса, а не читаемости.
  const line = groups.some((g) => getComputedStyle(g, '::before').content !== 'none')
  return { rows, between, line, dpr: window.devicePixelRatio }
})

/**
 * ПОМЕТКА «НЕ ИЗ НАБОРА» ВИДОМ НЕ НАЖАТЫЙ ЧИП (DS-164, приёмка).
 *
 * Шкала из адреса вне набора (`1.25`) показывается в группе «Масштаб»
 * пометкой. Первая редакция ставила на неё `is-current` плюс пунктир — и по
 * computed style пометка совпала с нажатым `1.15×` во всём: заливка, текст,
 * вес; пунктир был цветом заливки на фоне шапки и не рисовал ни пикселя. Глазом
 * это нажатая кнопка с длинной подписью. «Класса `is-current` нет» — проверка
 * разметки, а не вида (writing-checks, п. 4), поэтому здесь каскад:
 * 1. заливка пометки ≠ заливке нажатого чипа той же группы;
 * 2. рамка пометки пунктирная, ненулевая, и её цвет отличается и от
 *    ДЕЙСТВУЮЩЕГО фона под пометкой, и от фона шапки — именно это приёмка
 *    поймала глазом. «Отличается» — не `!==` строк, а разница хотя бы в
 *    MIN_EDGE единиц по каналу: `rgb(34,34,34)` против `rgb(35,34,34)` строкой
 *    различны, а глазом нет. MIN_EDGE — одна ступень лестницы `--wb-*` (0x11):
 *    ровно на ней нажатый чип (`--wb-3`) отличается от шапки (`--wb-2`), то
 *    есть это различие, на котором хром уже держит «нажато». Порог выше
 *    объявил бы невидимым сам нажатый чип.
 * Нажатый чип берётся со страницы `?scale=1.15`, а не из соседней группы:
 * утверждение про ту пару, которую перепутал глаз.
 */
const MIN_EDGE = 0x11

const colourOf = (page) =>
  page.evaluate(() => {
    const parse = (s) => {
      const n = s.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]
      return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 }
    }
    // Действующий фон — с учётом прозрачности: прозрачная пометка стоит на
    // фоне шапки, и сравнивать рамку надо с тем, что под ней нарисовано.
    const effective = (el) => {
      const stack = []
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor)
        stack.push(c)
        if (c.a >= 1) break
      }
      let out = { r: 255, g: 255, b: 255 }
      for (const c of stack.reverse()) {
        out = { r: c.r * c.a + out.r * (1 - c.a), g: c.g * c.a + out.g * (1 - c.a), b: c.b * c.a + out.b * (1 - c.a) }
      }
      return out
    }
    const group = document.querySelector('[role="group"][aria-label="Масштаб"]')
    const bar = document.querySelector('.wb__bar')
    const marker = group?.querySelector('.wb__chip--foreign') ?? null
    const pressed = group?.querySelector('.wb__chip[aria-pressed="true"]') ?? null
    const read = (el) => {
      if (!el) return null
      const cs = getComputedStyle(el)
      return {
        bg: parse(cs.backgroundColor),
        eff: effective(el),
        border: parse(cs.borderTopColor),
        borderStyle: cs.borderTopStyle,
        borderW: parseFloat(cs.borderTopWidth),
        weight: cs.fontWeight,
        text: el.textContent,
      }
    }
    return { marker: read(marker), pressed: read(pressed), bar: bar ? effective(bar) : null }
  })

const dist = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b))
const rgb = (c) => `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`

await page.goto(`http://${HOST}:${PORT}/?c=DataTable&sid=1&theme=light&scale=1.15`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[role="group"][aria-label="Масштаб"] .wb__chip[aria-pressed="true"]', { timeout: 15000 })
const inSet = await colourOf(page)

/**
 * ЧИП НЕ МЕНЯЕТ ШИРИНУ, СТАНОВЯСЬ НАЖАТЫМ (DS-289). Нажатый чип жирный,
 * и до резерва ширины он был шире свободного: выбор значения двигал соседей
 * под курсором, а в переносящейся полосе — перекладывал ряды. Замер на группе
 * «Масштаб»: ширины всех чипов при нажатом `1.15×` и после щелчка по `1.5×`,
 * по подписи, ±0.5px. Шкала — свойство кадра, хром от неё не растёт, так что
 * расходиться ширинам нечем, кроме начертания. Пара меняет нажатый чип
 * (1.15 → 1.5), иначе сравнивать «нажатый против свободного» не на чем.
 */
const scaleChips = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[role="group"][aria-label="Масштаб"] button.wb__chip')].map((b) => ({
      label: b.textContent,
      w: b.getBoundingClientRect().width,
      pressed: b.getAttribute('aria-pressed') === 'true',
    })),
  )
await page.evaluate(() => document.fonts.ready)
const chipsBefore = await scaleChips()
await page.click('[role="group"][aria-label="Масштаб"] button.wb__chip:text-is("1.5×")')
await page.waitForSelector('[role="group"][aria-label="Масштаб"] button.wb__chip[aria-pressed="true"]:text-is("1.5×")', { timeout: 5000 })
const chipsAfter = await scaleChips()
const reserve = []
const pb = chipsBefore.find((c) => c.pressed)?.label
const pa = chipsAfter.find((c) => c.pressed)?.label
if (chipsBefore.length < 2 || !pb || !pa || pb === pa) {
  reserve.push(`нажатый чип не сменился (${pb ?? '—'} → ${pa ?? '—'}, чипов ${chipsBefore.length}) — гейт ослеп`)
} else {
  for (const c of chipsBefore) {
    const a = chipsAfter.find((x) => x.label === c.label)
    if (!a) {
      reserve.push(`чип «${c.label}» пропал после щелчка — гейт ослеп`)
      continue
    }
    if (Math.abs(a.w - c.w) > 0.5) {
      reserve.push(
        `«${c.label}» ${c.pressed ? 'нажатый' : 'свободный'} ${c.w.toFixed(2)}px, ` +
          `${a.pressed ? 'нажатый' : 'свободный'} ${a.w.toFixed(2)}px — ширина под жирное не зарезервирована`,
      )
    }
  }
}
console.log(
  `   ширины «Масштаб» (${pb} → ${pa}): ` +
    chipsBefore.map((c) => `${c.label} ${c.w.toFixed(1)}→${chipsAfter.find((x) => x.label === c.label)?.w.toFixed(1)}`).join(', '),
)
await page.goto(`http://${HOST}:${PORT}/?c=DataTable&sid=1&theme=light&scale=1.25`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[role="group"][aria-label="Масштаб"] .wb__chip--foreign', { timeout: 15000 })
const off = await colourOf(page)

await browser.close()
stopVite()

const foreign = []
if (!inSet.pressed) foreign.push('на ?scale=1.15 нажатого чипа нет — сравнивать не с чем, гейт ослеп')
if (!off.marker) foreign.push('на ?scale=1.25 пометки нет — сравнивать нечего, гейт ослеп')
if (!off.bar) foreign.push('шапка .wb__bar не найдена — гейт ослеп')
if (!foreign.length) {
  const { marker } = off
  const pressed = inSet.pressed
  if (dist(marker.eff, pressed.eff) < MIN_EDGE) {
    foreign.push(
      `заливка пометки ${rgb(marker.eff)} почти равна заливке нажатого чипа ${rgb(pressed.eff)} — читается как нажатая кнопка`,
    )
  }
  if (marker.borderStyle !== 'dashed' || !(marker.borderW > 0)) {
    foreign.push(`рамка пометки ${marker.borderStyle} ${marker.borderW}px — пунктира нет`)
  }
  const edge = { ...marker.border }
  if (dist(edge, marker.eff) < MIN_EDGE) {
    foreign.push(`цвет пунктира ${rgb(edge)} почти равен фону под пометкой ${rgb(marker.eff)} — пунктир не виден`)
  }
  if (dist(edge, off.bar) < MIN_EDGE) {
    foreign.push(`цвет пунктира ${rgb(edge)} почти равен фону шапки ${rgb(off.bar)} — пунктир не виден`)
  }
  console.log(
    `   пометка: фон ${rgb(marker.eff)}, пунктир ${rgb(edge)} ${marker.borderStyle}, вес ${marker.weight}; ` +
      `нажатый «${pressed.text}»: фон ${rgb(pressed.eff)}, вес ${pressed.weight}; шапка ${rgb(off.bar)}`,
  )
}

if (m.dpr !== 1) fail(`devicePixelRatio ${m.dpr}, а нужен 1: числа непригодны`)
if (m.rows.length < MIN_GROUPS) {
  fail(`групп в полосе ${m.rows.length} — замер выродился, гейт ослеп`)
}
if (m.between.length === 0) {
  fail('ни одной пары групп в одном ряду — сравнивать нечего, гейт ослеп')
}

// Группа из одного ребёнка внутреннего зазора не имеет — её `inner` равен нулю
// и занизил бы максимум, то есть сделал бы гейт добрее. Максимум берётся по
// тем, у кого зазор вообще есть.
const inners = m.rows.map((r) => r.inner).filter((v) => v > 0)
if (inners.length === 0) fail('ни в одной группе нет двух соседей — внутренний зазор не измерить')
const maxInner = Math.max(...inners)
const minBetween = Math.min(...m.between.map((b) => b.gap))
const ratio = minBetween / maxInner

for (const b of m.between) {
  console.log(`   ${b.gap.toFixed(1).padStart(6)}  ${b.pair}`)
}
console.log(`   внутри групп максимум ${maxInner.toFixed(1)}`)

if (m.line) {
  fail('у группы вернулась черта (::before): разделять положено расстоянием, шесть групп дают пять линий')
}
if (ratio < MIN_RATIO) {
  fail(
    `между группами минимум ${minBetween.toFixed(1)}, внутри максимум ${maxInner.toFixed(1)} — `
      + `отношение ${ratio.toFixed(2)} против нужных ${MIN_RATIO}. Группы сливаются в одну ленту.`,
  )
}
console.log(
  `РИТМ ТУЛБАРА OK — между группами ${minBetween.toFixed(1)} против ${maxInner.toFixed(1)} внутри, `
    + `отношение ${ratio.toFixed(2)} при пороге ${MIN_RATIO}, ${m.rows.length} групп.`,
)

if (foreign.length) fail(`Пометка «не из набора» против нажатого чипа:\n  ${foreign.join('\n  ')}`)
console.log('ПОМЕТКА «НЕ ИЗ НАБОРА» OK — не заливка нажатого чипа, пунктир виден на шапке.')

if (reserve.length) fail(`Резерв ширины нажатого чипа:\n  ${reserve.join('\n  ')}`)
console.log('РЕЗЕРВ ШИРИНЫ OK — чипы «Масштаб» не меняют ширину, становясь нажатыми.')
