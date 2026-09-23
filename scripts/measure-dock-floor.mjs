#!/usr/bin/env node
/**
 * Пол дока — МАКСИМУМ по каталогу, и держать это утверждение живым может
 * только обход каталога (DS-141).
 *
 * ЧТО ЭТО ЗАКРЫВАЕТ. `DOCK_MIN_H` обещает одно: на полу первая крутилка видна
 * целиком. Число за этим обещанием снимали дважды и дважды с ОДНОГО компонента
 * — DataTable, где строка крутилки однострочная, — и оба раза получали
 * правдоподобный пол, режущий Badge и Button: их переключатель (`tone` из шести
 * значений, `variant` из пяти) переносится на второй ряд чипов, и строка там
 * 47.64 вместо 29.891. С DS-125 по DS-141 док резал у этих двоих
 * ровно ту крутилку, ради которой пол и считают.
 *
 * Санитар `dock-height.test.ts` этого не ловит и не может: он сверяет константу
 * со списком слагаемых, то есть держит число согласованным с ЗАМЕРОМ, а не с
 * каталогом. Новый компонент с широким переключателем не меняет ни одного
 * слагаемого — он меняет, кто худший, и оба файла остаются зелёными.
 *
 * ПОЧЕМУ РАВЕНСТВО, А НЕ «НЕ МЕНЬШЕ». Неравенству удовлетворяет `DOCK_MIN_H =
 * 9999` — пол, который «никого не режет», потому что перестал быть полом.
 * Равенство делает гейт переснятием замера: и заниженный пол, и раздутый
 * одинаково красные.
 *
 * ПОЧЕМУ ОБОЛОЧКА, А НЕ РАЗБОР ФИКСТУР. Высота строки зависит от переноса, а
 * перенос — от ширины колонки, которую раздаёт flex по числу колонок, то есть
 * по числу крутилок у ЭТОГО компонента. Считать это мимо раскладки значило бы
 * писать второй экземпляр flex и проверять его.
 *
 * ЗАМЕР ОБЯЗАН ИДТИ ПРИ deviceScaleFactor 1 — на дробном масштабе дисплея хром
 * снапит хэйрлайны и отдаёт `1px` как `0.869565px`. Довод целиком — в шапке
 * `DOCK_MIN_H`.
 *
 * И ЭТО ЗАМЕР КОНСЕРВАТИВНЫЙ, а не просто «в известных условиях» — проверено.
 * У дисплея владельца forced device scale factor 1.15, и вопрос «а не режет ли
 * пол ЕГО крутилку» стоял открытым: гейт при 1 его не видит по построению.
 * Обход каталога, повторённый при 1.15, даёт худший случай 104.049 против
 * 104.828 при 1 — то есть на дробном масштабе полу нужно МЕНЬШЕ, хэйрлайны там
 * тоньше. Пол 105 держит оба, и замер при 1 остаётся строже.
 *
 * ВОСПРОИЗВОДИТ ЭТО ТОЛЬКО ФЛАГ ЗАПУСКА, не настройка контекста. Сначала то же
 * мерили через `newContext({ deviceScaleFactor: 1.15 })` — и получили 104.828,
 * ровно то же число, что при 1: этот параметр меняет растр, а не то, что
 * отдаёт `getComputedStyle`. Ответ выглядел как «на 1.15 всё так же» и был
 * просто не про то. Настоящий инструмент —
 * `chromium.launch({ args: ['--force-device-scale-factor=1.15'] })`, он даёт
 * 104.049 и хэйрлайн 0.869565px.
 *
 * Usage: npm run dock-floor
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Константы берутся РАЗБОРОМ ИСХОДНИКА, а не импортом, — тем же способом и по
 * той же причине, что в гейте `dev-server-ports`: `dock-height.ts` это
 * TypeScript, а этот файл голый Node. Разбор здесь честнее сборки ради трёх
 * чисел. Ненайденное число роняет прогон ниже: правка формы записи обязана
 * краснеть, а не делать гейт слепым.
 */
