import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { effectiveTmpdir, tempRoot, tempRootManual } from './tmp-sandbox'

/**
 * Гигиена временных каталогов (DS-165).
 *
 * Гейты сеяли в `/tmp` каталоги с git-репозиториями внутри и не сносили ничего:
 * 6503 штуки на момент починки, 53% inode на tmpfs, рост ~сотня в час активной
 * работы. Нашёл это не прогон, а сосед по машине, у которого от этого кончались
 * inode, — то есть до DS-165 у утечки НЕ БЫЛО наблюдателя вообще.
 *
 * ЗАЧЕМ ЭТОТ ФАЙЛ, если песочница прогона (`vitest.globalSetup.ts`) и так всё
 * сносит. Затем, что уборка без проверки молча поглощает каждую будущую утечку:
 * новый забытый `mkdtemp` попадает в общий снос, никто о нём не узнаёт, и слой
 * держится ровно до того дня, когда его случайно снимут.
 *
 * И затем, что провал ПЕСОЧНИЦЫ приходит вне теста: vitest печатает
 * «Test Files N passed / Tests N passed» и валит прогон только кодом возврата.
 * Измерено у потребителя на намеренной утечке в его наборе — глаз, идущий по
 * строке «Tests», такого провала не видит. Утверждения ниже — обычные тесты,
 * поэтому они краснеют ТАМ, КУДА СМОТРЯТ.
 */

const ROOT = resolve(__dirname, '../..')

/**
 * Обход — три каталога и ДВА ЯЗЫКА (DS-191).
 *
 * До этого гейт назывался «временные каталоги заводятся только через
 * tmp-sandbox», а смотрел в `src` и `workbench` по фильтру `/\.tsx?$/`.
 * Каталога `scripts/` для него не существовало ни по каталогу, ни по
 * расширению — а там четыре точки создания, и три из них шаги `check-full`
 * (`smoke`, `smoke-ssr`, `smoke-upgrade`), каждая разворачивает `npm install`
 * целого приложения.
 *
 * Течи на момент правки НЕТ: все четыре убирают за собой, проверено чтением.
 * Задача не про сегодняшний мусор, а про то, что снятый `trap` никто не
 * покажет. Ровно тот разряд, ради которого гейт и заводился (DS-165):
 * не «убрать», а «сделать завтрашнюю утечку наблюдаемой». Второй слой их тоже
 * не держит — TMPDIR подменяет `vitest.globalSetup.ts`, а `.sh` запускаются
 * отдельными npm-скриптами мимо vitest.
 *
 * ОДИН ГЕЙТ, А НЕ ДВА, хотя языков два. Предмет один: временный каталог
 * заведён, и за снос никто не отвечает. Две проверки об одном расходятся —
 * этим репозиторием уже плачено (два превью одного компонента, `docs/guards.md`).
 * Разное — набор СЛОВ, и он вынесен в таблицу по языку, а не размазан по
 * регулярке, которая пыталась бы накрыть оба.
 */
const JS = /\.[cm]?[jt]sx?$/
/** `#`-комментарии и отсутствие песочницы — то, что `.pl` делит с shell. */
const HASH = /\.(?:sh|pl)$/

const SCANNED = ['src', 'workbench', 'scripts']

function sources(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sources(path, acc)
    else if (JS.test(name) || HASH.test(name)) acc.push(path)
  }
  return acc
}

