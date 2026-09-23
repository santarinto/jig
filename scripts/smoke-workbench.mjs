#!/usr/bin/env node
/**
 * Верстак целиком, в настоящем браузере, на настоящем дев-сервере.
 *
 * ЗАЧЕМ ОН ЕСТЬ. DS-68: «Фактический размер» в панели полгода показывал
 * `—`, при том что ОБЕ половины механизма были покрыты зелёными unit-тестами
 * (`frame-size.test.ts` мерил объединение боксов, `shell-size.test.tsx` — что
 * пришедшее число печатается). Не работал шов между ними, а швов в верстаке
 * ровно столько, сколько сообщений в протоколе: `ready`, `size`, `force-stats`,
 * `tabstops`, `aim`, `kinds`, патч вниз. jsdom не видит ни одного из них
 * по-настоящему — там нет ни `<iframe>` с документом, ни каскада, ни
 * раскладки, — и «зелёная проверка, которая ничего не проверяет» живёт именно
 * здесь.
 *
 * Поэтому смок утверждает ЧИСЛА, а не наличие узлов: 708 против заданных 768 —
 * это ответ инструмента на вопрос, ради которого он заведён.
 *
 * НЕ В `check` НАМЕРЕННО: поднимает Vite и браузер, это секунды, а `check`
 * держат быстрым ради цикла правки. Живёт в `check-full` — там же, где
 * остальные проверки «доедет ли», — и вызывается руками через `make wb-smoke`.
 *
 * Usage: npm run smoke:wb
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/**
 * СВОЙ порт и `--strictPort`, а не общий 5274. Разработчик держит верстак
 * поднятым, и прогон, молча подключившийся к ЕГО серверу, проверял бы чужое
 * дерево — в лучшем случае устаревшее. Занятый порт валит запуск, а не
 * подменяет предмет проверки.
 */
const PORT = 5275

/**
 * `--host 127.0.0.1`, и адреса ниже тоже по IP, а не по имени.
 *
 * Vite по умолчанию слушает `localhost`, и на этой машине это ТОЛЬКО `[::1]`:
 * `fetch('http://localhost:5275/')` из Node уходит на 127.0.0.1 и падает
 * мгновенно — все 80 попыток подряд, при живом сервере. Симптом («дев-сервер
 * не поднялся») врал: сервер поднимался за 106 мс. Имя хоста здесь лишний
 * посредник — предмет проверки от него не зависит.
 */
const HOST = '127.0.0.1'

const vite = spawn(
  'npm',
  ['run', 'wb', '--', '--port', String(PORT), '--strictPort', '--host', HOST],
  {
    cwd: ROOT,
    // stderr наружу: молчащий запуск оставляет от любой поломки Vite одну
    // строку «не поднялся», по которой чинить нечего.
    stdio: ['ignore', 'ignore', 'inherit'],
  },
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

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errs = []
// Запросы за модулями фикстур — предмет DS-67. Слушатель ставится сразу,
// а считается РАЗНИЦА вокруг открытия выбора начинки: сам кадр свою фикстуру
// грузит законно, и общее число здесь ничего не различает.
const fixtureReqs = []
page.on('request', (r) => {
  if (/\.fixture\.tsx/.test(r.url())) fixtureReqs.push(r.url())
})
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(`console: ${m.text()}`)
})

const fails = []
const check = (ok, line) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${line}`)
  if (!ok) fails.push(line)
}

// 0a. Адрес предиката гейта (DS-222), тоже ДО браузера: это про HTTP.
//     Юниты проверяют ТОЖДЕСТВО (адрес ре-экспортирует тот же файл, который
//     исполняет гейт) и границу, вызывая обработчик плагина напрямую. Здесь
//     проверяется единственное, чего они не видят: что плагин действительно
//     повешен в КОНФИГЕ и живой сервер отвечает. Разойтись эти два состояния
//     могут молча — плагин, забытый в `plugins`, зелен во всех юнитах.
{
  const get = async (path) => {
    const r = await fetch(`http://${HOST}:${PORT}${path}`)
    return { status: r.status, type: r.headers.get('content-type') ?? '', body: await r.text() }
  }
  const good = await get('/api/gate/predicate/target-size')
  check(
    good.status === 200 && good.type.includes('javascript')
      && good.body.includes('as run') && good.body.includes('/@fs'),
    `предикат отдаётся модулем: ${good.status} ${good.type.split(';')[0]}, `
      + `ре-экспорт ${good.body.includes('as run') ? 'есть' : 'НЕТ'}`,
  )
  // Путь ВНУТРИ адреса, а не `..` в сыром виде: голые `..` схлопывает сам
  // HTTP-клиент ещё до сервера, и такая проверка мерила бы нормализацию URL, а
  // не границу сервиса. Закодированный отрезок доезжает до обработчика целым.
  const bad = await get(`/api/gate/predicate/${encodeURIComponent('../vite.workbench.config.ts')}`)
  check(
    bad.status === 404 && !bad.body.includes('defineConfig'),
    `путь вместо имени — отказ, а не файл: ${bad.status}, `
      + `конфиг ${bad.body.includes('defineConfig') ? 'ПРИЕХАЛ' : 'не приехал'}`,
  )
}

// 0. Честный ответ под `/previews/` (DS-223), ДО браузера — это про
//    HTTP, а не про оболочку. Обе половины сразу и в обе стороны: закрыть всё
//    глухим 404 зелено по одной половине и ломает второй, открыть всё —
//    исходный дефект, где сервер отвечал 200 и присылал оболочку верстака.
{
  const get = async (path) => {
    const r = await fetch(`http://${HOST}:${PORT}${path}`)
    return { status: r.status, body: await r.text() }
  }
  const real = await get('/previews/modal.html')
  check(
    real.status === 200 && real.body.includes('ds-modal__close') && !real.body.includes('<div id="root">'),
    `существующее превью отдаёт разметку компонента: ${real.status}, `
      + `ds-modal__close ${real.body.includes('ds-modal__close') ? 'есть' : 'НЕТ'}, `
      + `оболочка ${real.body.includes('<div id="root">') ? 'ПРИЕХАЛА' : 'не приехала'}`,
  )
  // Лист смотрит в исходник системы, а не в никуда: относительный
  // `../src/styles.css` под корнем `workbench` не разрешается ни во что, и
  // превью открылось бы без стилей — «открылось», но не о том.
  const href = /<link rel="stylesheet" href="([^"]+)"/.exec(real.body)?.[1] ?? ''
  const sheetRes = href ? await fetch(`http://${HOST}:${PORT}${href}`) : null
  const sheetType = sheetRes?.headers.get('content-type') ?? '—'
  const sheetBody = sheetRes ? await sheetRes.text() : ''
  // ТИП ответа, а не только код: без `?direct` vite отдаёт на `.css` модуль JS,
  // и `<link rel="stylesheet">` его отвергает — 200 приходит в обоих случаях.
  check(
    sheetRes?.status === 200 && /text\/css/.test(sheetType) && /--ds-/.test(sheetBody),
    `лист превью грузится настоящим CSS: ${href || '—'} → ${sheetRes?.status ?? 0}, `
      + `${sheetType}, ${sheetBody.length} байт`,
  )
  const ghost = await get('/previews/nope.html')
  check(
    ghost.status === 404 && !ghost.body.includes('<div id="root">'),
    `несуществующее превью отказано: ${ghost.status}, `
      + `оболочка ${ghost.body.includes('<div id="root">') ? 'ПРИЕХАЛА' : 'не приехала'}`,
  )
  // И контроль в обратную сторону: фолбэк оболочки жив для СВОИХ маршрутов.
  // Без него «стало отвечать 404» проходило бы и на заглушке, накрывшей всё.
  const shell = await get('/')
  check(
    shell.status === 200 && shell.body.includes('<div id="root">'),
    `SPA-фолбэк оболочки жив: / → ${shell.status}`,
  )
}