const DH = readFileSync(resolve(ROOT, 'workbench/dock-height.ts'), 'utf8')
const num = (name) => {
  const m = DH.match(new RegExp(`export const ${name} = (\\d+)\\b`))
  return m ? Number(m[1]) : null
}
const str = (name) => {
  const m = DH.match(new RegExp(`export const ${name} = '([^']+)'`))
  return m ? m[1] : null
}
const DOCK_MIN_H = num('DOCK_MIN_H')
const DOCK_H_DEFAULT = num('DOCK_H_DEFAULT')
const DOCK_H_KEY = str('DOCK_H_KEY')

const fail = (msg) => {
  console.error(`ПОЛ ДОКА — ПРОВАЛ\n${msg}`)
  process.exit(1)
}

// Ненайденная константа роняет прогон ДО подъёма сервера: гейт, ослепший на
// форму записи, не имеет права сначала потратить сорок загрузок.
for (const [name, v] of [
  ['DOCK_MIN_H', DOCK_MIN_H],
  ['DOCK_H_DEFAULT', DOCK_H_DEFAULT],
  ['DOCK_H_KEY', DOCK_H_KEY],
]) {
  if (v === null) {
    fail(`${name} не найден разбором workbench/dock-height.ts — гейт ослеп на форму записи`)
  }
}

/**
 * СВОЙ порт и `--strictPort`, а не общий 5274. Разработчик держит верстак
 * поднятым службой, и прогон, молча подключившийся к ЕГО серверу, проверял бы
 * чужое дерево — в лучшем случае устаревшее. Список портов держит
 * `dev-server-ports`.
 */
const PORT = 5278
const HOST = '127.0.0.1'

/** Окно замера. То же, что названо в шапках `dock-height.ts`. */
const VIEWPORT = { width: 1600, height: 1000 }

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

async function waitForServer(url, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* ещё поднимается */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`дев-сервер верстака не поднялся: ${url}`)
}

await waitForServer(`http://${HOST}:${PORT}/`)

/**
 * Имена — ИЗ КАРТЫ ВИДОВ ТОГО ЖЕ СЕРВЕРА, а не обходом диска здесь
 * (DS-260). Прежний обход `src/components` был вторым списком фикстур:
 * `Icon` из `src/icons/` в верстаке появился, а сюда не попал бы — зелёным.
 * Список в этом файле протух бы на первом же новом компоненте, собственный
 * обход — на первом новом шаблоне; карта `virtual:ds-wb/kinds` — это ровно то,
 * из чего строится левая колонка, и её состав держит гейт `fixture-coverage`.
 * Путь `/@id/__x00__…` — так Vite отдаёт виртуальный модуль по сети.
 */
const kindsSrc = await (await fetch(`http://${HOST}:${PORT}/@id/__x00__virtual:ds-wb/kinds`)).text()
const kindsJson = kindsSrc.match(/^export const KINDS = (.*)$/m)
if (!kindsJson) {
  stopVite()
  fail(`карта видов не разобрана — гейт ослеп на форму модуля:\n${kindsSrc.slice(0, 300)}`)
}
const NAMES = JSON.parse(kindsJson[1]).map((r) => r.name).sort()

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
/**
 * Док раскрыт ЗАВЕДОМО ВЫШЕ пола: мерится не то, что видно, а то, сколько
 * нужно. На самом полу первая крутилка обрезана — именно это и проверяется, —
 * и её низ пришлось бы вычислять, а не читать.
 */
await ctx.addInitScript(
  ([key, h]) => {
    try {
      localStorage.setItem(key, String(h))
    } catch {
      /* приватное окно — умолчание тоже выше пола */
    }
  },
  [DOCK_H_KEY, DOCK_H_DEFAULT],
)
const page = await ctx.newPage()

