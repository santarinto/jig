/**
 * ПОЛЕ ВВОДА ПОКАЗЫВАЕТ ЗНАЧЕНИЕ, А НЕ ОДНУ БУКВУ — во ВСЕХ случаях всех
 * фикстур (DS-344). Строка 3 матрицы общих приёмочных свойств.
 *
 * УТВЕРЖДЕНИЕ. Каждый случай, открытый адресом кадра на вьюпорте 440×640 при
 * шкалах 0.875, 1, 1.15 и 1.5 (тема light), не несёт однострочного ввода или
 * текстовой области, чьё СОДЕРЖИМОЕ уже образцового значения `31.12.2026` плюс
 * знак на каретку — в кегле самого поля. Предикат — `scanFields` из
 * `workbench/gate-predicates.ts`, тот же модуль, что у строки цели клика.
 *
 * ЗАЧЕМ ОТДЕЛЬНАЯ СТРОКА, РАЗ ЕСТЬ ЦЕЛЬ КЛИКА. Потому что пол цели этот дефект
 * ПРОПУСКАЕТ, и это замерено, а не предположено: `Form` на кадре 360 при шкале
 * 1.5 отдавал полю 26 × 48 во всех трёх случаях, включая `base`. 26 больше
 * `--ds-target-min` (24), вбок ничего не торчало — обе прежние строки матрицы
 * были зелёными, а поле показывало один знак. Цель спрашивает «можно ли
 * ткнуть», эта строка — «видно ли, что в нём написано».
 *
 * ПОЧЕМУ ОБХОДОМ, А НЕ СЛУЧАЕМ `measure`. Тем же доводом, что у строки
 * переполнения: сжатое поле — это КЛАСС (фиксированный трек, `flex-basis` без
 * потолка, ряд без переноса), и случай на один компонент ловит повтор
 * найденного, молча пропуская соседа. Дефект 344 нашёлся в `Form`, а ширину
 * отнимал приём, который в каталоге не один.
 *
 * ОБРАЗЕЦ — ДАТА, и довод лежит рядом с ним (`FIELD_SAMPLE`): сумму поле
 * листает к концу по ходу набора, дату смотрят в покое и целиком. Пол в
 * ЗНАЧЕНИИ, а не в пикселях, поэтому он сам едет за `--ds-ui-scale`: считается
 * `measureText` в кегле поля на каждой шкале.
 *
 * ТРИ ИСХОДА ПО ЯЧЕЙКЕ, все поимённо, — как у соседних строк:
 *  - узкое поле вне `KNOWN` — красное;
 *  - строка `KNOWN`, которая больше не нарушает, — «устаревшее исключение»,
 *    красное: список, переживший починку, прикрыл бы следующий дефект;
 *  - `Case.narrowFields` (довод в фикстуре) проверяется НАОБОРОТ: объявлено —
 *    значит узкое поле обязано найтись хотя бы на одной судимой шкале, иначе
 *    довод протух.
 *
 * САНИТАР НА ЖИВОМ КАДРЕ (ловушка 5). В кадр подкладывается `input` шириной
 * 30 px, и замер обязан назвать ЕГО. Проба, разучившаяся видеть узкое поле,
 * иначе дала бы ровный зелёный по всему каталогу — ровно тот вид зелёного,
 * ради которого такие гейты и пишутся.
 *
 * ЭТО МОДУЛЬ, А НЕ ПРОГОН: ни дев-сервера, ни браузера, ни порта. Точка входа —
 * `scripts/case-matrix.mjs`; одна эта строка — `npm run matrix -- --row fields`.
 */
import { loadTs, humanUrl as human } from './case-walk.mjs'

/**
 * Шкалы, которые строка СУДИТ, — все четыре оси обхода. Пол здесь не константа
 * в пикселях, а значение в кегле поля, и он едет со шкалой вместе с полем;
 * зато едут со шкалой и ТРЕКИ раскладки, а они бывают фиксированными в rem —
 * именно на 1.5 и 1.15 такой трек и съедает поле (DS-344).
 */
const SCALES = [0.875, 1, 1.15, 1.5]

/**
 * ИЗВЕСТНЫЕ НАРУШЕНИЯ — по ПОЛНОМУ ключу `Компонент/случай ×шкала`, у каждой
 * строки код задачи, которая её снимет. Форма ключа и кода проверяется при
 * ИМПОРТЕ, до обхода: строка без задачи — это разрешение, а не известное
 * нарушение.
 *
 * Число 768 в сообщении ниже дублирует `WIDTH_SECOND` из `width-surface.mjs`
 * (импорт сюда не заведён ради одного текста сообщения) — вторая ширина оси
 * ширины (DS-380), не 440: 440 было ПРЕЖНЕЙ второй шириной оси, а с
 * DS-380 это объявленный пол и базовый вьюпорт обхода.
 */
const KNOWN = new Map([
])

