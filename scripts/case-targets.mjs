/**
 * Цель клика не мельче 24×24 и попадаема — во ВСЕХ случаях всех фикстур
 * (DS-177). Строка 1 матрицы общих свойств.
 *
 * ЭТО МОДУЛЬ, А НЕ ПРОГОН. Порт живёт у ТОЧКИ ВХОДА `case-matrix.mjs`, не здесь:
 * строка своего дев-сервера не поднимает. Файл экспортирует объект строки
 * `targetsRow`; одна эта строка — `npm run matrix -- --row targets`.
 *
 * УТВЕРЖДЕНИЕ. Каждый случай, открытый адресом кадра на вьюпорте 440×640 при
 * шкалах 0.875, 1, 1.15 и 1.5 (тема light), не несёт цели мельче 24×24 и ни
 * одной цели, по которой не попасть: четыре угла, отступленные на радиус
 * скругления, обязаны попасть в саму цель, её потомка, накладку (другую цель
 * целиком внутри коробки судимой, при свободном центре судимой) либо — под углом, выкрученным прокруткой
 * из-под закреплённого слоя, — сам этот угол прощается вместо промаха
 * (sticky). Оба смягчения — объявленные пределы пробы, не дыра: полный
 * список (накладка, sticky, инертное, отключённое, обрезанное, фрагменты)
 * в `docs/guards.md`, у этой же строки. Предикат —
 * `scanTargets` из `workbench/gate-predicates.ts`, ТОТ ЖЕ модуль, что у случая
 * «Цель клика» в `measure` и у адреса `/api/gate/predicate/target-size`:
 * проба берёт его в странице `import('/gate-predicates.ts')`, копии нет.
 *
 * ЧЕМ ОТЛИЧАЕТСЯ ОТ «Цели клика» в `measure`. Тот ходит по ПРЕВЬЮ, то есть по
 * выборке; этот — по всем случаям всех фикстур. Именно поэтому он находит
 * состояния, которых нет ни в одном превью: легенда графика (DS-155)
 * нашлась глазами, потому что ни одно превью её не рисовало. Шкал четыре, а не
 * три, как у строки переполнения: пол цели `calc(<n>rem * var(--ds-ui-scale))`
 * на 1 даёт ровно 24, а на 0.875 — 21 (DS-176), и 1.15 — рабочая шкала
 * потребителя.
 *
 * ИСХОДЫ ПО ЯЧЕЙКЕ, и все поимённо:
 *  - `small` (мельче 24 по любой стороне) или `unhittable` (не мельче, но по
 *    углам не попасть) вне `KNOWN` — нарушение, красное. «Не попасть» — это
 *    и цель ВНЕ ДОСЯГАЕМОСТИ: срезанная в ноль тем, что человек не листает
 *    (`clip`, `hidden`), после его прокрутки (DS-331). Инертные и
 *    цели в СХЛОПНУТОМ в ноль предке не осматриваются, отключённые по
 *    попаданию не судятся, углы ставятся по видимой части и отступают за
 *    рамку, накладка внутри коробки промахом не считается — пределы пробы
 *    названы в `scanTargets`/`corners` и в `docs/guards.md`;
 *  - `KNOWN`, которое больше не нарушает, — «устаревшее исключение», красное;
 *  - `Case.tinyTargets` (довод в фикстуре) снимает ТОЛЬКО `small`: мелкость
 *    бывает решением (декоративный крестик в поле), непопадаемость — нет, и
 *    перекрытая цель на объявленном случае остаётся нарушением. Объявление
 *    проверяется НАОБОРОТ: мелкая цель обязана найтись хотя бы на ОДНОЙ
 *    судимой шкале СЛУЧАЯ, а не на каждой (смягчение DS-177, шаг 6: цель
 *    растёт со шкалой и законно дотягивается до пола 24 на старшей — это рост,
 *    не протухание; строгая форма красила бы Prose, KeyValueList и слоты
 *    EventCalendar на 1.5 ложно), иначе «ОБЪЯВЛЕНО, НО НЕТ» — довод протух и
 *    прикрыл бы следующий дефект;
 *  - `unreachable` (ни одного угла во вьюпорте даже после прокрутки) — ни
 *    нарушение, ни «не измерено» ЦЕЛИКОМ: вторая формулировка спрятала бы
 *    мелкие цели той же ячейки. Отдельная красная секция «НЕ ДОСТАТЬ» с путём
 *    и размером — замер попадания не снят, и молчать об этом нельзя.
 *
 * САНИТАР (ловушка 5). В живой кадр подкладываются кнопка 10×10 — обязана
 * прийти в `small` с путём, кончающимся `button.ds-targets-sentinel`, — и
 * кнопка 40×40 под абсолютной вуалью — обязана прийти в `unhittable`. Без
 * него зелёный отчёт одинаково выглядит и когда целей нет, и когда обход их
 * не видит.
 */
