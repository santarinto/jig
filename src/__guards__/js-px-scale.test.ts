import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import ts from 'typescript'

/**
 * A px value computed in JS is the one metric no CSS check can see.
 * `src/__guards__/rem-units.test.ts` reads stylesheets; a `${n}px` built inside a
 * `style={{…}}` object never appears there, so a component can silently opt its
 * own size out of `--ds-ui-scale` while every other check stays green.
 *
 * The system's rule, set by BarChart's `height`, DonutChart's `size` and
 * SideNav's `width`: a numeric size prop is an interface size and must be
 * emitted as `calc(<n>px * var(--ds-ui-scale, 1))`. Skeleton was the outlier —
 * its numeric `width`/`height` came out as bare px, so at a scaled-up interface
 * the placeholder no longer matched the content it stood in for. Callers who
 * genuinely want a fixed size pass a string, which is forwarded verbatim.
 */
const SRC = resolve(__dirname, '..')

/**
 * Охват — весь `src`, а не только `src/components`, и `.ts` наравне с `.tsx`.
 *
 * Пока смотрели одни компоненты, метрика могла уехать в общий модуль и стать
 * невидимой для этой проверки: `colWidth` в `src/internal/columns.ts` считает
 * ширину колонки для ВСЕХ таблиц системы, и голый `${w}px` там гейт пропускал
 * (проверено внесением нарушения до расширения охвата — тест оставался
 * зелёным). Дефект от места объявления не зависит, а проверка зависела.
 */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      // Сам гейт себя не проверяет: в нём `${x}px` живёт внутри регулярки и
      // примеров нарушений — это описание дефекта, а не дефект.
      if (e.name === '__guards__') continue
      out.push(...sourceFiles(p))
    } else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.')) out.push(p)
  }
  return out
}

/**
 * РАЗБОР ВЫРАЖЕНИЯ, А НЕ СТРОКИ ТЕКСТА (DS-202).
 *
 * До разбора гейт работал по строке файла: нашёл `${…}px` — подозрение, нашёл
 * где-нибудь в той же строке `var(--ds-ui-scale` — снял. Прогон логики на
 * четырёх входах показал, что это ошибается В ОБЕ СТОРОНЫ, и обе — молча:
 *
 *   ПРОПУСКАЛ  style={{ width: `${n}px` }} // мимо var(--ds-ui-scale), так надо
 *   ПРОПУСКАЛ  style={{ width: `${n}px`, gap: 'var(--ds-ui-scale)' }}
 *   КРАСНЕЛ    calc(${current}px *   ← корректное выражение, разорванное по строкам
 *
 * Второй пропуск страшнее первого: он не требует злого умысла. Достаточно,
 * чтобы в том же объекте стилей рядом стояло любое свойство со шкалой, и
 * соседнее нарушение перестаёт быть видимым — так дефект и въезжает.
 *
 * Это тот самый разряд, который в CLAUDE.md записан ценой 4.0.1: команда мерила
 * СТРОКУ, а вызов у потребителя был многострочный.
 *
 * Условие теперь формулируется точно: ШАБЛОННАЯ СТРОКА, у которой к подстановке
 * приклеено `px`, обязана содержать `var(--ds-ui-scale` В СЕБЕ САМОЙ.
 *
 * Токен ищется только в ЛИТЕРАЛЬНЫХ кусках шаблона (голова, середины, хвосты),
 * а не в тексте всего узла: подстановка — это выражение, и её текст мог бы
 * принести токен из имени переменной или комментария внутри неё, то есть из
 * места, которое в результат не попадает. Если однажды понадобится шкала,
 * приходящая ИЗ подстановки (`calc(${n}px * ${SCALE})`), это придётся разрешить
 * отдельно и поимённо — сегодня в дереве такого нет, и молчаливо разрешать
 * целый класс ради несуществующего случая нельзя.
 *
 * Чего делать НЕЛЬЗЯ: вырезать строковые литералы целиком. Подстановка в
 * шаблоне — это и есть место, где живёт настоящий дефект.
 */
const SCALE = 'var(--ds-ui-scale'

/** `px` сразу после `}` и не как начало более длинного слова (`pxRatio`). */
const GLUED_PX = /^px(?![a-zA-Z0-9_-])/

interface Offender {
  /** 1-индексная строка, где НАЧИНАЕТСЯ шаблон. */
  line: number
  text: string
}