const group = (name) => page.getByRole('group', { name })
const view = (name) => group('Вид').getByRole('button', { name })
const size = () => page.locator('[aria-label="Фактический размер"]').textContent()
const pickWidth = async (w) => {
  await group('Ширина кадра').getByRole('button', { name: String(w) }).click()
  await page.waitForTimeout(600)
}
// `exact: true` обязателен, а не аккуратность: без него «Badge» совпадал и с
// «OrgBadge», и прогон падал строгим режимом плейрайта — но только с того
// момента, как в списке появилось второе похожее имя (DS-90). Пока
// фикстур было две, нестрогое совпадение выглядело работающим.
const pickComponent = async (name) => {
  await page
    .getByRole('navigation', { name: 'Компоненты' })
    .getByRole('button', { name, exact: true })
    .click()
  await page.waitForTimeout(1400)
}

await page.goto(`http://${HOST}:${PORT}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

/**
 * Константы дока СПРАШИВАЮТСЯ У ПРИЛОЖЕНИЯ, а не держатся здесь копией.
 *
 * До DS-206 в этом файле лежали литералы 76 и 120, а приложение с
 * DS-141 работало на 105 и 121 — семь проверок падали БЕЗ дефекта, и
 * падали долго: `smoke:wb` живёт только в `check-full`, а его гоняют перед
 * релизом, где красное читается как «что-то с окружением». Правило простое:
 * второй копии числа не заводить, даже когда язык мешает (скрипт `.mjs`,
 * константы в `.ts`).
 *
 * Мешает он несильно: страницу обслуживает тот же Vite, поэтому модуль
 * импортируется В БРАУЗЕРЕ по своему адресу и отдаёт ровно те значения, на
 * которых работает оболочка. Ни сборки, ни лишней цели в Makefile.
 *
 * ЧТО ЭТО НЕ ОСЛАБЛЯЕТ. Импортировать значение, которое проверяешь, было бы
 * дырой, если бы предметом был САМ РАЗМЕР. Но предмет здесь — ПОВЕДЕНИЕ
 * зажима: «дотянул до упора — поле удержало свой минимум», «дотянул вниз —
 * док остался доком». Правильность самих чисел держат двое других и по
 * отдельности: `dock-floor` меряет пол по всему каталогу фикстур, а
 * `workbench/dock-height.test.ts` выводит обе константы из слагаемых. Смок,
 * повторяющий их третьим списком, проверял бы не поведение, а совпадение
 * трёх копий — что и вышло.
 */
const [DOCK_MIN, FIELD_MIN] = await page.evaluate(
  async () => {
    const m = await import('/dock-height.ts')
    return [m.DOCK_MIN_H, m.FIELD_MIN_H]
  },
)
check(
  Number.isFinite(DOCK_MIN) && Number.isFinite(FIELD_MIN),
  `константы дока прочитаны у приложения: пол ${DOCK_MIN}, минимум поля ${FIELD_MIN}`,
)

console.log('Верстак, живой прогон:')

// 1. Шов `size`: кадр мерит и шлёт, оболочка печатает. Тот самый DS-68.
await pickWidth(768)
const at768 = await size()
await pickWidth(1440)
const at1440 = await size()
check(/^\d+×\d+$/.test(at768 ?? ''), `фактический размер — число, а не «${at768}»`)
check(at768 !== at1440, `размер меняется с шириной кадра: 768→${at768}, 1440→${at1440}`)
const w768 = Number((at768 ?? '').split('×')[0])
check(
  w768 > 600 && w768 < 768,
  `блочный компонент занял ${w768} из 768 — меньше заданного на поля, а не равен ему`,
)

// 2. Тот же шов на строчном компоненте: число про КОМПОНЕНТ, а не про кадр.
await pickComponent('Badge')
await pickWidth(768)
const badge = await size()
const badgeW = Number((badge ?? '').split('×')[0])
check(badgeW > 0 && badgeW < 200, `строчный компонент занял ${badge}, а не ширину кадра`)

// 3. Шов `force-stats`: обход листов кадра доехал числами до панели.
await pickComponent('DataTable')
const stats = (await group('Форс-состояния').textContent()) ?? ''
const ms = Number(/обход ([\d.]+) мс/.exec(stats)?.[1] ?? NaN)
check(Number.isFinite(ms) && ms < 25, `обход листов доехал в панель: ${ms} мс`)
check(/пропущено 0/.test(stats), `пропущенных правил ноль (${stats.replace(/\s+/g, ' ').slice(-30)})`)

// 4. Карта видов (DS-67): выбор начинки открывается, НЕ загрузив ни
//    одного модуля фикстуры. В jsdom этого не проверить вовсе — там нет ни
//    сети, ни настоящего `import()`, — а различает эта проверка ровно ту
//    правку, ради которой задача заведена: прежний `loadKinds` тянул фикстуру
//    на каждое имя в списке, и в Network это тринадцать запросов, приходящих
//    в тот момент, когда человек ждёт список.
const reqsBefore = fixtureReqs.length
await group('Позиции').getByRole('button', { name: 'пусто' }).first().click()
await page.waitForTimeout(1200)
const compatible = (await page.locator('[aria-label="совместимых начинок"]').first().textContent()) ?? ''
// Число, а не «—»: карта ДОЕХАЛА. Без этой половины вторая проверка была бы
// зелёной и на сломанной карте — не приехало ничего, значит и не грузилось.
check(/^\d+$/.test(compatible) && Number(compatible) > 0, `совместимых начинок: «${compatible}»`)
const reqsAfter = fixtureReqs.length - reqsBefore
check(reqsAfter === 0, `открытие выбора начинки не загрузило ни одной фикстуры: запросов ${reqsAfter}`)
await group('Позиции').getByRole('button', { name: /пусто/ }).first().click()

// 5. Вид «Состояния»: четыре копии и полоса фактических тонов под ними.
await view('состояния').click()
await page.waitForTimeout(1200)
const frame = page.frameLocator('iframe.wb__frame')
const copies = await frame.locator('.wbf-states__box').count()
const tones = await frame.locator('.wbf-states__value').allTextContents()
check(copies === 4, `копий состояний: ${copies}`)
check(
  tones.length === 4 && tones.every((t) => t.length > 0),
  `полоса тонов заполнена: ${tones.join(' | ')}`,
)

// 6. Вид «Сетка»: по документу на пресет ширины.
await view('сетка').click()
await page.waitForTimeout(2000)
const cells = await page.locator('iframe.wb__frame').count()
check(cells === 4, `ячеек сетки: ${cells}`)

// 6a. Пара «одна ширина, две темы» (DS-153) — РАЗЛИЧЕНИЕМ, а не счётом.
//
// Проверяется то, ради чего пара заведена: два кадра — это ДВА ДОКУМЕНТА с
// разными `data-theme` НА КОРНЕ и одинаковым вьюпортом. Подкрашенная копия
// (фильтр, инверсия) на глаз выглядит правдоподобно и даёт одинаковый
// `data-theme`: токены тёмной темы не пересчёт светлых, а отдельные значения,
// и копия соврала бы ровно в том месте, ради которого пару и открывают.
// Счёт «два кадра» этого не различает вовсе.
await group('Ширина кадра').getByRole('button', { name: '360' }).click()
await group('Темы сетки').getByRole('button', { name: 'обе темы' }).click()
await page.waitForTimeout(2000)
const pair = page.locator('iframe.wb__frame')
const pairCount = await pair.count()
check(pairCount === 2, `ячеек в паре: ${pairCount}`)
const pairThemes = []
const pairWidths = []
for (let i = 0; i < pairCount; i++) {
  pairThemes.push(await page.frameLocator('iframe.wb__frame').nth(i).locator(':root').getAttribute('data-theme'))
  pairWidths.push(await page.frameLocator('iframe.wb__frame').nth(i).locator(':root').evaluate((el) => el.ownerDocument.defaultView.innerWidth))
}
check(
  new Set(pairThemes).size === 2,
  `темы документов пары различаются: ${pairThemes.join(' / ')}`,
)
check(
  pairWidths.length === 2 && pairWidths[0] === pairWidths[1],
  `вьюпорты пары совпадают: ${pairWidths.join(' / ')}`,
)
await group('Ширина кадра').getByRole('button', { name: 'все' }).click()
await group('Темы сетки').getByRole('button', { name: 'обе темы' }).click()
await page.waitForTimeout(1200)

// 7. Шов `tabstops`: слой посчитан кадром и назван в панели.
//
// На `Tabs`, а не на `DataTable`, и это не вкусовщина (находка ревью). У
// `DataTable` в случае по умолчанию `clickable`/`selectable` выключены, стопов
// ноль — и прежнее `/Таб-стопы \d+/` проходило одинаково при живом обходе и
// при обходе, всегда возвращающем пустой список: число печатается в обоих
// случаях. Проверка стояла ровно там, где предмета нет. У `Tabs` табличный
// список даёт стопы всегда, и утверждение стало про ЧИСЛО, а не про формат.
await view('кадр').click()
await page.waitForTimeout(1200)
await pickComponent('Tabs')
await group('Слои').getByRole('button', { name: 'таб-стопы' }).click()
await page.waitForTimeout(900)
const stopsTab = (await page.getByRole('tab', { name: /Таб-стопы/ }).textContent()) ?? ''
const stops = Number(/Таб-стопы (\d+)/.exec(stopsTab)?.[1] ?? NaN)
check(stops > 0, `вкладка стопов назвала число, и оно не ноль: «${stopsTab}»`)
// Дальше снова DataTable: прицел щёлкает по ячейке таблицы, а слой axe вносит
// узел в её же кадр.
await pickComponent('DataTable')

// 8. Шов `aim`: щелчок по узлу в кадре назвал его в тулбаре.
await group('Прицел').getByRole('button', { name: 'прицел' }).click()
await frame.locator('tbody tr').first().locator('td').first().click()
await page.waitForTimeout(600)
const aim = (await group('Прицел').textContent()) ?? ''
check(/прицел\S/.test(aim.replace(/\s+/g, '')), `прицел назвал узел: «${aim.trim()}»`)

// 8а. Прицел НА ПРОКРУЧИВАЕМОМ КАДРЕ (DS-147). Верного имени в тулбаре
// мало: имя оставалось верным и тогда, когда рамка вырождалась в 4×4 в начале
// координат. Prose — единственная фикстура каталога, чьё содержимое не влезает
// в кадр, и ровно на ней дефект и жил: `Prose` пересоздавал всё поддерево на
// каждую перерисовку, ссылка на выбранный узел протухала, и
// `getBoundingClientRect()` у снятого узла честно отвечал нулями.
//
// СРАВНЕНИЕМ С САМИМ УЗЛОМ, а не с ожидаемым числом: числа зависят от шрифта и
// вёрстки фикстуры и протухли бы на первой правке текста, а утверждение «рамка
// там же, где узел» переживает и то и другое. Допуск 1px — на округление
// субпиксельной раскладки.
await pickComponent('Prose')
await page.waitForTimeout(600)
const aimBoxOk = await page.frameLocator('iframe.wb__frame').locator('.wbf-host h2').first().click()
  .then(async () => {
    await page.waitForTimeout(500)
    return page.locator('iframe.wb__frame').first().evaluate((f) => {
      const d = f.contentDocument
      const node = d.querySelector('.wbf-host h2')
      const box = d.querySelector('.wbf-aim')
      if (!node || !box) return { ok: false, why: box ? 'узла нет' : 'рамки нет' }
      const a = node.getBoundingClientRect()
      const b = box.getBoundingClientRect()
      const near = (p, q) => Math.abs(p - q) <= 1
      return {
        ok: near(a.x, b.x) && near(a.y, b.y) && near(a.width, b.width) && near(a.height, b.height),
        why: `узел [${a.x.toFixed(0)},${a.y.toFixed(0)},${a.width.toFixed(0)},${a.height.toFixed(0)}]`
          + ` рамка [${b.x.toFixed(0)},${b.y.toFixed(0)},${b.width.toFixed(0)},${b.height.toFixed(0)}]`,
      }
    })
  })
check(aimBoxOk.ok, `прицел на прокручиваемом кадре: рамка совпала с узлом — ${aimBoxOk.why}`)

// 8б. Метка не уезжает за верхний край кадра. Порог переворота вьюпортный, и на
// прокрученном кадре это не то же число, что документная координата узла: до
// DS-147 сравнивали с документной, и метка у самого верха рисовалась ВЫШЕ
// кадра — замерено −7.8px при узле на вьюпортных 10.
const labelOk = await page.locator('iframe.wb__frame').first().evaluate((f) => {
  const d = f.contentDocument
  const w = f.contentWindow
  const target = d.querySelector('.wbf-host blockquote')
  if (!target) return { ok: false, why: 'blockquote в Prose не найден' }
  w.scrollTo(0, 0)
  w.scrollTo(0, target.getBoundingClientRect().top - 10)
  return { target: true }
})
if (labelOk.ok === false) {
  check(false, labelOk.why)
} else {
  await page.frameLocator('iframe.wb__frame').locator('.wbf-host blockquote').click()
  await page.waitForTimeout(500)
  const lab = await page.locator('iframe.wb__frame').first().evaluate((f) => {
    const el = f.contentDocument.querySelector('.wbf-aim__label')
    if (!el) return { ok: false, why: 'метки нет' }
    const r = el.getBoundingClientRect()
    return { ok: r.top >= 0, why: `верх метки ${r.top.toFixed(1)} (за краем — отрицательный)` }
  })
  check(lab.ok, `метка прицела не уехала за верх прокрученного кадра: ${lab.why}`)
}
await pickComponent('DataTable')
await group('Прицел').getByRole('button', { name: 'прицел' }).click()
await group('Прицел').getByRole('button', { name: 'прицел' }).click()
await frame.locator('tbody tr').first().locator('td').first().click()
await page.waitForTimeout(600)

// 9. Шов `a11y` (DS-78): кадр посчитал axe, число доехало во вкладку, а
//    контуры легли по НАСТОЯЩЕЙ раскладке. Последнее в jsdom проверить нельзя
//    вовсе — там любой прямоугольник нулевой, — и это ровно та половина слоя,
//    ради которой смок существует.
// Предмет проверки принадлежит ПРОВЕРКЕ, а не каталогу (DS-80). Раньше
// им было живое нарушение DataTable — `empty-table-header` у колонки действий,
// — и когда его починили, связка «число во вкладке = число контуров» осталась
// без единого узла: замер стал зелёным на пустоте, ровно как и предупреждал
// комментарий ниже. Ни у одной фикстуры нарушений больше нет (проверено
// обходом всего каталога), и это хорошая новость, из которой следует, что
// узел надо ВНОСИТЬ.
//
// Вносится сюда, а не в фикстуру, намеренно: фикстуры копируют, и заведомо
// кривой пример в каталоге учил бы писать неправильно — цена, которой этот
// замер не стоит. Картинка без `alt` выбрана как самое короткое однозначное
// нарушение, не зависящее ни от одного компонента системы: почини кто угодно
// что угодно — предмет останется.
// `frame` — FrameLocator, у него нет `evaluate`; узел вносится через локатор
// контейнера. Именно `.wbf-host`, а не `body`, и с DS-163 довод сменился
// на противоположный: раньше узел в `body` лежал вне охвата слоя (проверено —
// нарушений 0), теперь корней несколько и `body` тоже виден. Держать узел в
// хосте всё равно правильно: предмет ЭТОГО шага — слой поверх компонента, а
// охват порталов проверяется своим шагом ниже, на настоящем оверлее.
await frame.locator('.wbf-host').evaluate((host) => {
  const img = document.createElement('img')
  img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
  img.width = 40
  img.height = 24
  img.id = 'wb-smoke-axe-subject'
  host.appendChild(img)
})
await group('Слои').getByRole('button', { name: 'axe' }).click()
await page.waitForTimeout(2500)
const axeTab = (await page.getByRole('tab', { name: /axe/ }).textContent()) ?? ''
const found = Number(/axe (\d+)/.exec(axeTab)?.[1] ?? NaN)
check(Number.isFinite(found), `вкладка axe назвала число: «${axeTab}»`)
// Ноль здесь НЕ повод порадоваться: предмет проверки исчез, и связку «число во
// вкладке = число контуров» стало не на чем проверять. Пусть красное говорит
// «пересмотри случай», а не молчит зелёным. Теперь узел вносит сам замер
// (выше), поэтому ноль означает не «в системе стало чисто», а «слой axe
// перестал видеть внесённое» — то есть сломался он, а не каталог.
check(found > 0, `внесённому нарушению есть что показать: нарушений ${found}`)
const flaws = await frame
  .locator('.wbf-flaw')
  .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.width, r.height]))
// НЕ равенство: контур рисуется на каждый НАРУШИВШИЙ УЗЕЛ, а число во вкладке
// считает ПРАВИЛА, и у одного правила узлов бывает несколько. Равенство держалось
// только потому, что у прежнего `empty-table-header` был ровно один `<th>`, — то
// есть краснело бы от второй пустой колонки, а не от дефекта.
check(
  flaws.length >= found,
  `контуров не меньше, чем нарушений: ${flaws.length} на ${found} правил`,
)
// `length > 0` обязателен: `every` на пустом списке истинно, и без него
// утверждение проходило бы ровно там, где контуров не нарисовалось вовсе —
// поймано мутацией «контуры не рисуются», которую эта строка пропустила.
check(
  flaws.length > 0 && flaws.every(([w, h]) => w > 0 && h > 0),
  `контуры легли по раскладке: ${flaws.map(([w, h]) => `${Math.round(w)}×${Math.round(h)}`).join(', ') || '—'}`,
)

// 10. Тяга дока (DS-126). Раскладка, и только живая: jsdom не считает
//     геометрию и не реализует pointer capture, поэтому там проверяется
//     клавиатура и память (`shell-dock-h.test.tsx`), а здесь — что мышь
//     действительно двигает границу и что границы держат НА РАСКЛАДКЕ.
//
//     Утверждается СУММА, а не только высота дока: док, выросший без того,
//     чтобы поле уменьшилось, — это док, уехавший за нижний край экрана, и
//     по одной высоте он неотличим от правильного.
const dockH = () =>
  page.locator('.wb__dock-wrap').evaluate((e) => Math.round(e.getBoundingClientRect().height))
const fieldH = () =>
  page.locator('.wb__body').evaluate((e) => Math.round(e.getBoundingClientRect().height))
const dragDock = async (dy) => {
  const b = await page.locator('[aria-label="Высота панели"]').boundingBox()
  const x = b.x + b.width / 2
  const y = b.y + b.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + dy, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(250)
}

const h0 = await dockH()
const f0 = await fieldH()
await dragDock(-120)
/**
 * РУКОЯТКА ЗАПРЕЩАЕТ ВЫДЕЛЕНИЕ. Проверяется ПРАВИЛО, а не поведение, и это
 * сознательная уступка с записанной ценой.
 *
 * Дефект нашёл владелец руками 29.08: при настоящей тяге под курсором
 * выделялся текст. Захват указателя от этого не спасает — он решает, кому
 * достанутся события, а не станет ли браузер попутно выделять полстраницы.
 *
 * ПОВЕДЕНЧЕСКУЮ ПРОВЕРКУ Я НАПИСАЛ ПЕРВОЙ И СНЯЛ, ПОТОМУ ЧТО ОНА НЕ УМЕЛА
 * КРАСНЕТЬ. `window.getSelection()` после `mouse.down()` плюс `mouse.move`
 * пуст и с `user-select: none`, и с `user-select: auto` — проверено мутацией:
 * playwright тягой выделения не создаёт, хотя захват указателя тот же прогон
 * ловит (снятый `setPointerCapture` даёт здесь четыре провала). То есть
 * зелёная поведенческая проверка означала бы только «playwright не выделяет», и
 * стояла бы памятником дефекту, которого не видит.
 *
 * Поэтому здесь стоит правило: оно краснеет, если `user-select` с рукоятки
 * снимут, и честно не обещает, что поймает выделение по другой причине.
 * Настоящая проверка этого — глаз, и она уже сделана (владелец, 29.08).
 */
const grabSelect = await page
  .locator('[aria-label="Высота панели"]')
  .evaluate((e) => getComputedStyle(e).userSelect)
check(grabSelect === 'none', `рукоятка запрещает выделение: user-select ${grabSelect}`)
const h1 = await dockH()
const f1 = await fieldH()
check(h1 - h0 === 120, `тяга на 120 вверх подняла док на ${h1 - h0}`)
check(h1 + f1 === h0 + f0, `док вырос за счёт поля, а не за счёт экрана: ${h0}+${f0} → ${h1}+${f1}`)

await dragDock(-2000)
const hTop = await dockH()
const fTop = await fieldH()
// Кадр не пропадает — утверждение про ВИДИМУЮ часть кадра, а не про его
// собственный прямоугольник: `<iframe>` остаётся 512px высоты, даже когда от
// него в поле видно ноль, и проверка на его размер была бы зелёной всегда.
const seen = await page.evaluate(() => {
  const f = document.querySelector('iframe.wb__frame').getBoundingClientRect()
  const v = document.querySelector('.wb__body').getBoundingClientRect()
  return Math.round(Math.min(f.bottom, v.bottom) - Math.max(f.top, v.top))
})
check(fTop === FIELD_MIN, `у поля остался замеренный минимум: ${fTop}`)
check(seen > 0, `кадр не пропал: видно ${seen}px`)
check(hTop === h0 + f0 - FIELD_MIN, `док упёрся в потолок: ${hTop}`)

await dragDock(2000)
const hBottom = await dockH()
check(hBottom === DOCK_MIN, `док упёрся в пол и остался доком: ${hBottom}`)
// Полоса вкладок ЦЕЛИКОМ внутри дока, а не просто существует. Первая
// редакция этой строки утверждала `height > 0` у самой полосы — и пережила
// мутацию «пол снят»: при доке нулевой высоты полоса торчит из него наружу,
// свой прямоугольник у неё остаётся, и проверка оставалась зелёной ровно
// там, где док перестал быть доком. Утверждение обязано быть про
// ПЕРЕСЕЧЕНИЕ с доком — то есть про то, что видно.
const tabsSeen = await page.evaluate(() => {
  const t = document.querySelector('.wb__dock-tabs').getBoundingClientRect()
  const d = document.querySelector('.wb__dock-wrap').getBoundingClientRect()
  const seen = Math.min(t.bottom, d.bottom) - Math.max(t.top, d.top)
  return { seen: Math.round(seen), own: Math.round(t.height) }
})
check(
  tabsSeen.seen === tabsSeen.own,
  `полоса вкладок видна целиком: ${tabsSeen.seen} из ${tabsSeen.own}px`,
)

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
const hKept = await dockH()
check(hKept === hBottom, `высота пережила перезагрузку: ${hBottom} → ${hKept}`)

// 11. Высота, принятая ЧТЕНИЕМ, но не помещающаяся в РАСКЛАДКУ (DS-126).
//     Проверка написана на найденный дефект, а не на замысел. Первая редакция
//     стража считала нулевую высоту ТЕЛА признаком «раскладки нет» и молчала.
//     Но тело обнуляется двумя разными способами, и второй штатный: док, съевший
//     всё место. Высота «окно минус десять» проходит чтение (она не выше окна),
//     тело становится нулевым, страж принимает это за отсутствие раскладки —
//     потолок не применяется НИКОГДА, кадр исчезает и не возвращается. Внешне
//     неотличимо от «человек сам так растянул».
await page.evaluate(() => localStorage.setItem('ds-wb/dock-h', String(window.innerHeight - 10)))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const hHuge = await dockH()
const fHuge = await fieldH()
const seenHuge = await page.evaluate(() => {
  const f = document.querySelector('iframe.wb__frame').getBoundingClientRect()
  const v = document.querySelector('.wb__body').getBoundingClientRect()
  return Math.round(Math.min(f.bottom, v.bottom) - Math.max(f.top, v.top))
})
check(fHuge === FIELD_MIN, `док подрезан до потолка: ${hHuge}, полю осталось ${fHuge}`)
// Вторая половина не дублирует первую: поле может держать свой минимум и при этом
// не показывать кадра вовсе — например, уехав в прокрутку. Утверждается то,
// ради чего потолок существует, а не число, которым он посчитан.
check(seenHuge > 0, `кадр вернулся на экран: видно ${seenHuge}px`)
await page.evaluate(() => localStorage.removeItem('ds-wb/dock-h'))

// 12. Наборы раскладок канваса (DS-128, шаг 5). Здесь ровно та половина,
//     которой нет в jsdom: полоса объяснения — НОВАЯ СТРОКА ТУЛБАРА, а высота
//     дока считается как «оболочка минус тулбар». Это тот самый шов, на котором
//     верстак уже горел: перенос тулбара забирал 16px без единого изменения
//     размеров окна, потолок считался от площади, которой уже нет, и док уезжал
//     за нижний край. Отказ тихий — высота выглядит правдоподобно.
//
//     Набор кладётся ЗАВЕДОМО ИСПОРЧЕННЫЙ: он даёт и полосу подлиннее (три
//     строки потерь), и предмет спеки — «пустой канвас с объяснением, а не
//     белый экран».
//
//     ОБЁРТКУ ПИШЕТ САМО ПРИЛОЖЕНИЕ, а не смок. Испорчен ровно СПИСОК МЕСТ —
//     то, что здесь и проверяется, — а `v`, имя и всё прочее берутся из файла,
//     который только что сохранила кнопка «сохранить».
//
//     До 30.08.2026 обёртка была литералом прямо здесь, и это молча сломалось:
//     `0da6b9e` дал файлу поле `v`, смок остался без него, `parseFile` честно
//     ответил «файл без версии» — ОДНОЙ строкой потерь вместо трёх. Проверка
//     стала мерить чужой отказ: не «три места отброшены поимённо», а «формат не
//     тот», и дальше весь канвас читался пустым (DS-135). Литерал схемы в
//     проверке — это вторая её копия, и расходится она первой.
//
//     Вид переключается ДО сохранения: поле имени набора живёт в тулбаре
//     канваса, и на «кадре» его нет вовсе.
await view('канвас').click()
await page.waitForTimeout(900)
await page.locator('#wb-canvas-set').fill('смок')
await group('Наборы').getByRole('button', { name: /^(сохранить|перезаписать)$/ }).click()
await page.waitForTimeout(300)
const envelope = await page.evaluate(() => {
  const key = 'ds-wb/canvas/смок'
  const raw = localStorage.getItem(key)
  if (raw === null) return null
  const file = JSON.parse(raw)
  // Три места, и каждое отвергается СВОЕЙ причиной: нет компонента, нет имени,
  // старое имя поля. Третье — не украшение: `c` переименовано в `component` тем
  // же выпуском, и путь «поле зовётся по-старому» обязан оставаться живым.
  file.spots = [{ id: 'a' }, { c: 'X' }, { id: 'b', c: 'Pagination', col: 11, span: 5 }]
  localStorage.setItem(key, JSON.stringify(file))
  return raw
})
// Без этого «отброшено 3» ниже краснело бы с диагнозом про потери там, где
// набор просто не сохранился: кнопка не нажалась, имя не то, хранилище отказало.
check(
  envelope !== null && 'spots' in JSON.parse(envelope || '{}'),
  `набор сохранён приложением, обёртка его: ${String(envelope).slice(0, 80)}`,
)
// ЧЕРНОВИК КАНВАСА СНИМАЕТСЯ, и без этого замер ниже мерит не то. Предмет —
// «полоса объяснения заняла ЛИШНЮЮ строку тулбара», то есть разница до и после
// обязана состоять из одной этой полосы. С непустым канвасом до загрузки в
// тулбаре стоит ещё строка крутилок выделенного места, а после загрузки
// испорченного набора канвас пуст, крутилки уходят — и тулбар СЖИМАЕТСЯ на
// столько же, на сколько вырос от полосы. Замер тогда читает 109 → 81 и
// краснеет на исправном поведении.
//
// Черновик появился позже самой проверки (`4893174` — канвас переживает
// перезагрузку), и это ровно тот случай, когда база сравнения меняется у
// проверки под ногами, а сама проверка об этом молчит (DS-135).
await page.evaluate(() => localStorage.removeItem('ds-wb/canvas-draft'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await view('канвас').click()
await page.waitForTimeout(900)
const barRows = () =>
  page.locator('.wb__bar').evaluate((e) => Math.round(e.getBoundingClientRect().height))

// ДОК ПРИЖИМАЕТСЯ К ПОТОЛКУ ДО ЗАГРУЗКИ, и это не декорация прогона.
//
// Без этой тяги проверка «док не уехал за нижний край» ЗЕЛЕНА при вынесенной
// из тулбара полосе — проверено мутацией. Док высотой 340 при потолке 731
// далеко от края, тело `flex: 1` само отдаёт место любой лишней строке, и
// ошибка в подсчёте потолка ничем себя не выдаёт. Дефект живёт ровно на
// потолке: там завышенный `availH` разрешает доку высоту, которой больше нет.
await dragDock(-2000)

await group('Наборы').getByRole('button', { name: 'Загрузить набор «смок»' }).click()
await page.waitForTimeout(600)

const noteText = (await page.locator('.wb__note').innerText()) ?? ''
check(/отброшено 3/.test(noteText), `полоса назвала число потерь: «${noteText.split('\n')[0]}»`)
// Поимённо, а не счётчиком: по этим строкам правят файл, лежащий в репозитории.
check(
  /место №1/.test(noteText) && /место №3/.test(noteText),
  `потери названы поимённо: строк ${noteText.split('\n').length}`,
)
const barAfter = await barRows()

// ПОЛОСА — СТРОКА ТУЛБАРА, и утверждается это её геометрией, а не приростом
// высоты бара.
//
// ПРЕЖНЯЯ ФОРМУЛИРОВКА УСТАРЕЛА, и это замерено, а не предположено. Полоса
// стоит в разметке ВСЕГДА, пока мы на канвасе (`shell-app.tsx` объясняет, зачем:
// исчезающая строка двигала бы кадр, а живая область без узла не озвучивается),
// то есть свою строку она занимает и пустой — 21px. Наполняясь пятью строками
// потерь, она растёт до 24: `.wb__note-line` идут В РЯД, а не стопкой. Прироста
// «на целую строку» здесь не бывает вовсе, и `barAfter > barBefore` сравнивало
// не то: разницу 106 → 81 давала группа «Канвас», ужимающаяся с 529 до 202px,
// когда выделенного места не стало (DS-135).
const noteRow = await page.evaluate(() => {
  const bar = document.querySelector('.wb__bar').getBoundingClientRect()
  const note = document.querySelector('.wb__note')?.getBoundingClientRect()
  if (!note) return null
  const above = [...document.querySelectorAll('.wb__bar > *')]
    .map((e) => e.getBoundingClientRect())
    .filter((r) => r.bottom <= note.top + 1)
  return {
    inside: note.top >= bar.top - 1 && note.bottom <= bar.bottom + 1,
    // Своя строка: над полосой что-то есть, и ничто не стоит С НЕЙ В РЯД.
    ownRow: above.length > 0 && !above.some((r) => r.bottom > note.top + 1),
    h: Math.round(note.height),
  }
})
check(
  noteRow !== null && noteRow.inside && noteRow.ownRow && noteRow.h > 0,
  `полоса — своя строка ВНУТРИ тулбара: ${JSON.stringify(noteRow)}`,
)

// ГЛАВНОЕ УТВЕРЖДЕНИЕ РАЗДЕЛА, и теперь это ИНВАРИАНТ, а не разница до/после.
//
// Потолок дока — `availH - FIELD_MIN_H`, где `availH` — «оболочка минус
// тулбар» (`dock-height.ts`). Значит у дока, прижатого к потолку, обязано
// сходиться `док + минимум поля + тулбар === оболочка` — в ЛЮБОМ состоянии.
//
// Почему инвариант, а не прежнее «подрезан ровно на выросший тулбар»:
// сравнение двух состояний ловит только РОСТ тулбара и сбивается всем, что в
// тулбаре меняется заодно. Инвариант не знает направления и не зависит от
// содержимого — он утверждает ровно то, ради чего проверка написана: потолок
// посчитан от площади, КОТОРАЯ ЕСТЬ, а не от той, которой уже нет.
const geom = () =>
  page.evaluate(() => {
    const box = (sel) => document.querySelector(sel).getBoundingClientRect()
    const body = box('.wb__body'), f = box('iframe.wb__frame')
    return {
      shell: Math.round(box('.wb').height),
      bar: Math.round(box('.wb__bar').height),
      dock: Math.round(box('.wb__dock-wrap').height),
      field: Math.round(body.height),
      seen: Math.round(Math.min(f.bottom, body.bottom) - Math.max(f.top, body.top)),
    }
  })
await dragDock(-2000)
const fit = await geom()
check(
  fit.dock + FIELD_MIN + fit.bar === fit.shell,
  `потолок посчитан от площади, которая есть: док ${fit.dock} + ${FIELD_MIN} + тулбар ${fit.bar} = ${fit.dock + FIELD_MIN + fit.bar} против оболочки ${fit.shell}`,
)
check(fit.field === FIELD_MIN, `полю остался его минимум: ${fit.field}px`)
// Не дубль предыдущей: поле может держать свой минимум и не показывать кадра
// вовсе — тот же довод, что в разделе 11.
check(fit.seen > 0, `кадр остался на экране: видно ${fit.seen}px`)

// А ВОТ И ПЕРЕНОС ТУЛБАРА — тот самый пожар, ради которого раздел написан
// (DS-126: вторая строка забирала 16px без единого изменения размеров
// окна, потолок считался от площади, которой уже нет, док уезжал за нижний
// край). Триггер теперь ДЕТЕРМИНИРОВАННЫЙ: окно сужается, тулбар обязан
// перенестись, — а не «повезло, что прицел назвал длинный селектор».
const wide = page.viewportSize()
await page.setViewportSize({ width: 900, height: wide.height })
await page.waitForTimeout(900)
const narrow = await geom()
check(
  narrow.bar > fit.bar,
  `узкое окно перенесло тулбар: ${fit.bar} → ${narrow.bar}px`,
)
check(
  narrow.dock + FIELD_MIN + narrow.bar === narrow.shell
    && fit.dock - narrow.dock === narrow.bar - fit.bar,
  `док подрезан ровно на выросший тулбар: ${fit.dock} → ${narrow.dock} при +${narrow.bar - fit.bar}px тулбара`,
)
check(narrow.seen > 0, `кадр остался на экране и на узком окне: видно ${narrow.seen}px`)
await page.setViewportSize(wide)
await page.waitForTimeout(900)

// Пустой канвас — это ПУСТОЙ канвас, а не прежняя раскладка. Без этой строки
// всё выше проходило бы и при загрузке, которая ничего не загрузила.
const spotsLeft = await page.frameLocator('iframe.wb__frame').locator('.wbf-canvas__spot').count()
check(spotsLeft === 0, `канвас правда пуст: мест ${spotsLeft}`)

await page.evaluate(() => localStorage.removeItem('ds-wb/canvas/смок'))

// 13. СЛОИ И СКВОЗНОЙ ТАБ-ПОРЯДОК НА КАНВАСЕ (DS-128). Спека называет
//     это живым прогоном поимённо, и правильно: обе половины в jsdom не
//     проверяются вовсе — там любой прямоугольник нулевой, а фокус не ходит.
//
//     ДО СЕГОДНЯ КАНВАС В СМОКЕ НЕ ПРОВЕРЯЛСЯ НИКАК. Шаги 1–2 смотрели глазами
//     в chromium владельца, и это была честная проверка ровно один раз: глаз
//     не прогоняется на каждый коммит.
//
//     РАСКЛАДКИ СОБИРАЮТСЯ НАБОРАМИ, а не десятью щелчками по «+ компонент»:
//     это тот же путь, которым их собирает человек, и он заодно ещё раз
//     проходит через хранение. Каждый набор — один и тот же компонент, что
//     позволяет мерить одним прибором и порознь, и вместе.
const TRIO = [
  { id: 'tabs', component: 'Tabs', caseId: 'base' },
  { id: 'table', component: 'DataTable', caseId: 'row-open' },
  { id: 'pages', component: 'Pagination', caseId: 'base' },
]
/**
 * Обёртка — та же, что приложение написало в разделе 12, и по той же причине:
 * литерал схемы в проверке живёт до первой смены формата, а потом молчит. Здесь
 * это уже стоило раздела целиком — наборы не грузились, канвас читался пустым,
 * и прогон падал на фокусе узла, которого нет (DS-135).
 *
 * Меняются ровно имя и места; всё остальное поле в поле из файла приложения.
 */
const asSet = (name, spots) =>
  JSON.stringify({
    ...JSON.parse(envelope),
    name,
    spots: spots.map((s) => ({ ...s, col: 1, span: 12, props: {}, data: null })),
  })
await page.evaluate(
  ([trio, sets]) => {
    for (const [name, body] of sets) localStorage.setItem(`ds-wb/canvas/${name}`, body)
    void trio
  },
  [TRIO, [
    ['один-tabs', asSet('один-tabs', [TRIO[0]])],
    ['один-table', asSet('один-table', [TRIO[1]])],
    ['один-pages', asSet('один-pages', [TRIO[2]])],
    ['трое', asSet('трое', TRIO)],
  ]],
)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await view('канвас').click()
await page.waitForTimeout(900)
/**
 * Слой ВКЛЮЧАЕТСЯ, а не переключается. Адрес оболочки помнит `layers`, и после
 * `page.reload()` слой, включённый разделами 7 и 9, остаётся включённым —
 * щелчок по чипу выключил бы его. Отказ тихий: вкладка исчезает, число не
 * читается, и все проверки раздела печатают NaN, как будто сломан канвас.
 */
const ensureLayer = async (name) => {
  const chip = group('Слои').getByRole('button', { name })
  if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click()
  await page.waitForTimeout(1200)
}
await ensureLayer('таб-стопы')

const loadSet = async (name, settle = 2500) => {
  await group('Наборы').getByRole('button', { name: `Загрузить набор «${name}»` }).click()
  await page.waitForTimeout(settle)
}
const stopsNow = async () => {
  const t = (await page.getByRole('tab', { name: /Таб-стопы/ }).textContent()) ?? ''
  return Number(/Таб-стопы (\d+)/.exec(t)?.[1] ?? NaN)
}

const alone = {}
for (const s of TRIO) {
  await loadSet(`один-${s.id}`)
  alone[s.id] = await stopsNow()
}
await loadSet('трое', 3500)
const together = await stopsNow()

// У КАЖДОГО ИЗ ТРЁХ СТОПЫ НЕПУСТЫЕ — санитар на предмет. Пара, где у второго
// компонента стопов нет вовсе, дала бы ровно тот же итог, что фокус, застрявший
// в первом: сумме нечего было бы утверждать.
check(
  TRIO.every((s) => alone[s.id] > 0),
  `у каждого места свои стопы: ${TRIO.map((s) => `${s.id} ${alone[s.id]}`).join(', ')}`,
)
const sum = TRIO.reduce((n, s) => n + alone[s.id], 0)
check(
  together === sum,
  `на канвасе стопы со всех трёх мест: ${together} против суммы ${sum}`,
)

/**
 * ПОРЯДОК, А НЕ КОЛИЧЕСТВО, и спека требует именно этого: фокус, обошедший три
 * компонента, и фокус, застрявший в первом, дают одинаковое ЧИСЛО стопов, если
 * считать их по всему хосту.
 *
 * Ходит НАСТОЯЩИЙ Tab, а не пересчёт `tabStops()`: пересчитать список тем же
 * кодом, которым его строит слой, значит проверить, что функция равна себе.
 * Клавиатура — единственный прибор, который отвечает на вопрос «перетекает ли
 * фокус от таблицы к листалке», ради которого канвас и затевался.
 */
const firstStop = page
  .frameLocator('iframe.wb__frame')
  .locator('[data-wb-spot="tabs"]')
  .locator('button, a[href], [tabindex="0"]')
  .first()
await firstStop.focus()
const walk = []
for (let i = 0; i < together; i++) {
  walk.push(
    await page.evaluate(() => {
      const d = document.querySelector('iframe.wb__frame').contentDocument
      return d?.activeElement?.closest('[data-wb-spot]')?.getAttribute('data-wb-spot') ?? null
    }),
  )
  await page.keyboard.press('Tab')
}
// Схлопнутые повторы: внутри места стопов много, а нас интересует, в каком
// порядке фокус переходил ИЗ МЕСТА В МЕСТО и не возвращался ли.
const runs = walk.filter((id, i) => id !== walk[i - 1])
check(
  JSON.stringify(runs) === JSON.stringify(TRIO.map((s) => s.id)),
  `фокус прошёл места подряд и по разметке: ${runs.join(' → ')}`,
)

/**
 * СЛОЙ AXE НА КАНВАСЕ. Утверждается не «прогнался», а что контур лёг ПО
 * РАСКЛАДКЕ и именно в ТРЕТЬЕМ месте: нарушение вносится в последнее из трёх,
 * и попадание контура внутрь его прямоугольника — единственное, что отличает
 * работающий слой от слоя, обошедшего только первый компонент.
 *
 * Узел вносится замером, а не берётся из каталога, по тому же доводу, что и в
 * разделе 9: нарушений у фикстур нет, и заводить кривой пример в каталоге ради
 * замера значило бы учить писать неправильно.
 */
await page
  .frameLocator('iframe.wb__frame')
  .locator('[data-wb-spot="pages"]')
  .evaluate((spot) => {
    const img = spot.ownerDocument.createElement('img')
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
    img.width = 40
    img.height = 24
    spot.appendChild(img)
  })
await ensureLayer('axe')
await page.waitForTimeout(2500)
// ПРАВИЛА НАЗЫВАЮТСЯ, А НЕ СЧИТАЮТСЯ. «Нарушений 2» на канвасе из трёх
// компонентов — это либо внесённый замером узел, либо настоящий дефект
// каталога, и по счётчику одно от другого не отличить. Так и нашёлся первый:
// `color-contrast` на `span.ds-tabs__count` активной вкладки в светлой теме,
// 4.15 против нужных 4.5 (это был дефект `Tabs`, а не канваса; починен в
// DS-130 — счётчик красится `--ds-accent-fg`, стало 6.55, и вместе с ним
// закрыта дыра пошире: `color-mix` не мерил НИКТО, гейт `color-mix-contrast`
// теперь обходит их все). Число и список читаются ПОДРЯД и после того, как слой устоялся:
// axe пересчитывается на каждую перерисовку, и прочитанные врозь они бывают из
// разных отчётов — счётчик из свежего, список из прошлого.
await page.getByRole('tab', { name: /axe/ }).click()
await page.waitForTimeout(1500)
const canvasAxe = (await page.getByRole('tab', { name: /axe/ }).textContent()) ?? ''
const axeList = ((await group('axe').innerText()) ?? '').replace(/\s+/g, ' ')
const canvasFound = Number(/axe (\d+)/.exec(canvasAxe)?.[1] ?? NaN)
check(canvasFound > 0, `axe прогнался по корню канваса: нарушений ${canvasFound} — ${axeList.slice(0, 160)}`)
const inThird = await page.evaluate(() => {
  const d = document.querySelector('iframe.wb__frame').contentDocument
  const spot = d.querySelector('[data-wb-spot="pages"]').getBoundingClientRect()
  return [...d.querySelectorAll('.wbf-flaw')]
    .map((e) => e.getBoundingClientRect())
    .map((r) => ({
      w: Math.round(r.width),
      h: Math.round(r.height),
      inside: r.top >= spot.top - 2 && r.bottom <= spot.bottom + 2,
    }))
})
check(
  inThird.length > 0 && inThird.every((r) => r.w > 0 && r.h > 0),
  `контуры на канвасе непустые: ${inThird.map((r) => `${r.w}×${r.h}`).join(', ') || '—'}`,
)
check(
  inThird.some((r) => r.inside),
  `контур лёг в ТРЕТЬЕ место, а не у начала канваса: ${inThird.filter((r) => r.inside).length} из ${inThird.length}`,
)

// 14. ПРИЦЕЛ НАЗЫВАЕТ МЕСТО ВМЕСТЕ С УЗЛОМ (DS-128, шаг 6). Проверяется
//     ДОСЛОВНО пример из спеки: «`td.ds-table__lead` не отличить в двух
//     таблицах подряд». Два места с ОДНИМ И ТЕМ ЖЕ компонентом и случаем —
//     узлы неразличимы во всём, кроме места.
//
//     Живым прогоном, а не юнитом, потому что здесь проверяется ШОВ: кадр
//     ловит щелчок по настоящему узлу, зовёт `describeNode`, шлёт имя наверх
//     сообщением `aim`, оболочка печатает его в тулбаре. Юнит в `aim.test.ts`
//     утверждает только середину этой цепочки.
// Обёртка снова из файла приложения (`asSet`), а не литералом: третье место в
// смоке, где схема хранения была скопирована, и разъехались все три разом.
await page.evaluate(
  (body) => localStorage.setItem('ds-wb/canvas/две-таблицы', body),
  asSet('две-таблицы', [
    { id: 'верхняя', component: 'DataTable', caseId: 'row-open' },
    { id: 'нижняя', component: 'DataTable', caseId: 'row-open' },
  ]),
)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await view('канвас').click()
await page.waitForTimeout(900)
await group('Наборы').getByRole('button', { name: 'Загрузить набор «две-таблицы»' }).click()
await page.waitForTimeout(3500)

// Прицел ВКЛЮЧАЕТСЯ, а не переключается, — тот же капкан, что у слоёв: адрес
// помнит `aim`, и после перезагрузки чип мог остаться нажатым.
const aimChip = group('Прицел').getByRole('button', { name: 'прицел' })
if ((await aimChip.getAttribute('aria-pressed')) !== 'true') await aimChip.click()
await page.waitForTimeout(600)

const aimAt = async (spotId) => {
  await page
    .frameLocator('iframe.wb__frame')
    // `.ds-table__lead` без тега: в случае «Открытие строки» ведущая ячейка —
    // `th`, а не `td` (спека пишет `td` навскидку). Прибив тег, замер ждал бы
    // узла, которого в этом случае нет, и падал бы по таймауту — что читается
    // как «канвас не отрисовался», а не как «селектор не тот».
    .locator(`[data-wb-spot="${spotId}"] .ds-table__lead`)
    .first()
    .click()
  await page.waitForTimeout(700)
  return ((await page.locator('.wb__aim-node').innerText()) ?? '').trim()
}
const upper = await aimAt('верхняя')
const lower = await aimAt('нижняя')

// МЕСТО В ХВОСТЕ, а не впереди: `td.ds-table__lead в «верхняя»`. Порядок не
// косметика — его выбрали жертвой обрезки (`aim.ts`): строку режет тулбар с
// конца, и пока место стояло впереди, первым уходил модификатор в конце цепочки
// классов, то есть ровно то, что отличает узел от девяти соседей. Смок ещё
// проверял старую форму «место› узел» и краснел на верной строке (DS-135).
check(
  upper.endsWith(' в «верхняя»') && lower.endsWith(' в «нижняя»'),
  `прицел назвал место: «${upper}» и «${lower}»`,
)
// САМОЕ УТВЕРЖДЕНИЕ ШАГА. Узел обязан СОВПАСТЬ, а имена целиком — разойтись:
// узел один и тот же, место разное. Проверка «имена не равны» без этой половины
// проходила бы и на двух разных узлах, то есть ни на чём.
const tail = (s2) => s2.replace(/ в «[^»]*»$/, '').trim()
// Тег и класс НЕ прибиты литералом: щелчок по ведущей ячейке в случае
// «Открытие строки» приземляется на кнопку внутри неё (прицел берёт
// `e.target`, то есть самый глубокий узел). Пинать здесь `th.ds-table__lead`
// значило бы поставить в замер канваса тревожную кнопку на внутренности
// `DataTable`. Утверждается то, что предмет раздела: имя непустое, узел внутри
// таблицы, и в обоих местах оно ОДНО И ТО ЖЕ.
check(
  tail(upper) === tail(lower) && /ds-table__/.test(tail(upper)),
  `узел в обоих местах назван одинаково: «${tail(upper)}» и «${tail(lower)}»`,
)
check(upper !== lower, `имена разошлись, хотя узлы одинаковы: «${upper}» ≠ «${lower}»`)

await page.evaluate(() => {
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith('ds-wb/canvas/')) localStorage.removeItem(k)
  }
})


// 15. ПОРТАЛЫ (DS-163). Оверлеи Modal, Drawer и тостера монтируются
//     прямым ребёнком `body` кадра, и оба слоя, ходившие от одного `.wbf-host`,
//     не видели их вовсе: вкладка axe писала «смотреть было нечего», вкладка
//     стопов показывала НОЛЬ. Второе хуже — пустой список читается как
//     «проверено, клавиатура сюда не доходит», хотя внутри окна их три.
//
//     ЖИВОЙ БРАУЗЕР ЗДЕСЬ НЕСУЩИЙ, хотя корни проверены и юнитом. Верным
//     ответом слой стопов обязан ДВУМ вещам сразу: корни дают оверлей, а
//     `inert`, который вешает `useOverlayIsolation` на детей `body`, убирает
//     фон. В юните вторая половина подделана атрибутом; настоящую ставит
//     эффект настоящего `Modal`, и проверить её можно только там, где он
//     смонтирован по-настоящему.
//
//     Адресом, а не кликами по чипам: случай «Открыто» выбирается из дока, а
//     это четыре щелчка ради состояния, которое адрес задаёт целиком.
await page.goto(`http://${HOST}:${PORT}/?c=Modal&case=open&layers=axe,tabstops`, {
  waitUntil: 'networkidle',
})
await page.waitForTimeout(3000)