import { loadTs, humanUrl as human } from './case-walk.mjs'

/** Шкалы, которые строка СУДИТ. */
const SCALES = [0.875, 1, 1.15, 1.5]

/**
 * ИЗВЕСТНЫЕ НАРУШЕНИЯ — по ПОЛНОМУ ключу `Компонент/случай ×шкала`, у каждой
 * строки код задачи, которая её снимет (как у строки переполнения). Не по
 * компоненту целиком: новый случай того же компонента иначе спрятался бы под
 * чужую задачу. Форма ключа и кода проверяется при ИМПОРТЕ, до обхода: строка
 * без задачи — это разрешение, а не известное нарушение.
 *
 * ЗНАЧЕНИЕ — код ИЛИ СПИСОК КОДОВ через запятую с пробелом
 * (`DS-324, DS-329`): ячейка нарушает по двум причинам с двумя
 * задачами — так до 329 Form/collapsed несла и мелкий `ds-card__toggle`
 * (324), и голый `input` фикстуры (329) — и снимающая одну не обязана
 * снимать другую.
 *
 * Причины разобраны в DS-177 (эпик DS-320): 321 — Calendar,
 * DatePicker: `select`/стрелки навигации мельче пола — снята: селект на
 * `min-height: --ds-target-min`, стрелка на `max(--ds-target-min, шкала)`; 322 — DataTable:
 * кнопка действия строки мельче пола — снята: кнопка на полу
 * `--ds-target-min` внутри прежней высоты строки; 323 — DropdownMenu: обёртка своего
 * триггера мельче пола — снята: обёртка на полу `--ds-target-min`, подпись по центру; 324 — Form (карточка):
 * `ds-card__toggle`/`ds-card__tool` мельче пола — снята: заголовок-кнопка
 * тянется на строку шапки, инструмент на `max(--ds-target-min, шкала)`; 325 — LogViewer: кнопки
 * навигации по совпадениям мельче пола — снята: кнопка на полу
 * `--ds-target-min`; 326 — Split: ручка `ds-split__bar`
 * тоньше пола и на 1.5 за краем — снята: тело разделителя на полу
 * `--ds-target-min`, первая панель сжимается до контейнера; 327 — AgentTranscript: заголовок реплики мельче пола, кнопка
 * блока инструмента перекрыта хвостом — снята: заголовок-кнопка на полу
 * `--ds-target-min`, хвост снимается прокруткой к низу (он только при
 * `!following`; флаг сверяется и с геометрией — DS-340); 328 — EventCalendar: событие или бар
 * перекрыты соседним/своим «ещё» (попадание, не мелкость) — снята: события
 * кластера колонками рядом, трек дня не уже `N × min-w`, «+N ещё» — своей
 * строкой грида пояса. 329 — голые
 * `button`/`input` фикстур (AppBar, SideNav, Split, Tooltip, Form) — снята:
 * фикстуры рисуют системные `Button`/`TextField`, строк за ней не осталось.
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
    throw new Error(`KNOWN строки цели клика: «${at}» → «${code}» — ключ обязан быть «Компонент/случай ×шкала» (с хвостом « касание» у сенсорной ячейки, « 768» у ячейки второй ширины), значение — код задачи DS-N или JIG-N либо список через запятую с пробелом`)
  }
}

/**
 * Окно отстаивания — та же величина, что у строки переполнения (600 мс), и
 * тот же смысл: сколько ждать, пока кадр, раскладывающий себя замером
 * (`ResizeObserver` → состояние → рендер), установится. Но ждёт строка СВОЕГО
 * предмета — коробок целей, — а не переполнения документа: компонент,
 * раскладывающийся JS-ом и режущий содержимое в своём контейнере, документ не
 * переполняет вовсе, и чужой признак выпускал бы его через два кадра.
 */
const SETTLE_MS = 600