// `DS-N` и `JIG-N` — ключи KNOWN несут провенанс, а не адрес поставки: DS-N —
// законный код архивной задачи, перенесённой из старой доски (JIG-3).
for (const [at, code] of KNOWN) {
  if (!/^[^/\s]+\/\S+ ×\d+(\.\d+)?( касание)?( \d+)?$/.test(at) || !/^(?:DS|JIG)-\d+(, (?:DS|JIG)-\d+)*$/.test(code)) {
    throw new Error(`KNOWN строки ширины поля: «${at}» → «${code}» — ключ обязан быть «Компонент/случай ×шкала» (с хвостом « касание» у сенсорной ячейки, « 768» у ячейки второй ширины), значение — код задачи DS-N или JIG-N либо список через запятую с пробелом`)
  }
}

/**
 * Окно отстаивания — та же величина и тот же смысл, что у соседних строк:
 * часть компонентов раскладывает себя замером, и первый кадр после
 * монтирования законно не тот. Ждёт строка СВОЕГО предмета — коробок полей.
 */
const SETTLE_MS = 600

/**
 * ЗАМЕР — уходит в страницу целиком. Предикат и сверка кадра берутся модулями
 * верстака (корень дев-сервера — `workbench/`), копий нет.
 *
 * Проба ТОЛЬКО ЧИТАЕТ: `scanFields` ничего не листает и ничего не подкладывает,
 * текст меряется холстом в памяти. Кадр возвращается таким, каким взят.
 */
const probe = async ([settleMs, planted]) => {
  const [{ scanFields }, { frameFacts }, { settle }] = await Promise.all([
    import('/gate-predicates.ts'),
    import('/frame-facts.ts'),
    import('/settle.ts'),
  ])
  await document.fonts.ready
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
  const sign = () => [...document.querySelectorAll('input, textarea')]
    .map((e) => e.getBoundingClientRect().width.toFixed(1)).join(';')
  const calm = await settle(sign, frame, settleMs, () => performance.now())
  return { ...frameFacts(document), scan: scanFields(document), calm, settleMs, planted }
}

const { classify, collapseRepeats } = await loadTs('workbench/case-report.ts')
const { frameWhy } = await loadTs('workbench/frame-facts.ts')

/** Числа пробы — в ячейку либо в причину «не измерено» (тот же `frameWhy`, что у соседей). */
const verdict = (got, row, scale, viewport) => {
  const why = frameWhy(got, scale, viewport)
  if (why !== null) return { why }
  if (got.calm?.settled !== true) {
    return { why: `коробки полей не установились за ${got.settleMs} мс (${got.calm?.frames ?? '?'} кадров)` }
  }
  return { c: row.c, scale, row, total: got.scan.total, narrow: got.scan.narrow, skipped: got.scan }
}

/** Худшая нехватка ячейки — ею же строки и сортируются. */
const gap = (m) => m.narrow.reduce((n, f) => Math.max(n, f.need - f.inner), 0)

// ГОЛОВЫ строк узлов свёрнуты (`collapseRepeats`, JIG-30) ДО приписывания URL:
// у ячейки один адрес, а узких полей внутри неё бывают тысячи одинаковых
// (фиксированный трек кладёт один и тот же дефицит на каждое поле повтора) —
// `×N` обязан стоять в строке узла, а не после уже приписанного URL.
const lines = (m, url) => {
  const heads = m.narrow.map((f) =>
    `  ${m.at.padEnd(40)} ${`${f.inner}/${f.need}`.padEnd(13)} ${f.path}  (не хватает ${(f.need - f.inner).toFixed(1)} на «${f.sample}»)`)
  return collapseRepeats(heads).map((h) => `${h}\n    ${url}`)
}