const rows = []
for (const name of NAMES) {
  /**
   * `domcontentloaded` плюс два ЯВНЫХ ожидания, а не `networkidle`. Идущая
   * сеть тут ничего не обещает: крутилки приезжают сообщением из кадра, а не
   * запросом, — а `networkidle` стоил половины прогона (30с против 15с на
   * сорока одной загрузке).
   *
   * Ждать надо ровно двух вещей, и вторая неочевидна: `.wb__ctl` (кадр
   * доложил о крутилках) и `document.fonts.ready`. Ширина чипа — это ширина
   * ТЕКСТА, то есть до подмены шрифта переключатель мерится запасным и в ряд
   * ложится тот, который потом перенесётся. Молча и правдоподобно.
   */
  await page.goto(`http://${HOST}:${PORT}/?c=${name}&sid=1&theme=light`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector('.wb__ctl', { timeout: 15000 })
  await page.evaluate(() => document.fonts.ready)
  rows.push({
    name,
    ...(await page.evaluate(() => {
      const dock = document.querySelector('.wb__dock')
      const ctl = document.querySelector('.wb__ctl')
      const enumEl = ctl.querySelector('.wb__ctl-enum')
      const chips = enumEl ? [...enumEl.querySelectorAll('.wb__chip')] : []
      return {
        need: ctl.getBoundingClientRect().bottom - dock.getBoundingClientRect().top,
        ctlH: ctl.getBoundingClientRect().height,
        prop: ctl.querySelector('.wb__ctl-name')?.textContent ?? '?',
        rows: new Set(chips.map((b) => Math.round(b.getBoundingClientRect().top))).size,
        dpr: window.devicePixelRatio,
      }
    })),
  })
}

/**
 * СПРАВКА «≠ КЕЙС» НЕ ОТНИМАЕТ МЕСТО У ПРЕДМЕТА (DS-288).
 *
 * Строка крутилки — это поле (или чипы) и справка о нём: «≠ кейс · в кейсе:
 * <значение случая> ⟲». Справка появляется ровно тогда, когда полем
 * пользуются, и до этой задачи забирала у поля всю ширину: `flex: 1` без пола
 * против `white-space: nowrap` справки. `Drawer/open`, `title` покручен —
 * окно 1548 → поле 26.7px, 1024 → 15.5px и справка за правым краем крутилки
 * (замер браузерного агента; здесь, при dpr 1, те же 25.0 и 15.8).
 * Замер покоя (цикл выше) этого не видит по построению: там все значения равны
 * случаю и справки нет.
 *
 * Здесь же, а не отдельным раннером: та же оболочка, тот же сервер, тот же
 * `deviceScaleFactor 1`; расходится только состояние, и выставляется оно
 * АДРЕСОМ (`p.<prop>`), то есть тем же путём, каким ссылку открывает человек.
 *
 * Утверждения на каждой ширине окна:
 * 1. текстовое поле не уже ПОЛА — 12ch его собственного шрифта. Пол снимается
 *    зондом с кеглем и гарнитурой поля, а не читается из CSS: чтение
 *    `min-inline-size` было бы согласием правила с самим собой;
 * 2. справка (`.wb__ctl-was`) и сброс не выходят за правый край `.wb__ctl`;
 * 2а. и содержимое крутилки не шире её самой — пол, купленный горизонтальной
 *    прокруткой колонки, это тот же дефект, только спрятанный;
 * 3. у переключателя второй ряд чипов допустим, только если справка ушла на
 *    свою строку — та же болезнь в другом виде: чипы не сжимаются, они
 *    переносятся лишним рядом.
 *
 * Состояния различимы, а не каждое само по себе: справка ОБЯЗАНА быть видна
 * (иначе «ничего не выходит за край» зелено на строке, где выходить нечему), а
 * хотя бы на одной ширине она обязана уйти на свою строку, хотя бы раз её
 * значение обязано обрезаться (тогда проверен `title`), и переключатель хотя бы
 * раз обязан лечь в два ряда — иначе импликация в п. 3 истинна даром.
 */
const WIDE = [
  // Длинное значение случая: «Документ ТК-00417». Покрученное — короткое:
  // справка показывает значение СЛУЧАЯ, а не набранное.
  { c: 'Drawer', kase: 'open', prop: 'title', set: 'Всем привет', kind: 'text' },
  // Узкая колонка: у Form пятнадцать крутилок, на окне 1024 это 151px на
  // строку — уже, чем имя плюс пол поля. Без этого случая пол держался бы
  // родной шириной поля (`size=20`) и мутация «снять пол» выживала бы.
  { c: 'Form', kase: null, prop: 'title', set: 'Всем привет', kind: 'text' },
  // Самый широкий переключатель каталога (шесть тонов, в покое уже два ряда).
  { c: 'Badge', kase: null, prop: 'tone', set: 'error', kind: 'enum' },
]
const WINDOWS = [1024, 1548]
const problems = []
let sawWrapped = false
let sawClipped = false
let sawMultiRow = false
let sawSwap = false

const readCtl = (prop) =>
  page.evaluate((prop) => {
    const ctl = [...document.querySelectorAll('.wb__ctl')].find(
      (el) => el.querySelector('.wb__ctl-name')?.textContent === prop,
    )
    if (!ctl) return null
    const r = (el) => (el ? el.getBoundingClientRect() : null)
    const input = ctl.querySelector('input.wb__ctl-input')
    let floor = null
    if (input) {
      const cs = getComputedStyle(input)
      const probe = document.createElement('span')
      probe.style.cssText =
        `position:absolute;visibility:hidden;inline-size:12ch;` +
        `font-family:${cs.fontFamily};font-size:${cs.fontSize};font-weight:${cs.fontWeight}`
      document.body.appendChild(probe)
      floor = probe.getBoundingClientRect().width
      probe.remove()
    }
    const was = ctl.querySelector('.wb__ctl-was')
    const subject = input ?? ctl.querySelector('.wb__ctl-enum')
    const reset = ctl.querySelector('button[title="Сбросить к значению кейса"]')
    const chips = [...ctl.querySelectorAll('.wb__ctl-enum .wb__chip')]
    return {
      ctlRight: r(ctl).right,
      ctlW: r(ctl).width,
      ctlOverflow: ctl.scrollWidth - ctl.clientWidth,
      // «Своей строкой» — по ПРЕДМЕТУ (поле или ряд чипов), а не по обёртке:
      // гейт обязан отвечать и на разметке без неё, то есть краснеть на
      // прежнем плоском ряду, а не падать на нём.
      wrapped: was && subject ? r(was).top >= r(subject).bottom - 0.5 : null,
      inputW: input ? r(input).width : null,
      floor,
      wasRight: was ? r(was).right : null,
      wasClipped: was ? was.scrollWidth > was.clientWidth + 0.5 : null,
      wasTitle: was?.getAttribute('title') ?? null,
      resetRight: reset ? r(reset).right : null,
      chipRows: new Set(chips.map((b) => Math.round(b.getBoundingClientRect().top))).size,
      chipW: chips.map((b) => ({
        label: b.textContent,
        w: b.getBoundingClientRect().width,
        current: b.getAttribute('aria-pressed') === 'true',
      })),
    }
  }, prop)

for (const w of WINDOWS) {
  await page.setViewportSize({ width: w, height: VIEWPORT.height })
  for (const t of WIDE) {
    const base = `http://${HOST}:${PORT}/?c=${t.c}${t.kase ? `&case=${t.kase}` : ''}&sid=1&theme=light`
    const load = async (url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.wb__ctl', { timeout: 15000 })
      await page.evaluate(() => document.fonts.ready)
      return readCtl(t.prop)
    }
    const at = `${t.c}/${t.kase ?? 'base'} «${t.prop}», окно ${w}`
    const calm = await load(base)
    const moved = await load(`${base}&p.${t.prop}=${encodeURIComponent(t.set)}`)
    if (!calm || !moved) {
      problems.push(`${at}: крутилка не найдена — фикстура сменилась, гейт ослеп`)
      continue
    }
    if (moved.wasRight === null) {
      problems.push(`${at}: справка «≠ кейс» не появилась — состояние не выставлено, проверять нечего`)
      continue
    }
    if (moved.wrapped) sawWrapped = true
    if (moved.wasClipped) sawClipped = true
    const edge = moved.ctlRight + 0.5
    if (moved.ctlOverflow > 1) {
      problems.push(`${at}: содержимое крутилки шире её самой на ${moved.ctlOverflow}px — пол куплен прокруткой`)
    }
    if (moved.wasRight > edge || (moved.resetRight ?? 0) > edge) {
      problems.push(
        `${at}: справка вылезла за крутилку — правый край ${Math.max(moved.wasRight, moved.resetRight ?? 0).toFixed(1)} ` +
          `против ${moved.ctlRight.toFixed(1)}`,
      )
    }
    if (t.kind === 'text') {
      if (!(moved.inputW >= moved.floor - 0.5)) {
        problems.push(
          `${at}: поле ${moved.inputW?.toFixed(1)}px уже пола 12ch = ${moved.floor?.toFixed(1)}px ` +
            `(в покое ${calm.inputW?.toFixed(1)}px) — предмет строки отдал место`,
        )
      }
      if (moved.wasClipped && !moved.wasTitle) {
        problems.push(`${at}: значение случая обрезано, а полного текста в title нет`)
      }
      console.log(
        `  поле «${t.prop}» ${t.c}, окно ${w}: покой ${calm.inputW.toFixed(1)}, ` +
          `покручено ${moved.inputW.toFixed(1)}, пол ${moved.floor.toFixed(1)}, крутилка ${moved.ctlW.toFixed(1)}, справка ${moved.wrapped ? "своей строкой" : "в строке"}`,
      )
    } else {
      if (calm.chipRows < 1) problems.push(`${at}: чипов не найдено — гейт ослеп`)
      if (calm.chipRows > 1) sawMultiRow = true
      // ЧИП НЕ МЕНЯЕТ ШИРИНУ, СТАНОВЯСЬ ТЕКУЩИМ (DS-289). Текущий чип
      // жирный, и до резерва ширины смена значения сама двигала ряды — на окне
      // 1024 `neutral` → `error` давало 3 ряда → 2 при той же крутилке 336.8:
      // чип, в который целятся, уезжает на другой ряд. Утверждение — по
      // подписи, «покой» против «покручено», ±0.5px. Различимость состояний
      // обязательна: если текущий чип в двух загрузках один и тот же, сравнивать
      // «текущий против нетекущего» не на чем, и это отдельная жалоба.
      const was = calm.chipW.find((c) => c.current)?.label
      const now = moved.chipW.find((c) => c.current)?.label
      if (!was || !now || was === now) {
        problems.push(`${at}: текущий чип не сменился (${was ?? '—'} → ${now ?? '—'}) — резерв ширины не проверен`)
      } else {
        sawSwap = true
        for (const c of calm.chipW) {
          const m2 = moved.chipW.find((x) => x.label === c.label)
          if (!m2) continue
          if (Math.abs(m2.w - c.w) > 0.5) {
            problems.push(
              `${at}: чип «${c.label}» ${c.current ? 'текущий' : 'свободный'} ${c.w.toFixed(2)}px, ` +
                `${m2.current ? 'текущий' : 'свободный'} ${m2.w.toFixed(2)}px — ширина под жирное не зарезервирована`,
            )
          }
        }
        console.log(
          `  ширины чипов «${t.prop}» ${t.c}, окно ${w}: ` +
            calm.chipW.map((c) => `${c.label} ${c.w.toFixed(1)}→${moved.chipW.find((x) => x.label === c.label)?.w.toFixed(1)}`).join(', '),
        )
      }
      // Второй ряд чипов законен, только если справка ушла со строки
      // переключателя: справка не отнимает место у предмета (DS-288).
      if (moved.chipRows > 1 && !moved.wrapped) {
        problems.push(
          `${at}: чипы легли в ${moved.chipRows} ряд(а), а справка стоит с ними в одной строке — ` +
            `справка отняла место у переключателя`,
        )
      }
      console.log(
        `  чипы «${t.prop}» ${t.c}, окно ${w}: рядов ${calm.chipRows} → ${moved.chipRows}, ` +
          `крутилка ${calm.ctlW.toFixed(1)} → ${moved.ctlW.toFixed(1)}, справка ${moved.wrapped ? "своей строкой" : "в строке"}`,
      )
    }
  }
}
if (!problems.length && !sawWrapped) {
  problems.push(
    'ни на одной ширине справка не ушла на свою строку — перенос не проверен, ' +
      'длинное значение случая перестало быть длинным',
  )
}
if (!problems.length && !sawClipped) {
  problems.push(
    'ни на одной ширине значение случая в справке не обрезалось — многоточие и title ' +
      'не проверены, узкая колонка перестала быть узкой',
  )
}
if (!problems.length && !sawSwap) {
  problems.push('текущий чип ни разу не сменился — ширина «текущий против свободного» не сравнена, гейт ослеп')
}
if (!problems.length && !sawMultiRow) {
  problems.push(
    'переключатель ни на одной ширине не лёг в два ряда — проверять перенос чипов не на чем, ' +
      'выбран слишком короткий переключатель',
  )
}

await browser.close()

if (problems.length) {
  fail(`Справка «≠ кейс» против предмета крутилки:\n  ${problems.join('\n  ')}`)
}
console.log(
  `СПРАВКА «≠ КЕЙС» OK — поле не уже 12ch, чипы не теснятся, справка в крутилке: ` +
    `${WIDE.length} случая × окна ${WINDOWS.join(' и ')}.`,
)

/**
 * КАДР НЕ ЕДЕТ, КОГДА ТЯНУТ ДОК (DS-335).
 *
 * Высокий док делает поле ниже содержимого — появляется вертикальная полоса и
 * отнимает 15px у ширины поля; на полу дока полоса уходит. Кадр центрирован в
 * поле, и до `scrollbar-gutter: stable` прыгал на половину полосы: x 744.1 на
 * потолке против 751.6 на полу, на 360 и ширине кадра без изменений.
 *
 * СВОЙ БРАУЗЕР, а не общий: playwright по умолчанию запускает chromium с
 * `--hide-scrollbars`, и полоса в нём не занимает места ВОВСЕ — дефект там
 * невидим по построению, а утверждение зеленеет даром. Флаг снимается только
 * при запуске, и снять его у обхода выше значило бы менять раскладку, по
 * которой снят пол. Отсюда же предусловие: на потолке полоса обязана быть и
 * занимать место — иначе сравнивать нечего.
 *
 * Док ведётся НАСТОЯЩЕЙ ТЯГОЙ рукоятки, тем путём, каким это делает человек:
 * на потолок (поле упирается в свой пол — переполнение гарантировано на любом
 * окне), на пол, обратно на потолок.
 */
{
  const bb = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] })
  const p = await (await bb.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })).newPage()
  await p.goto(`http://${HOST}:${PORT}/?c=DataTable&sid=1&theme=light`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('.wb__ctl', { timeout: 15000 })
  await p.evaluate(() => document.fonts.ready)
  await p.click('button.wb__chip[data-label="360"]')
  const settle = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const read = () =>
    p.evaluate(() => {
      const f = document.querySelector('.wb__field')
      const w = document.querySelector('.wb__frame-wrap')
      return {
        dock: document.querySelector('.wb__dock').getBoundingClientRect().height,
        x: w.getBoundingClientRect().x,
        fw: w.getBoundingClientRect().width,
        bar: f.offsetWidth - f.clientWidth,
        over: f.scrollHeight > f.clientHeight + 0.5,
      }
    })
  const drag = async (dy) => {
    const g = await p.locator('.wb__dock-grip').boundingBox()
    await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
    await p.mouse.down()
    await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + dy, { steps: 4 })
    await p.mouse.up()
    await settle()
    return read()
  }
  await settle()
  const top1 = await drag(-VIEWPORT.height)
  const floor = await drag(VIEWPORT.height)
  const top2 = await drag(-VIEWPORT.height)
  await bb.close()
  const at = (s) => `док ${s.dock.toFixed(0)}: x ${s.x.toFixed(2)}, кадр ${s.fw}, полоса ${s.bar}`
  const seen = `\n  ${[top1, floor, top2].map(at).join('\n  ')}`
  if (floor.dock !== DOCK_MIN_H) {
    fail(`тяга вниз не довела док до пола ${DOCK_MIN_H} — рукоятка не отвечает, гейт ослеп:${seen}`)
  }
  if (!top1.over || !(top1.bar > 0)) {
    fail(
      `на потолке дока поле не переполнено или полоса не занимает места — сдвиг кадра ` +
        `невидим по построению, сравнивать нечего:${seen}`,
    )
  }
  if (floor.over) fail(`на полу дока поле всё ещё переполнено — второго состояния нет:${seen}`)
  // Худший из двух сдвигов: печатать только пол значило бы «едет на 0.00px»,
  // когда уехал обратный подъём.
  const drift = Math.max(Math.abs(floor.x - top1.x), Math.abs(top2.x - top1.x))
  if (drift > 0.5) {
    fail(
      `кадр едет, когда тянут док — на ${drift.toFixed(2)}px; место под полосу поля ` +
        `не зарезервировано (scrollbar-gutter у .wb__field):${seen}`,
    )
  }
  console.log(`КАДР НА МЕСТЕ OK — x ${top1.x.toFixed(2)} на доке ${top1.dock} и ${floor.dock}, полоса ${top1.bar}px.`)
}