function scaleless(source: string, fileName: string): Offender[] {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const out: Offender[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isTemplateExpression(node)) {
      const glued = node.templateSpans.some((s) => GLUED_PX.test(s.literal.text))
      if (glued) {
        const literals = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)]
        if (!literals.some((t) => t.includes(SCALE))) {
          out.push({
            line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
            text: node.getText(sf).split('\n')[0]!.trim(),
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

/**
 * Единственная величина в пикселях, которую масштабировать НЕЛЬЗЯ.
 *
 * `gap` — ширина полосы прокрутки, измеренная у браузера
 * (`window.innerWidth - documentElement.clientWidth`), и компенсирует она
 * ровно её. Полоса прокрутки рисуется системой и от `.ds-scale` не растёт:
 * умножение на `--ds-ui-scale` компенсировало бы величину, которой нет, и
 * сдвигало бы страницу под открытой модалкой.
 *
 * Исключение записано парой «файл + признак строки», а не отключением файла
 * целиком: любой ДРУГОЙ px в том же файле гейт по-прежнему ловит. Признак
 * сверяется со строкой, где начинается шаблон, — та же точность, что была до
 * разбора, и та же, что описана в комментарии выше.
 */
const ALLOWED = [
  { file: join('internal', 'useOverlayIsolation.ts'), needle: 'document.body.style.paddingRight' },
]

function sweep(files: string[], allowed: typeof ALLOWED): string[] {
  const offenders: string[] = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const lines = source.split('\n')
    const rel = relative(SRC, file)
    for (const o of scaleless(source, file)) {
      const lineText = lines[o.line - 1] ?? ''
      if (allowed.some((a) => rel.endsWith(a.file) && lineText.includes(a.needle))) continue
      offenders.push(`${rel}:${o.line}: ${o.text}`)
    }
  }
  return offenders
}

describe('px computed in JS', () => {
  it('always goes through the UI scale', () => {
    const files = sourceFiles(SRC)
    const offenders = sweep(files, ALLOWED)
    expect(
      offenders,
      `px из JS в обход --ds-ui-scale:\n${offenders.join('\n')}`,
    ).toEqual([])

    // Счётчик — не украшение: обход, вернувший пусто (переименовали каталог,
    // сузили расширение), даёт зелёный тест, который ничего не читал. Числа
    // намеренно грубые — они ловят обвал охвата, а не рост файлов.
    expect(files.length, 'обход не нашёл исходников — охват сломан').toBeGreaterThan(50)
    expect(
      files.some((f) => f.endsWith(join('internal', 'columns.ts'))),
      'общие модули вне охвата — метрика уедет туда и станет невидимой',
    ).toBe(true)

    // Разрешение, пережившее свой повод, — это дыра, которая выглядит как
    // решение. Если строка уехала или файл переписан, исключение снимается
    // здесь, а не обнаруживается через год пропущенным дефектом.
    for (const a of ALLOWED) {
      const file = files.find((f) => f.endsWith(a.file))
      expect(file, `исключение ${a.file} указывает на несуществующий файл`).toBeDefined()
      expect(
        readFileSync(file!, 'utf8').includes(a.needle),
        `исключение ${a.file} больше не находит «${a.needle}» — повод исчез`,
      ).toBe(true)
    }
  })

  /**
   * Против способа 3 из `docs/writing-checks.md`: детектор, который перестал
   * находить, зелен на любом дереве и от работающего неотличим. Утверждение
   * выше («нарушений нет») сегодня стоит ровно столько, сколько стоит вот это.
   *
   * Вход — те самые четыре случая, на которых был пойман построчный текстовый
   * поиск. Первые три ОБЯЗАНЫ ловиться, четвёртый — нет.
   */
  it('детектор ловит нарушение и не ловит корректное выражение', () => {
    const hits = (src: string) => scaleless(src, 'fixture.tsx').map((o) => o.line)

    // 1. Голое нарушение.
    expect(hits('const a = <div style={{ width: `${n}px` }} />')).toEqual([1])

    // 2. Токен в КОММЕНТАРИИ той же строки подозрение не снимает.
    expect(
      hits('const a = <div style={{ width: `${n}px` }} /> // мимо var(--ds-ui-scale), так надо'),
    ).toEqual([1])

    // 3. Токен в СОСЕДНЕМ свойстве того же объекта — тоже не снимает. Это и
    //    есть случай, который не требует злого умысла.
    expect(
      hits("const a = <div style={{ width: `${n}px`, gap: 'var(--ds-ui-scale)' }} />"),
    ).toEqual([1])

    // 4. Корректное выражение, РАЗОРВАННОЕ ПО СТРОКАМ, нарушением не является.
    expect(
      hits(
        [
          'const a = (',
          '  <div',
          '    style={{',
          '      flexBasis: `calc(${current}px *',
          '        var(--ds-ui-scale, 1))`,',
          '    }}',
          '  />',
          ')',
        ].join('\n'),
      ),
    ).toEqual([])

    // Однострочный корректный вид — контроль, что зелёное выше не от того, что
    // детектор вообще ослеп на многострочном.
    expect(hits('const a = <div style={{ width: `calc(${n}px * var(--ds-ui-scale, 1))` }} />')).toEqual([])

    // `px` не приклеено — не размер, а часть слова или другой суффикс.
    expect(hits('const a = `${n}pxRatio`')).toEqual([])
    expect(hits('const a = `${n}rem`')).toEqual([])
    // Литеральный px без подстановки — граница, тень; к размеру интерфейса
    // отношения не имеет и раньше не имело.
    expect(hits('const a = `1px solid red`')).toEqual([])
    expect(hits("const a = '1px'")).toEqual([])

    // Два нарушения в одном файле — оба, а не первое: гейт печатает список.
    expect(
      hits(['const a = `${n}px`', 'const b = `${m}px`'].join('\n')),
    ).toEqual([1, 2])
  })

  /**
   * И то же самое со стороны репозитория: гейт обязан ВИДЕТЬ настоящее
   * попадание в живом дереве, а не только в фикстуре. Снятие единственного
   * исключения обязано покраснеть — если не краснеет, значит обход перестал
   * доходить до файла, и зелёный основного утверждения ничего не значит.
   */
  it('не онемел на дереве: снятое исключение обнажает ровно одно попадание', () => {
    const bare = sweep(sourceFiles(SRC), [])
    expect(bare).toHaveLength(1)
    expect(bare[0]).toContain(join('internal', 'useOverlayIsolation.ts'))
    expect(bare[0]).toContain('${gap}px')
  })
})