// `known` — параметр, по умолчанию `KNOWN` модуля, тем же доводом, что у
// строки цели клика (DS-329): синтетике гейта `matrix-report.test.ts`
// (JIG-30) нужна маленькая карта, а не живая.
const report = ({ measured, unmeasured, known = KNOWN }, area) => {
  if (unmeasured.length) {
    unmeasured.sort((a, b) => a.at.localeCompare(b.at))
    console.error(`НЕ ИЗМЕРЕНО ${unmeasured.length}:`)
    for (const u of unmeasured) console.error(`  ${u.at}: ${u.why}\n    ${human(u.url)}`)
  }

  const sections = classify({
    measured, unmeasured, known,
    bad: (m) => m.narrow.length > 0,
    declaredOf: (m) => m.row.narrowFields,
    gapOf: gap,
  })

  // СУЖЕНИЯ ПЛОЩАДИ называются числом, как у строки цели клика: поле, выпавшее
  // из замера молча, неотличимо от обхода, который его не видит.
  const sum = (k) => [...measured.values()].reduce((n, m) => n + (m.skipped?.[k] ?? 0), 0)
  const narrowed = `осмотрено полей ${sum('total')}; пропущено: невидимых ${sum('invisible')}, `
    + `в [inert] ${sum('inert')}, в схлопнутом предке ${sum('clipped')}`

  if (sections.known.length) {
    console.log(`ИЗВЕСТНО ${sections.known.length} в ${new Set(sections.known.map((v) => v.c)).size} компонентах (не краснеет, у каждой строки задача):`)
    for (const v of sections.known) console.log(`${lines(v, human(v.url)).join('\n')}\n    задача ${known.get(v.at)}`)
  }
  if (sections.declared.length) {
    console.log(`ОБЪЯВЛЕНО narrowFields ${sections.declared.length} (узкое поле обязано найтись):`)
    for (const v of sections.declared) {
      if (!v.narrow.length) console.log(`  ${v.at.padEnd(40)} на этой шкале узкого поля нет\n    ${human(v.url)}`)
      const heads = v.narrow.map((f) => `  ${v.at.padEnd(40)} ${f.inner}/${f.need} ${f.path}  довод «${v.row.narrowFields}»`)
      for (const h of collapseRepeats(heads)) console.log(`${h}\n    ${human(v.url)}`)
    }
  }

  if (sections.violations.length) {
    const w = sections.violations[0]
    const inComps = new Set(sections.violations.map((v) => v.c)).size
    const worst = [...w.narrow].sort((a, b) => (b.need - b.inner) - (a.need - a.inner))[0]
    console.error(
      `ШИРИНА ПОЛЯ: ${sections.violations.length} нарушающих ячеек в ${inComps} компонентах; худшее — ${w.at}: `
      + `${worst ? `${worst.path} ${worst.inner} при нужных ${worst.need}` : '(поле не названо)'}`,
    )
    for (const v of sections.violations) console.error(lines(v, human(v.url)).join('\n'))
  }
  if (sections.declaredQuiet.length) {
    console.error(`ОБЪЯВЛЕНО, НО НЕТ ${sections.declaredQuiet.length} — узкого поля в случае нет; снять narrowFields с фикстуры или вернуть случаю смысл:`)
    for (const v of sections.declaredQuiet) {
      console.error(`  ${v.at}: полей ${v.total}, узких — ни одного; довод «${v.row.narrowFields}»\n    ${human(v.url)}`)
    }
  }
  if (sections.stale.length) {
    console.error(`УСТАРЕВШЕЕ ИСКЛЮЧЕНИЕ ${sections.stale.length} — снять строку из KNOWN:`)
    for (const x of sections.stale) console.error(`  ${x.at}: ${x.why}, задача ${x.code}`)
  }

  // ВЕРДИКТ БОЛЬШЕ НЕ ПЕЧАТАЕТСЯ ЗДЕСЬ (JIG-30) — тем же доводом, что у строки
  // переполнения: `report` возвращает его, печатает ходок, один раз и одним
  // потоком, в конце обхода вместе с остальными строками.
  if (sections.badCount) {
    console.error(`\n${area}; ${narrowed}`)
    return {
      green: false,
      verdict: `FIELDS FAIL — ${sections.violations.length} нарушающих ячеек вне списка, ${sections.stale.length} устаревших исключений, `
        + `${sections.declaredQuiet.length} объявленных без узкого поля, ${unmeasured.length} не измерено.`,
    }
  }

  return {
    green: true,
    verdict: `FIELDS OK — 0 нарушений вне списка; известно ${sections.known.length}, объявлено ${sections.declared.length}; ${area}; ${narrowed}`,
  }
}

/** Строка 3 матрицы. Точка входа — `scripts/case-matrix.mjs`. */
export const fieldsRow = {
  name: 'ШИРИНА ПОЛЯ',
  scales: SCALES,
  arg: SETTLE_MS,
  probe,
  sentinel: async (page, run) => {
    await page.evaluate(() => {
      const el = document.createElement('input')
      el.className = 'ds-fields-sentinel'
      el.type = 'text'
      el.style.cssText = 'display:block;box-sizing:border-box;width:30px;padding:0;border:0'
      document.querySelector('.wbf-host').appendChild(el)
    })
    let got
    try {
      got = await run(0)
    } finally {
      // Прибрать подложенное — дело подложившего: следующий, кто получит этот
      // кадр, его не ждёт (тот же контракт, что у строки цели клика).
      await page.evaluate(() => {
        for (const n of document.querySelectorAll('.ds-fields-sentinel')) n.remove()
      })
    }
    const hit = got?.scan?.narrow?.find((f) => f.path.endsWith('input.ds-fields-sentinel'))
    return hit
      ? null
      : `санитар ширины поля: подложенный input 30 px не опознан узким (узкие: ${got?.scan?.narrow?.map((f) => f.path).join(', ') || 'пусто'}; осмотрено ${got?.scan?.total ?? '?'})`
  },
  verdict,
  report,
}