const ovStopsTab = (await page.getByRole('tab', { name: /Таб-стопы/ }).textContent()) ?? ''
const ovStops = Number(/Таб-стопы (\d+)/.exec(ovStopsTab)?.[1] ?? NaN)
// ТРИ, а не «больше нуля»: у окна ровно три кнопки (×, «Отмена», «Провести»),
// и число ловит обе стороны разом. Ноль — слой снова слеп к порталу; больше
// трёх — фон перестал выпадать по `inert`, то есть номера пошли по узлам, до
// которых Tab не доходит. «> 0» пропустило бы вторую поломку целиком.
check(ovStops === 3, `стопы окна сосчитаны и только они: «${ovStopsTab}», ждали 3`)

await page.getByRole('tab', { name: /axe/ }).click()
await page.waitForTimeout(400)
const ovAxe = (await page.getByRole('group', { name: 'axe' }).textContent()) ?? ''
const ovApplied = Number(/Применилось правил: (\d+)/.exec(ovAxe)?.[1] ?? NaN)
check(
  ovApplied > 0,
  `axe прошёлся по оверлею, а не по пустоте: «${ovAxe.split('.')[0]}»`,
)
// Прямое отрицание прежнего ответа: этот текст и есть тот, что уводил в
// сторону, — он читается как «случай пустой», то есть приглашает пройти мимо.
check(
  !/Смотреть было нечего/.test(ovAxe) && !/Корня превью нет/.test(ovAxe),
  'вкладка axe не отговаривается пустотой на открытом окне',
)