/**
 * Пустой или короткий обход — это зелёный гейт, ничего не проверивший. Список
 * имён и список замеров сверяются отдельно: первый ловит фикстуру, до которой
 * не дошли, второй — компонент без крутилок, у которого `.wb__ctl` не дождались
 * бы вовсе.
 */
if (NAMES.length < 2) fail(`фикстур найдено ${NAMES.length} — обход выродился, гейт ослеп`)
if (rows.length !== NAMES.length) {
  fail(`замерено ${rows.length} из ${NAMES.length} — часть каталога не дошла до замера`)
}
const dpr = rows[0].dpr
if (dpr !== 1) fail(`devicePixelRatio ${dpr}, а нужен 1: хэйрлайны снапнуты, числа непригодны`)

rows.sort((a, b) => b.need - a.need)
const worst = rows[0]
const want = Math.ceil(worst.need)

const shown = rows.filter((r) => r.need > rows.at(-1).need + 0.5).slice(0, 5)
for (const r of shown.length ? shown : rows.slice(0, 3)) {
  console.log(
    `  ${r.need.toFixed(3).padStart(8)}  строка ${r.ctlH.toFixed(2).padStart(6)}` +
      `  чипов в ${r.rows} ряд(а)  ${r.name} / ${r.prop}`,
  )
}