/**
 * ЗАМЕР — уходит в страницу целиком. Предикат, подпись, отстаивание и сверка
 * кадра — модулями верстака (корень дев-сервера `workbench/`), а не копиями.
 *
 * ОТСТАИВАНИЕ — ПО СВОЕМУ ПРЕДМЕТУ, и ответ строки поэтому не зависит от того,
 * что исполнялось до неё. После `fonts.ready` проба снимает подпись коробок
 * целей (`targetSignature`) каждый кадр анимации, пока два кадра подряд не
 * совпадут, в пределах `SETTLE_MS` (`workbench/settle.ts`). В полном обходе до
 * неё ту же ячейку отстаивает строка переполнения — своим признаком; кадр,
 * пришедший уже установившимся, отстаивается за один кадр, не установившийся
 * — дожидается того же состояния. Эквивалентности двух ожиданий никто не
 * утверждает: утверждается, что эта строка ждёт своего и меряет установившееся
 * ЛИБО называет ячейку «не измерено» (`settled: false`, см. вердикт).
 *
 * Подпись НЕ ЛИСТАЕТ, поэтому её можно звать каждый кадр. Листает один раз
 * `scanTargets` (`scrollIntoView`) — и возвращает кадр, каким взял (контракт
 * типажа `Row`): окно и каждого прокрученного предка, в `finally`.
 */
const probe = async ([settleMs, planted]) => {
  const [{ scanTargets, targetSignature }, { frameFacts }, { settle }] = await Promise.all([
    import('/gate-predicates.ts'),
    import('/frame-facts.ts'),
    import('/settle.ts'),
  ])
  await document.fonts.ready
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
  const calm = await settle(() => targetSignature(document), frame, settleMs, () => performance.now())
  return { ...frameFacts(document), scan: scanTargets(document), calm, settleMs, planted }
}

// Чистые половины — сборкой до обхода: исполняется при ИМПОРТЕ строки точкой
// входа, раньше дев-сервера (докблок `loadTs` в `case-walk.mjs` — почему).
// Классификация — `targetSections` под юнит-тестами `case-report.test.ts`:
// «tinyTargets снимает только мелкость», «объявлено, но нет», счёт «не
// достать» — ровно то место, где ошибка дала бы правдоподобный зелёный.
const { targetSections, TARGET_FLOOR: FLOOR } = await loadTs('workbench/case-report.ts')
const { frameWhy } = await loadTs('workbench/frame-facts.ts')

/** Числа пробы — в ячейку либо в причину «не измерено» (тот же `frameWhy`, что у строки 2). */
const verdict = (got, row, scale, viewport) => {
  const why = frameWhy(got, scale, viewport)
  if (why !== null) return { why }
  // Не установилось — «не измерено», а не замер последнего кадра: коробки,
  // снятые с ускользающей раскладки, зависят от момента, то есть от соседей
  // и нагрузки машины, — два ответа на один вопрос.
  if (got.calm?.settled !== true) {
    return { why: `коробки целей не установились за ${got.settleMs} мс (${got.calm?.frames ?? '?'} кадров)` }
  }
  const { total, small, unhittable, unreachable, inert, clipped } = got.scan
  return { c: row.c, scale, row, total, small, unhittable, unreachable, inert, clipped }
}

const size = (t) => `${t.width}×${t.height}`
/**
 * Промах с причиной: `coveredBy` предиката — «TR (192.0,34.0) <путь>» —
 * печатается как «НЕ ПОПАСТЬ: TR (192.0,34.0) накрыт <путь>». Причину называет
 * САМ замер: chromium владельца на метриках текста с гейтом расходится, и
 * воспроизвести промах глазами можно не всегда. Поля нет (старый предикат) —
 * голое «НЕ ПОПАСТЬ», а не выдуманная причина.
 */
const missWord = (t) => (t.coveredBy
  ? `НЕ ПОПАСТЬ: ${t.coveredBy.replace(/^(\S+ \([^)]*\)) /, '$1 накрыт ')}`
  : 'НЕ ПОПАСТЬ')
const hitWord = (t) => (t.hit === true ? 'попадаема' : t.hit === false ? missWord(t) : 'попадание не снято')

/** Цели ячейки, которые ей вменяются: мелкие (если не объявлены) и непопадаемые. */
const charged = (m) => [
  ...(m.row.tinyTargets === undefined ? m.small.map((t) => ({ t, kind: `мельче ${FLOOR}, ${hitWord(t)}` })) : []),
  ...m.unhittable.map((t) => ({ t, kind: missWord(t) })),
]

const lines = (m, url, list) => list.map(({ t, kind }) =>
  `  ${m.at.padEnd(40)} ${size(t).padEnd(11)} ${t.path}  (${kind})\n    ${url}`)