// 16. СЛОЙ НЕ МЕРЯЕТ САМ СЕБЯ (DS-195). Правилу `color-contrast` нужны
//     настоящие пиксели: фон оно берёт из стопки элементов под текстом, и
//     любая метка ПОВЕРХ текста делает фон неопределимым — axe отвечает
//     `incomplete` с ключом `bgOverlap`. А контур `.wbf-flaw` рисуется ИЗ
//     РЕЗУЛЬТАТА прогона, то есть слой правил вход следующего прогона своим же
//     выходом. Петля крутилась вечно, раз в секунду: нашёл → обвёл → «не
//     решено» → снял обводки → нашёл снова. Замерено на Calendar: 12 сообщений
//     за 12 секунд, строго через одно.
//
//     ПОЧЕМУ ЭТО ХУЖЕ ОТСУТСТВУЮЩЕГО СЛОЯ и почему проверка стоит секунд:
//     приёмщик смотрит ОДИН раз. Он видит один из двух ответов, оба выглядят
//     правдоподобно, и «Нарушений нет» он записывает как пройденную проверку,
//     не узнав, что через секунду был бы другой ответ.
//
//     ПРЕДМЕТ ВНОСИТ САМ ЗАМЕР, как и в шаге 9: петле нужно НАСТОЯЩЕЕ
//     нарушение контраста, чтобы обводка появилась. Возьми её у каталога — и
//     починка контраста в любом компоненте молча убрала бы предмет проверки,
//     оставив зелёное «стабильно» там, где стабильность больше не на чем
//     проверить.
await page.goto(`http://${HOST}:${PORT}/?c=Button&case=base`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

await frame.locator('.wbf-host').evaluate((host) => {
  // Низкий контраст: #bbb на белом — 1.9 : 1, нарушение при любом пороге.
  const weak = document.createElement('p')
  weak.id = 'wb-smoke-contrast'
  weak.style.cssText = 'color:#bbb;background:#fff;font-size:16px'
  weak.textContent = 'едва видный текст'
  // Текст на градиенте: фон не сводится к одному цвету, axe отвечает
  // `incomplete` с ключом — на нём и проверяется, что причина доехала.
  const grad = document.createElement('p')
  grad.id = 'wb-smoke-gradient'
  grad.style.cssText = 'color:#777;background:linear-gradient(90deg,#fff,#000);font-size:16px'
  grad.textContent = 'текст на градиенте'
  host.append(weak, grad)
})

await page.evaluate(() => {
  window.__wbA11y = []
  window.addEventListener('message', (e) => {
    const b = e.data?.body
    if (b?.type === 'a11y') {
      window.__wbA11y.push(
        JSON.stringify({
          v: b.violations.map((x) => `${x.id}×${x.nodes.length}`),
          i: b.incomplete,
          a: b.applied,
        }),
      )
    }
  })
})
await group('Слои').getByRole('button', { name: 'axe' }).click()
// Восемь секунд — не «подождём подольше»: петля переворачивалась раз в
// секунду, значит окно обязано вместить несколько её оборотов. Восемь даёт
// семь возможностей покраснеть.
await page.waitForTimeout(8000)

const heard = await page.evaluate(() => window.__wbA11y)
// Пустой отчёт при включении слоя из выключенного состояния — законное первое
// сообщение, но дальше ответ обязан быть ОДИН. Считаются РАЗНЫЕ тела, а не
// их число: кадр и так не шлёт наверх повтор того же отчёта, поэтому «два
// разных» и значит «слой передумал».
const answers = [...new Set(heard.filter((s2) => !/"a":0/.test(s2)))]
check(
  answers.length === 1,
  `слой ответил одно и то же за 8 с: ${answers.length} разных ответ(а) из ${heard.length} сообщений${
    answers.length > 1 ? ` — ${answers.join(' ≠ ')}` : ''
  }`,
)
// Контроль, что слой не онемел: внесённое нарушение обязано БЫТЬ в этом
// единственном ответе. Без него «один ответ» держалось бы и на слое, который
// молчит всегда.
check(
  /color-contrast/.test(answers[0] ?? ''),
  `внесённый контраст назван, а не пропущен: ${answers[0] ?? '—'}`,
)
// Причина «не решено» едет вместе с именем правила (DS-195). Одно слово
// «color-contrast» печаталось на два РАЗНЫХ факта — «перекрыт другим узлом» и
// «символ вне основной таблицы», — и приёмка свела два наблюдения в один
// диагноз. В jsdom это непроверяемо: без раскладки axe вообще не доходит до
// ключа.
check(
  /color-contrast \(\w+/.test(answers[0] ?? ''),
  `нерешённое названо с причиной, а не одним именем правила: ${answers[0] ?? '—'}`,
)

check(errs.length === 0, `ошибок в консоли нет${errs.length ? `: ${errs.join('; ')}` : ''}`)

await browser.close()
stopVite()

console.log(`\nsmoke:wb — ${fails.length === 0 ? 'всё держится' : `${fails.length} провалов`}`)
if (fails.length) process.exit(1)