/**
 * Комментарии вырезаются до поиска: без этого гейт краснел бы от собственного
 * объяснения. Строковые литералы остаются — вызов, собранный из строки, это
 * обход, а не описание.
 *
 * Блочный комментарий заменяется на СЕБЯ ЖЕ с сохранёнными переводами строк, а
 * не на пустоту (DS-189): гейт печатает адрес `файл:строка`, и номер
 * считается по уже вычищенному тексту — схлопнутая шапка увела бы его ровно на
 * своё число строк.
 *
 * `(^|[^:])` перед `//` — не украшение: без него регулярка съедает `://` в
 * любом `http://…`, а с ним и ВЕСЬ ХВОСТ СТРОКИ. Файл, начинающийся с адреса в
 * шапке, потерял бы всё после него, и гейт ЗАЗЕЛЕНЕЛ БЫ НА ПУСТОТЕ. Это
 * единственная часть гейта, которая до DS-191 не имела мутации, — то
 * есть тихо-зелёное место того же класса, что перечислены в
 * `docs/writing-checks.md`. Утверждение о ней ниже, отдельным тестом.
 */
const blankKeepingLines = (m: string) => m.replace(/[^\n]/g, ' ')

export const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, blankKeepingLines).replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/** У `#`-языков комментарий — СТРОКА, начинающаяся с решётки, и только она. */
export const stripHashComments = (src: string): string =>
  src.split('\n').map((l) => (/^\s*#/.test(l) ? '' : l)).join('\n')

const lineOf = (src: string, index: number): number => src.slice(0, index).split('\n').length

/**
 * Файлы, которым `mkdtempSync`/`tmpdir()` разрешены: хелпер, который их и
 * инкапсулирует, и этот гейт, где они встречаются как искомые строки.
 */
const ALLOWED = new Set(['src/__guards__/tmp-sandbox.ts', 'src/__guards__/tmp-hygiene.test.ts'])

/**
 * ПРАВИЛО РАЗНОЕ В ДВУХ ДЕРЕВЬЯХ, и это не поблажка `scripts/`.
 *
 * В `src` и `workbench` требование строгое — только через `tmp-sandbox`: там
 * песочница ЕСТЬ, её ставит `vitest.globalSetup.ts`, и обходить её нечем, кроме
 * забывчивости.
 *
 * В `scripts/` песочницы нет по устройству: `.sh` запускаются npm-скриптами
 * мимо vitest, а `release.mjs` — руками. Требовать там несуществующий хелпер
 * значило бы либо выдать всем четверым вечное исключение (то есть выключить
 * проверку и назвать это решением), либо тянуть песочницу в shell. Поэтому
 * правило слабее, но ПРОВЕРЯЕМО: создание и снос лежат в одном файле и
 * связаны ОДНИМ ИМЕНЕМ. Снятый `trap` рвёт связь — и это ровно то, что задача
 * просила сделать видимым.
 */
const SANDBOXED = ['src/', 'workbench/']

interface Hit { at: string; what: string }

/** Точки создания в JS-файле, где песочницы нет: имя, к которому привязан путь. */
function jsUnbound(rel: string, code: string): Hit[] {
  const out: Hit[] = []
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=[^\n]*?\b(?:mkdtempSync?|tmpdir)\s*\(/g)) {
    const name = m[1]!
    // Снос обязан звать ТО ЖЕ ИМЯ. `rmSync` где-то рядом в файле не считается:
    // утечка DS-165 жила именно так — `rmSync` был, но сносил другое
    // (каталог компонента ВНУТРИ временного репозитория), и файл с ним тёк
    // сильнее всех.
    const removed = new RegExp(`\\b(?:unlinkSync|rmSync|rmdirSync|rm)\\s*\\(\\s*${name}\\b`).test(code)
    if (!removed) out.push({ at: `${rel}:${lineOf(code, m.index!)}`, what: `${name} заведён и не снесён в этом же файле` })
  }
  // Вызов, не привязанный к имени вовсе, снести нечем в принципе.
  for (const m of code.matchAll(/\b(?:mkdtempSync?|tmpdir)\s*\(/g)) {
    const before = code.slice(Math.max(0, m.index! - 120), m.index!)
    if (!/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=[^\n]*$/.test(before)) {
      out.push({ at: `${rel}:${lineOf(code, m.index!)}`, what: 'путь во временном каталоге не привязан к имени — сносить нечего' })
    }
  }
  return out
}

/** Точки создания в shell: `VAR=$(mktemp …)` обязан иметь `trap`, сносящий `$VAR`. */
function shUnbound(rel: string, code: string): Hit[] {
  const out: Hit[] = []
  const traps = [...code.matchAll(/\btrap\s+(['"])([\s\S]*?)\1/g)].map((m) => m[2]!)
  for (const m of code.matchAll(/^[ \t]*([A-Za-z_][\w]*)=[^\n]*\bmktemp\b/gm)) {
    const name = m[1]!
    const guarded = traps.some((t) => /\brm\b[^\n]*-[a-z]*r/.test(t) && t.includes(`$${name}`))
    if (!guarded) out.push({ at: `${rel}:${lineOf(code, m.index!)}`, what: `$${name} заведён mktemp, и ни один trap его не сносит` })
  }
  for (const m of code.matchAll(/\bmktemp\b/g)) {
    const line = code.slice(code.lastIndexOf('\n', m.index!) + 1, m.index!)
    if (!/^[ \t]*[A-Za-z_][\w]*=/.test(line)) {
      out.push({ at: `${rel}:${lineOf(code, m.index!)}`, what: 'mktemp не присвоен переменной — сносить нечего' })
    }
  }
  return out
}

describe('песочница /tmp на прогон', () => {
  it('подмена TMPDIR доехала до воркера — иначе вся уборка мнимая', () => {
    // Не `process.env.TMPDIR === process.env.TMPDIR`: присвоение переменной и
    // видимость её для Node — разные утверждения. В PHP тот же приём вообще
    // не работает (`sys_get_temp_dir()` кеширует на процесс), так что «должно
    // же работать» здесь не аргумент, а повод проверить.
    expect(process.env.DS_TMP_SANDBOX, 'globalSetup не отработал').toBeTruthy()
    expect(effectiveTmpdir()).toBe(process.env.DS_TMP_SANDBOX)
  })

  it('tempRoot заводит каталог ВНУТРИ песочницы', () => {
    const sandbox = process.env.DS_TMP_SANDBOX ?? ''
    const dir = tempRoot('probe-')
    expect(existsSync(dir)).toBe(true)
    expect(sandbox).not.toBe('')
    expect(dir.startsWith(sandbox + sep)).toBe(true)
  })

  it('tempRootManual сносит по своему remove()', () => {
    const { dir, remove } = tempRootManual('probe-manual-')
    expect(existsSync(dir)).toBe(true)
    remove()
    expect(existsSync(dir)).toBe(false)
  })
})

/** Все файлы обхода вместе с уже вычищенным текстом и языком. */
const FILES = SCANNED.flatMap((s) => sources(resolve(ROOT, s))).map((path) => {
  const rel = relative(ROOT, path).split(sep).join('/')
  const raw = readFileSync(path, 'utf8')
  const js = JS.test(path)
  return { rel, js, code: js ? stripComments(raw) : stripHashComments(raw) }
})

describe('временные каталоги заводятся только через tmp-sandbox', () => {
  it('никто в src и workbench не зовёт mkdtemp или tmpdir напрямую', () => {
    const offenders: string[] = []
    for (const f of FILES) {
      if (!SANDBOXED.some((d) => f.rel.startsWith(d)) || ALLOWED.has(f.rel)) continue
      for (const [what, re] of [
        ['mkdtemp', /\bmkdtempSync?\s*\(/],
        ['tmpdir()', /\btmpdir\s*\(/],
      ] as const) {
        const m = re.exec(f.code)
        if (m) offenders.push(`${f.rel}:${lineOf(f.code, m.index)} — ${what}`)
      }
    }
    // Утечка была не в отсутствии `rmSync` где-то рядом, а в том, что снос и
    // создание жили в разных местах: в `release-flow.helpers.ts` `rmSync` БЫЛ —
    // он сносил каталог компонента внутри временного репозитория. Поэтому
    // проверка требует единой точки создания, а не наличия слова «rmSync» в
    // файле: второе прошло бы на том самом файле, который тёк сильнее всех.
    expect(
      offenders,
      'временный каталог заводится мимо tempRoot()/tempRootManual() из'
        + ' src/__guards__/tmp-sandbox.ts — снос за него никто не отвечает:\n'
        + offenders.join('\n'),
    ).toEqual([])
  })

  it('в scripts/ создание и снос связаны одним именем', () => {
    const offenders: string[] = []
    for (const f of FILES) {
      if (!f.rel.startsWith('scripts/')) continue
      for (const h of f.js ? jsUnbound(f.rel, f.code) : shUnbound(f.rel, f.code)) {
        offenders.push(`${h.at} — ${h.what}`)
      }
    }
    expect(
      offenders,
      'в scripts/ песочницы нет по устройству, поэтому снос обязан лежать в том же'
        + ' файле и звать то же имя — снятый trap рвёт связь молча:\n' + offenders.join('\n'),
    ).toEqual([])
  })

  it('литеральный путь /tmp/ обходит оба слоя и потому запрещён', () => {
    // `mkdirSync('/tmp/foo')` не зовёт ни `mkdtemp`, ни `tmpdir()`, и подмену
    // TMPDIR игнорирует по построению: путь абсолютный. Гейт, ищущий ВЫЗОВ,
    // такое пропускает молча — дыру нашёл потребитель у себя и
    // считал закрытой здесь; она не была.
    const offenders: string[] = []
    for (const f of FILES) {
      if (f.rel === 'src/__guards__/tmp-hygiene.test.ts') continue
      for (const m of f.code.matchAll(/(['"`])\/tmp\//g)) {
        offenders.push(`${f.rel}:${lineOf(f.code, m.index!)}`)
      }
    }
    expect(
      offenders,
      'литеральный /tmp/ мимо песочницы и мимо TMPDIR:\n' + offenders.join('\n'),
    ).toEqual([])
  })

  it('обход не выродился: площадь на месте и оба языка в ней', () => {
    // Ноль нарушений из нуля файлов — это «мы туда не смотрели». Числа грубые:
    // они ловят обвал охвата, а не рост дерева.
    expect(FILES.length, 'обход не нашёл исходников').toBeGreaterThan(400)
    for (const d of ['src/', 'workbench/', 'scripts/']) {
      expect(FILES.some((f) => f.rel.startsWith(d)), `${d} выпал из обхода`).toBe(true)
    }
    expect(FILES.filter((f) => !f.js).map((f) => f.rel).sort(), 'не-JS файлы обхода').toEqual([
      'scripts/find-unlabeled-fields.pl',
      // Каталог фикстур для промтов браузерному агенту (DS-212). Временных
      // каталогов не заводит вовсе — только читает `src/components/*/*.fixture.tsx`
      // и печатает; в списке он ради того, чтобы попадание в обход было
      // объявленным, а не случайным.
      'scripts/fixture-catalog.sh',
      'scripts/smoke-consumer.sh',
      'scripts/smoke-delivery.sh',
      'scripts/smoke-ssr.sh',
      'scripts/smoke-upgrade.sh',
    ])
    // И все настоящие точки создания в scripts/ обходом ВИДНЫ: без этого
    // зелёное утверждение выше неотличимо от «регулярки ничего не находят».
    const seen = FILES.filter((f) => f.rel.startsWith('scripts/') && /\bmktemp\b|\btmpdir\s*\(/.test(f.code))
    expect(seen.map((f) => f.rel).sort()).toEqual([
      // Чистые половины строк матрицы — модули `.ts`, а скрипты node, поэтому
      // `loadTs` (DS-177) собирает их esbuild-ом во временный каталог и
      // импортирует оттуда — тем же приёмом, что `ssrMarkup` в
      // `measure-invariants.mjs` ниже. Снос в `finally`, И ЕЩЁ в
      // `process.on('exit'|'SIGINT')`: Ctrl+C приходит сигналом, `finally` при
      // этом не отрабатывает, и мусор копится у того, кто чаще всех прерывает
      // прогон. Жил в `case-overflow.mjs` до выноса общего ходка: `loadTs`
      // уехал вместе с обвязкой, вызов остался у строки.
      'scripts/case-walk.mjs',
      // Сетевая половина `make published` (JIG-3): скачанный ассет и
      // локальный `npm pack` того же тега — оба во временных каталогах,
      // каждый создатель возвращает `{ path, cleanup }` вместо сноса на
      // месте, потому что оба файла нужны ОДНОВРЕМЕННО для сравнения
      // содержимого — снос раньше времени сравнивать стало бы нечем.
      'scripts/check-published.mjs',
      // Снимает разметку С КОМПОНЕНТА в Node (DS-205): тот же приём, что
      // у `render-preview.mjs` — бандл кладётся во временный каталог и оттуда
      // импортируется. Снос в `finally` там же, рядом с созданием.
      'scripts/measure-invariants.mjs',
      'scripts/release.mjs',
      // Собирает превью из компонента (DS-156): бандл фикстуры кладётся
      // во временный каталог и оттуда импортируется. Снос обязателен не только
      // из общих соображений — гейт `preview-render` зовёт этот скрипт
      // подпроцессом ИЗ-ПОД vitest, и один оставленный каталог валит весь
      // прогон песочницей `vitest.globalSetup.ts`.
      'scripts/render-preview.mjs',
      'scripts/smoke-consumer.sh',
      // Один `mktemp -d` на всё (клон, bare, изолированный HOME, приложение) и
      // один trap рядом с ним (DS-246). Каталогов внутри четыре, но
      // заводится и сносится ОДИН корень — то, чего требует утверждение выше:
      // четыре имени под четырьмя `rm` рвались бы молча на первом же `exit`.
      'scripts/smoke-delivery.sh',
      'scripts/smoke-ssr.sh',
      'scripts/smoke-upgrade.sh',
    ])
  })
})

/**
 * Вырезатель комментариев — единственная часть гейта, которая до DS-191
 * не имела мутации. Сломанный вырезатель не краснеет: он МОЛЧА укорачивает
 * текст, и гейт зеленеет на пустоте.
 */
describe('вырезатель комментариев', () => {
  it('не съедает :// и хвост строки за ним', () => {
    const src = "// см. http://example.com/x\nconst a = mkdtempSync('x')"
    expect(stripComments(src)).toContain('mkdtempSync')
    // И `://` внутри КОДА, а не комментария, тоже остаётся на месте.
    expect(stripComments("const u = 'https://example.com'")).toContain('https://example.com')
  })

  it('вырезает то, ради чего написан', () => {
    expect(stripComments('/* mkdtempSync( */ const a = 1')).not.toContain('mkdtempSync')
    expect(stripComments('// tmpdir(\nconst a = 1')).not.toContain('tmpdir(')
  })

  it('сохраняет переводы строк — иначе адрес уезжает на длину шапки', () => {
    const src = ['/**', ' * шапка', ' * на', ' */', "const a = mkdtempSync('x')"].join('\n')
    const code = stripComments(src)
    expect(lineOf(code, code.indexOf('mkdtempSync'))).toBe(5)
  })

  it('у #-языков комментарий — только строка целиком', () => {
    // `$#` и `${x#y}` — не комментарии, и съесть их значило бы срезать код.
    expect(stripHashComments('# mktemp -d\nAPP=$(mktemp -d)')).not.toContain('# mktemp')
    expect(stripHashComments('APP=$(mktemp -d)')).toContain('mktemp')
    expect(stripHashComments('echo "${APP#/tmp}" $#')).toContain('${APP#/tmp}')
  })
})