// `known` — карта известных нарушений; обход её не передаёт и получает `KNOWN`
// модуля. Параметр ради печати слова при коде через запятую (DS-329):
// после снятия 329 в `KNOWN` не осталось ни одной строки с двумя кодами, и
// тест, бивший по реальной строке, остался бы без предмета.
const report = ({ measured, unmeasured, known = KNOWN }, area) => {
  if (unmeasured.length) {
    unmeasured.sort((a, b) => a.at.localeCompare(b.at))
    console.error(`НЕ ИЗМЕРЕНО ${unmeasured.length}:`)
    for (const u of unmeasured) console.error(`  ${u.at}: ${u.why}\n    ${human(u.url)}`)
  }

  const sections = targetSections({ measured, unmeasured, known })
  const { absent, far, farCount } = sections
  const caseOf = (at) => at.replace(/ ×[\d.]+( касание)?( \d+)?$/, '')
  const absentCases = new Set(absent.map((v) => caseOf(v.at)))
  // СУЖЕНИЯ ПЛОЩАДИ называются числом, как прокручиваемые области у `measure`:
  // цель, выпавшая из замера молча, неотличима от обхода, который её не видит.
  // Счёт — по ячейкам (случай × шкала), то есть одна кнопка фона под Modal
  // на четырёх шкалах — это 4.
  const sum = (k) => [...measured.values()].reduce((n, m) => n + (m[k] ?? 0), 0)
  // ТОП-3 КОМПОНЕНТА НА СЧЁТЧИК (m2, обзор фикс-волны DS-177 18.09.2026):
  // сумма одна на всю площадь молчит про то, ГДЕ она набралась — массовая
  // потеря в одном новом компоненте тонет в общем числе так же, как молчала
  // бы вовсе. По ячейкам (случай × шкала), как и сама сумма.
  const topByComponent = (k) => {
    const byComponent = new Map()
    for (const m of measured.values()) {
      const v = m[k] ?? 0
      if (v) byComponent.set(m.c, (byComponent.get(m.c) ?? 0) + v)
    }
    const sorted = [...byComponent.entries()].sort((a, b) => b[1] - a[1])
    if (!sorted.length) return ''
    const top = sorted.slice(0, 3).map(([c, n]) => `${c} ${n}`).join(', ')
    return ` (${top}${sorted.length > 3 ? ', …' : ''})`
  }
  const narrowed = `сужения: в [inert] ${sum('inert')}${topByComponent('inert')}, `
    + `в схлопнутом предке ${sum('clipped')}${topByComponent('clipped')} (цели по ячейкам, вне счёта целей)`

  if (sections.known.length) {
    console.log(`ИЗВЕСТНО ${sections.known.length} в ${new Set(sections.known.map((v) => v.c)).size} компонентах (не краснеет, у каждой строки задача):`)
    for (const v of sections.known) {
      const code = known.get(v.at)
      const word = code.includes(',') ? 'задачи' : 'задача'
      console.log(`${lines(v, human(v.url), charged(v)).join('\n')}\n    ${word} ${code}`)
    }
  }
  if (sections.declared.length) {
    console.log(`ОБЪЯВЛЕНО tinyTargets ${sections.declared.length} (мелкая цель обязана найтись):`)
    for (const v of sections.declared) {
      // Объявленная ячейка БЕЗ мелкой цели тоже здесь (так её отдаёт `classify`),
      // и строкой, а не молчанием: заголовок без строк читался бы как сбой печати.
      // На ЭТОЙ шкале мелкой нет, а на другой есть — цель выросла по шкале, и
      // это не протухание. Ссылка на «ОБЪЯВЛЕНО, НО НЕТ» — только когда случай
      // там действительно назван, иначе она отсылала бы к секции, которой нет.
      if (!v.small.length) {
        const why = absentCases.has(caseOf(v.at))
          ? 'мелкой цели НЕТ — см. «ОБЪЯВЛЕНО, НО НЕТ»'
          : 'на этой шкале мелкой цели нет — выросла по шкале'
        console.log(`  ${v.at.padEnd(40)} ${why}\n    ${human(v.url)}`)
      }
      for (const t of v.small) console.log(`  ${v.at.padEnd(40)} ${size(t).padEnd(11)} ${t.path}  довод «${v.row.tinyTargets}»\n    ${human(v.url)}`)
    }
  }

  if (sections.violations.length) {
    const w = sections.violations[0]
    const inComps = new Set(sections.violations.map((v) => v.c)).size
    // Та же мера, что у разрыва в `targetSections`: непопадаемая прежде мелкой, из мелких — меньшая.
    // `startsWith`, а не `===`: `missWord` с `coveredBy` отдаёт «НЕ ПОПАСТЬ: …»
    // (m1) — точное сравнение находило только старый предикат без поля и на
    // живом каталоге не срабатывало НИКОГДА, отчего худшей всегда выходила
    // мелкая цель, даже рядом с непопадаемой.
    const worst = charged(w).find(({ kind }) => kind.startsWith('НЕ ПОПАСТЬ'))
      ?? charged(w).sort((a, b) => Math.min(a.t.width, a.t.height) - Math.min(b.t.width, b.t.height))[0]
    console.error(
      `ЦЕЛЬ КЛИКА: ${sections.violations.length} нарушающих ячеек в ${inComps} компонентах; худшее — ${w.at}: `
      + `${worst ? `${worst.t.path} ${size(worst.t)} (${worst.kind})` : '(цель не названа)'}`,
    )
    for (const v of sections.violations) console.error(lines(v, human(v.url), charged(v)).join('\n'))
  }
  if (far.length) {
    console.error(`НЕ ДОСТАТЬ ${farCount} ${farCount === 1 ? 'цель' : 'целей'} в ${far.length} ячейках — ни один угол не во вьюпорте даже после прокрутки, попадание не снято:`)
    for (const m of far) {
      console.error(lines(m, human(m.url), m.unreachable.map((t) => ({ t, kind: 'не достать' }))).join('\n'))
    }
  }
  if (absent.length) {
    console.error(`ОБЪЯВЛЕНО, НО НЕТ ${absent.length} — мелкой цели в ячейке нет; снять tinyTargets с фикстуры или вернуть случаю смысл:`)
    for (const v of absent) console.error(`  ${v.at}: целей ${v.total}, мельче ${FLOOR} — ни одной; довод «${v.row.tinyTargets}»\n    ${human(v.url)}`)
  }
  if (sections.stale.length) {
    console.error(`УСТАРЕВШЕЕ ИСКЛЮЧЕНИЕ ${sections.stale.length} — снять строку из KNOWN:`)
    for (const x of sections.stale) console.error(`  ${x.at}: ${x.why}, задача ${x.code}`)
  }

  if (sections.badCount) {
    console.error(`\n${area}; ${narrowed}`)
    console.error(
      `TARGETS FAIL — ${sections.violations.length} нарушающих ячеек вне списка, ${farCount} целей не достать, `
      + `${sections.stale.length} устаревших исключений, ${absent.length} объявленных без мелкой цели, `
      + `${unmeasured.length} не измерено.`,
    )
    return false
  }

  console.log(`TARGETS OK — 0 нарушений вне списка; известно ${sections.known.length}, объявлено ${sections.declared.length}; ${area}; ${narrowed}`)
  return true
}