if (DOCK_MIN_H !== want) {
  fail(
    `DOCK_MIN_H = ${DOCK_MIN_H}, а замер по ${rows.length} фикстурам даёт ${want}.\n` +
      `Худший случай — ${worst.name} (крутилка «${worst.prop}»): низ первой .wb__ctl ` +
      `на ${worst.need.toFixed(3)} от верха дока, строка ${worst.ctlH.toFixed(2)} ` +
      `в ${worst.rows} ряд(а) чипов.\n` +
      (DOCK_MIN_H < want
        ? `На полу ${DOCK_MIN_H} она подрезана на ${(worst.need - DOCK_MIN_H).toFixed(2)}px — ` +
          `док читается как сломанный, а не как свёрнутый.`
        : `Пол выше нужного на ${DOCK_MIN_H - want}px: док не сворачивается настолько, ` +
          `насколько мог бы, и число перестало быть замером.`) +
      `\nПереснять: npm run dock-floor (1600×1000, deviceScaleFactor 1).`,
  )
}

console.log(
  `ПОЛ ДОКА OK — ${DOCK_MIN_H} держит худший случай каталога ` +
    `(${worst.name}/${worst.prop}, ${worst.need.toFixed(3)}) по ${rows.length} фикстурам.`,
)
process.exit(0)