/** Строка 1 матрицы. Точка входа — `scripts/case-matrix.mjs`. */
export const targetsRow = {
  name: 'ЦЕЛЬ КЛИКА',
  scales: SCALES,
  arg: SETTLE_MS,
  probe,
  sentinel: async (page, run) => {
    await page.evaluate(() => {
      const host = document.querySelector('.wbf-host')
      const tiny = document.createElement('button')
      tiny.className = 'ds-targets-sentinel'
      tiny.style.cssText = 'display:block;box-sizing:border-box;width:10px;height:10px;min-width:0;min-height:0;padding:0;border:0'
      const wrap = document.createElement('div')
      wrap.className = 'ds-targets-sentinel-wrap'
      wrap.style.cssText = 'position:relative;width:40px;height:40px'
      const covered = document.createElement('button')
      covered.className = 'ds-targets-sentinel-covered'
      covered.style.cssText = 'display:block;box-sizing:border-box;width:40px;height:40px;padding:0;border:0'
      const veil = document.createElement('div')
      veil.className = 'ds-targets-sentinel-veil'
      veil.style.cssText = 'position:absolute;inset:0'
      wrap.append(covered, veil)
      host.append(tiny, wrap)
    })
    let got
    try {
      got = await run(0)
    } finally {
      // Ходок даёт санитару свою страницу, но прибрать подложенное — дело
      // подложившего: следующий, кто получит этот кадр, его не ждёт.
      await page.evaluate(() => {
        for (const n of document.querySelectorAll('.ds-targets-sentinel, .ds-targets-sentinel-wrap')) n.remove()
      })
    }
    const scan = got?.scan
    const tiny = scan?.small?.find((t) => t.path.endsWith('button.ds-targets-sentinel'))
    const covered = scan?.unhittable?.find((t) => t.path.endsWith('button.ds-targets-sentinel-covered'))
    const miss = [
      ...(tiny ? [] : [`кнопка 10×10 не в small (small: ${scan?.small?.map((t) => t.path).join(', ') || 'пусто'})`]),
      ...(covered ? [] : [`кнопка 40×40 под вуалью не в unhittable (unhittable: ${scan?.unhittable?.map((t) => t.path).join(', ') || 'пусто'})`]),
    ]
    return miss.length ? `санитар цели клика: ${miss.join('; ')}` : null
  },
  verdict,
  report,
}
