import { describe, it, expect } from 'vitest'
import { writeFileSync, rmSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { tempRoot } from './tmp-sandbox'

/**
 * Команда поиска из CHANGELOG обязана РАЗЛИЧАТЬ два состояния (DS-131).
 *
 * В 4.0.1 у пункта «поле без пропа `label` теперь безымянно вовсе» стояла
 * однострочная команда `grep … | grep -v "label="`. Она меряет СТРОКУ, а JSX у
 * потребителя многострочный: `label=` уходит на следующую строку, и поле с
 * подписью объявляется безымянным. У потребителя вышло 45 попаданий против
 * 7 настоящих — завышение в шесть раз, при том что регрессии у него не было
 * вовсе. Пункт с такой командой ХУЖЕ пункта без команды: потребитель либо
 * тонет в выводе, либо перестаёт верить пункту, и оба исхода выглядят работой.
 *
 * Проверяется здесь не счётчик, а различение. «Команда стала печатать меньше»
 * — не доказательство: меньше печатает и команда, сломанная в другую сторону.
 * Поэтому фикстура держит ТРИ состояния сразу, и одно из них — ловушка,
 * которая уже сработала:
 *
 * 1. подпись на отдельной строке — НЕ должно попасть в вывод;
 * 2. подписи нет вовсе — должно;
 * 3. подпись ПОСЛЕ `onChange={() => …}` — не должно, и вот здесь первая версия
 *    регекса молча резала тег пополам: стрелка содержит `>`, а класс `[^<>]`
 *    его исключает. По числу попаданий это выглядело правдоподобно.
 *
 * Ниже поэтому два прогона, а не один: наивная форма обязана ОШИБИТЬСЯ на той
 * же фикстуре. Утверждение «правильная команда права» зелено и на фикстуре, где
 * ошибиться нечем, — а тогда гейт не про команду, а про то, что perl запустился.
 */

const SCRIPT = resolve(__dirname, '../../scripts/find-unlabeled-fields.pl')

/** Три состояния в одном файле — так их не переставить местами по недосмотру. */
const FIXTURE = `import { TextField, Select } from 'ds-1c-taxi'

export function Form() {
  return (
    <>
      <TextField
        name="sum"
        label="Сумма к оплате"
        onChange={(e) => setSum(e.target.value)}
      />
      <TextField
        name="note"
        onChange={(e) => setNote(e.target.value)}
      />
      <Select
        options={CURRENCIES}
        onChange={(e) => setCur(e.target.value)}
        label="Валюта"
      />
    </>
  )
}
`

/**
 * Вторая фикстура, под булев атрибут и под адрес. Отдельная, а не дописанная к
 * первой: у той предмет — многострочность, и любая добавленная строка сбивала бы
 * её счётчики. Одна фикстура на два предмета — это два предмета, которые нельзя
 * менять по отдельности.
 */
const BOOL_FIXTURE = `export function Form() {
  return (
    <>
      <SearchBar
        value={q}
        onChange={setQ}
        disabled={locked}
      />
      <DatePicker value={d} onChange={setD} />
      <FileDrop files={f} onFiles={setF} disabled />
    </>
  )
}
`

/**
 * Строка, где ОТКРЫВАЕТСЯ единственное по-настоящему безымянное поле, 1-based.
 * Открывающая, а не та, где стоит `name="note"`: разбор идёт по тегу, и адрес
 * он печатает от `<`. Считается из фикстуры, а не вписан числом — иначе первая
 * же вставка строки выше превратила бы утверждение в ложное срабатывание.
 */
const UNLABELED_LINE = FIXTURE.split('\n')
  .findIndex((l, i, all) => l.includes('<TextField') && all[i + 1]?.includes('name="note"')) + 1

function withFixture<T>(fn: (dir: string, file: string) => T): T {
  const dir = tempRoot('unlabeled-')
  const file = resolve(dir, 'Form.tsx')
  writeFileSync(file, FIXTURE)
  try {
    return fn(dir, file)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('команда поиска безымянных полей из CHANGELOG', () => {
  it('perl на машине есть — иначе гейт молчал бы, а не проверял', () => {
    // Пропуск по отсутствию инструмента — это зелёный, ничего не значащий.
    // Пусть падает громко: `docs/writing-checks.md`, «проверка, которая не
    // выполнилась, не отличается от пройденной».
    expect(() => execFileSync('perl', ['-v'], { stdio: 'ignore' })).not.toThrow()
  })

  it('находит поле без подписи и НЕ трогает два с подписью', () => {
    const out = withFixture((_dir, file) =>
      execFileSync('perl', ['-0777', '-n', SCRIPT, file], { encoding: 'utf8' }),
    )
    const lines = out.trim().split('\n').filter(Boolean)
    expect(lines, `разбор тега нашёл не то: ${out}`).toHaveLength(1)
    // Не «одна строка», а ИМЕННО та: длина сошлась бы и на промахе в обе стороны.
    expect(lines[0]).toContain('name="note"')
    expect(lines[0]).toMatch(new RegExp(`:${UNLABELED_LINE}:`))
    expect(out).not.toContain('name="sum"')
    expect(out).not.toContain('CURRENCIES')
  })

  it('однострочная форма из 4.0.1 на той же фикстуре ошибается — оба раза', () => {
    // Тот самый дефект, ради которого гейт написан. Без этого утверждения
    // проверка выше зелена и на фикстуре, где ошибиться нечем.
    const out = withFixture((_dir, file) => {
      const src = readFileSync(file, 'utf8')
      return src
        .split('\n')
        .filter((l) => /<(TextField|Textarea|Select|NumberField|Combobox|SearchBar)/.test(l))
        .filter((l) => !l.includes('label='))
        .join('\n')
    })
    // Три открывающих тега, у двух подпись есть — и всё равно три попадания:
    // на строке с именем компонента `label=` не бывает никогда.
    expect(out.split('\n').filter(Boolean)).toHaveLength(3)
  })

  it('MODE=with отвечает на тот же вопрос с другой стороны', () => {
    // Режим заведён под пункт выпуска «где у меня выключенные поля»
    // (DS-133). Проверяется не «что-то нашлось», а ДОПОЛНИТЕЛЬНОСТЬ: два
    // режима вместе обязаны дать все теги и ни одного дважды. Иначе режим,
    // молча теряющий тег, выглядел бы как «у тебя таких мест нет».
    const run = (mode: string) =>
      withFixture((_dir, file) =>
        execFileSync('perl', ['-0777', '-n', SCRIPT, file], {
          encoding: 'utf8',
          env: { ...process.env, FIND_MODE: mode },
        }),
      ).trim().split('\n').filter(Boolean)

    const without = run('without')
    const withAttr = run('with')
    expect(without).toHaveLength(1)
    expect(withAttr).toHaveLength(2)
    expect(withAttr.join(' ')).toContain('name="sum"')
    expect(withAttr.join(' ')).toContain('CURRENCIES')
    // Ни один тег не попал в оба ответа и ни один не потерялся: три тега в
    // фикстуре, три строки на два режима.
    expect(without.length + withAttr.length).toBe(3)
  })

  it('негодный FIND_MODE — падение, а не молчаливый ответ по умолчанию', () => {
    // Не теоретическая осторожность: переменная звалась `MODE` и на первом же
    // прогоне поймала чужое значение — `vitest` ставит `MODE=test` всему
    // процессу. Проверка значения превратила это в громкую смерть; без неё
    // скрипт ответил бы режимом по умолчанию, то есть на ПРОТИВОПОЛОЖНЫЙ
    // вопрос, и список выглядел бы правдоподобно.
    expect(() =>
      withFixture((_dir, file) =>
        execFileSync('perl', ['-0777', '-n', SCRIPT, file], {
          encoding: 'utf8',
          stdio: 'pipe',
          env: { ...process.env, FIND_MODE: 'ыыы' },
        }),
      ),
    ).toThrow()
  })

  it('булев атрибут без «=» считается, и адрес указывает на НАЧАЛО тега', () => {
    // Две находки одного прогона, обе тихие, обе про `FIND_MODE=with`.
    //
    // 1. `<FileDrop disabled />` — самая частая запись выключенного поля, а
    //    `\bdisabled=` её не видит. Команда отвечала бы «таких мест нет» на
    //    дереве, где они есть: правдоподобнее не бывает.
    // 2. Номер строки указывал ВНУТРЬ тега. `$-[0]` принадлежит последнему
    //    удавшемуся матчу, а проверка атрибута его затирает. В режиме
    //    `without` дефект спал: там внутренний матч у напечатанных тегов не
    //    удаётся, а неудачный `@-` не трогает.
    const dir = tempRoot('bool-')
    const file = resolve(dir, 'Form.tsx')
    writeFileSync(file, BOOL_FIXTURE)
    try {
      const out = execFileSync('perl', ['-0777', '-n', SCRIPT, file], {
        encoding: 'utf8',
        env: {
          ...process.env,
          FIND_TAGS: 'SearchBar|DatePicker|FileDrop',
          FIND_ATTR: 'disabled',
          FIND_MODE: 'with',
        },
      })
      const lines = out.trim().split('\n').filter(Boolean)
      expect(lines, `булев атрибут потерян: ${out}`).toHaveLength(2)
      const lineOf = (needle: string) =>
        Number(/:(\d+):/.exec(lines.find((l) => l.includes(needle)) ?? '')?.[1] ?? NaN)
      const src = BOOL_FIXTURE.split('\n')
      // Адрес сверяется с ФИКСТУРОЙ, а не с числом: вписанное число пережило бы
      // ровно тот сдвиг, ради которого проверка написана.
      expect(lineOf('SearchBar')).toBe(src.findIndex((l) => l.includes('<SearchBar')) + 1)
      expect(lineOf('FileDrop')).toBe(src.findIndex((l) => l.includes('<FileDrop')) + 1)
      expect(out, 'поле без атрибута попало в ответ «с атрибутом»').not.toContain('DatePicker')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('`aria-disabled` не считается за `disabled`', () => {
    // Граница `(?<![-\w])`: без неё соседний атрибут с тем же хвостом даёт
    // ложное срабатывание, и человек идёт чинить место, где всё в порядке.
    const dir = tempRoot('aria-')
    const file = resolve(dir, 'Form.tsx')
    writeFileSync(file, '<FileDrop files={f} onFiles={setF} aria-disabled />\n')
    try {
      const out = execFileSync('perl', ['-0777', '-n', SCRIPT, file], {
        encoding: 'utf8',
        env: { ...process.env, FIND_TAGS: 'FileDrop', FIND_ATTR: 'disabled', FIND_MODE: 'with' },
      })
      expect(out.trim(), `«aria-disabled» принят за «disabled»: ${out}`).toBe('')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('КАЖДАЯ команда из CHANGELOG ведёт себя как проверяемый скрипт', () => {
    // Самое важное утверждение файла. Скрипт можно чинить сколько угодно —
    // потребитель запускает не его, а то, что скопировал из CHANGELOG, и
    // разъезжаются эти двое молча. Сверяется не текст, а ПОВЕДЕНИЕ: расхождение
    // в имени переменной значения не имеет, расхождение в ответе — имеет.
    //
    // ВСЕ блоки, а не первый. Пока команда была одна, гейт брал первую же
    // ```perl — и это работало ровно до 4.0.2, где появился второй пункт со
    // своей командой: первым стал он, а проверялся по-прежнему «первый».
    // Утверждение молча переехало бы на другой предмет.
    const md = readFileSync(resolve(__dirname, '../../CHANGELOG.md'), 'utf8')
    const blocks = [...md.matchAll(/```perl\n([\s\S]*?)```([\s\S]{0,400}?)```bash\n([\s\S]*?)```/g)]
    // Прежде здесь стояло «блоков больше нуля»: пункт 4.0.1 с командой жил в
    // журнале вечно. С 1.0.0 (JIG-3) журнал начат заново, и ноль законен. Но
    // та проверка заодно ловила РАЗБОР, переставший видеть блок, — случай
    // замолчал бы зелёным. Это держит сверка числа: каждый ```perl в журнале
    // обязан быть разобран вместе со своим соседним ```bash.
    const fenced = md.match(/^\s*```perl$/gm)?.length ?? 0
    expect(blocks.length, `перловых блоков ${fenced}, разобрано ${blocks.length}: у блока нет соседнего \`\`\`bash или разбор его не видит`).toBe(fenced)

    for (const [, snippet, , bash] of blocks) {
      // Окружение берётся из СОСЕДНЕГО блока `bash` — из той самой строки,
      // которую скопирует потребитель. Придумывать его здесь значило бы
      // проверять команду в условиях, в которых её никто не запускает.
      const env: Record<string, string> = { ...process.env } as Record<string, string>
      for (const m of bash!.matchAll(/(FIND_\w+)=('([^']*)'|\S+)/g)) env[m[1]!] = m[3] ?? m[2]!

      for (const [what, text] of [['основная', FIXTURE], ['булева', BOOL_FIXTURE]] as const) {
        const run = (file: string, script: string) =>
          execFileSync('perl', ['-0777', '-n', script, file], { encoding: 'utf8', env })
        const dir = tempRoot('both-')
        try {
          const file = resolve(dir, 'Form.tsx')
          writeFileSync(file, text)
          const pl = resolve(dir, 'from-changelog.pl')
          writeFileSync(pl, snippet!)
          expect(
            run(file, pl),
            `команда из CHANGELOG разошлась со скриптом на ${what} фикстуре`
              + ` (${JSON.stringify(Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith('FIND_'))))})`,
          ).toBe(run(file, SCRIPT))
        } finally {
          rmSync(dir, { recursive: true, force: true })
        }
      }
    }
  })

  it('стрелка в пропе не режет тег пополам', () => {
    // Отдельным кейсом, потому что это ловушка, а не следствие: с классом
    // `[^<>]` регекс останавливается на `>` внутри `=>` и подпись ПОСЛЕ
    // обработчика не видит — то есть даёт ложное срабатывание там, где всё
    // хорошо. Мутация: замени в скрипте `[^<>{]` на `[^<>]` — падает этот кейс.
    const naive = /<(?:TextField|Select)\b[^<>]*\/?>/gs
    const hit = [...FIXTURE.matchAll(naive)].filter((m) => !m[0].includes('label='))
    expect(hit.length, 'наивный класс перестал ошибаться — ловушка мертва').toBeGreaterThan(1)
  })
})

/**
 * Корень и ЯКОРЬ (DS-166). Пришло от потребителя: я просил прогнать
 * `grep -rn "flattenTree" src/`, а `src/` у него — PHP, фронт живёт в
 * `frontend/src/`. Команда буквально дала бы 0 — ноль «искал не там»,
 * неотличимый от «не используется». Он прогнал по верному пути и сам приложил
 * знаменатель: `flattenTree` — 0 файлов, `DataTable` — 33. Без знаменателя
 * ноль не был бы свидетельством ни о чём.
 *
 * Отсюда форма, которую держит эта половина гейта на НОВЕЙШЕЙ секции CHANGELOG
 * (старые секции — история, их команды уже скопированы):
 *   1. `git grep` от корня репозитория, путь не зашит. Именно `git grep`, а не
 *      `grep -r .`: тот заглянул бы в `node_modules`, где лежит и сам этот
 *      пакет, — и посчитал бы наш исходник за использования потребителя.
 *   2. В каждом блоке ```bash есть строка с `# якорь` — тот же вызов с именем,
 *      которое обязано найтись. Якорь и отличает «не используем» от «искал не
 *      там»; для блока «узнайте свою шкалу» он нужен так же: ноль там значит
 *      «шкала 1» только при ненулевом якоре.
 *   3. Код возврата: 1 — честный ноль, 0 — найдено, всё прочее — сломан вызов.
 *      Это утверждение о `git`, и оно ПРОВЕРЯЕТСЯ на фикстурном репозитории, а
 *      не переписано из памяти: у наивной пары (`grep -r … src/`) на раскладке
 *      consumer-a искомое И якорь дают 1 — то есть она не различает.
 *   4. Пиксели в секции написаны на шкале 1; раз секция называет хоть один
 *      `px`, в ней есть команда `git grep -n "ds-ui-scale"` — расширение
 *      правила про знак (`Tabs`, 4.0.1) на любую величину.
 */
describe('команда из CHANGELOG: корень и якорь (DS-166)', () => {
  const CHANGELOG = resolve(__dirname, '../../CHANGELOG.md')

  /** Раскладка consumer-a: `src/` — PHP, фронт в `frontend/src/`, шкала 1.15. */
  function consumerRepo(): string {
    const dir = tempRoot('consumer-')
    const w = (rel: string, text: string) => {
      const f = resolve(dir, rel)
      mkdirSync(resolve(f, '..'), { recursive: true })
      writeFileSync(f, text)
    }
    w('src/Kernel.php', "<?php\nclass Kernel {}\n")
    w('frontend/src/pages/Orders.tsx', [
      "import { DataTable, NumberField } from 'ds-1c-taxi'",
      'export const Orders = () => (',
      '  <>',
      '    <DataTable rows={rows} columns={cols} />',
      '    <NumberField',
      '      value={n}',
      '      onChange={(e) => setN(e.target.value)}',
      '      size="sm"',
      '    />',
      '  </>',
      ')',
      '',
    ].join('\n'))
    w('frontend/src/styles/tracker.css', ':root { --ds-ui-scale: 1.15; }\n')
    // СВОЙ компонент потребителя с именем, в котором живёт наше (DS-350).
    // Не декорация: на нём видно, что имя компонента якорем быть не может —
    // `git grep -l "Split"` найдёт его в дереве, где ds-1c-taxi'шного `Split`
    // нет вовсе.
    w('frontend/src/pages/SplitView.tsx', 'export const SplitView = () => null\n')
    execFileSync('git', ['init', '-q'], { cwd: dir })
    execFileSync('git', ['add', '-A'], { cwd: dir })
    return dir
  }

  const status = (cmd: string, cwd: string): number => {
    try {
      execFileSync('bash', ['-o', 'pipefail', '-c', cmd], { cwd, stdio: 'pipe' })
      return 0
    } catch (e) {
      return (e as { status: number }).status
    }
  }

  it('git на машине есть — иначе гейт молчал бы, а не проверял', () => {
    expect(() => execFileSync('git', ['--version'], { stdio: 'ignore' })).not.toThrow()
  })

  it('якорь отличает «не используем» от «искал не там», а наивная пара — нет', () => {
    const dir = consumerRepo()
    try {
      // Форма из CHANGELOG: от корня, без пути.
      expect(status('git grep -n "flattenTree"', dir), 'искомого нет — честный ноль, код 1').toBe(1)
      expect(status('git grep -l "DataTable"', dir), 'якорь найден — код 0').toBe(0)
      // Наивная пара в `src/` потребителя: искомое И якорь дают 1 — не различает.
      expect(status('grep -rn "flattenTree" src/', dir)).toBe(1)
      expect(status('grep -rl "DataTable" src/', dir), 'наивный якорь тоже 1 — вот дыра').toBe(1)
      // Сломанный вызов громче честного нуля.
      expect([0, 1], 'битый флаг обязан звучать не как ноль').not.toContain(status('git grep -n --нет-такого-флага x', dir))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  /**
   * ЯКОРЬ — ВСЕГДА `ds-1c-taxi`, имя компонента якорем не бывает (DS-350).
   *
   * CLAUDE.md до этого разрешал два якоря на выбор: имя компонента, о котором
   * пункт, либо имя пакета. Выбор был неверен, и оба его конца меряются здесь
   * на одном дереве:
   *
   * - `Split` находится в дереве, где НАШЕГО `Split` нет вовсе — у потребителя
   *   свой `SplitView`. Якорь говорит «дерево то», опираясь на чужое имя, и то
   *   же самое делает `LineChart` внутри комментария на PHP;
   * - `Tooltip` даёт честный ноль у потребителя, который его не использует, —
   *   и якорь перестаёт отличать «не используем» от «искал не там», то есть
   *   перестаёт быть якорем ровно в том случае, ради которого заведён.
   *
   * Имя пакета свободно от обоих: оно есть у ЛЮБОГО потребителя и не зависит
   * от того, какие компоненты он взял. В секции 4.2.6 обе беды записаны
   * наблюдениями («якорь при этом в обоих состояниях даёт 0») — оттуда и
   * правило.
   *
   * ОСТАЁТСЯ `ds-1c-taxi` и после переименования пакета в `@santarinto/jig`
   * (JIG-2): у потребителя, переезжающего на 1.0.0, в дереве ещё старое имя, и
   * якорь обязан найтись именно у него. Переключается на `@santarinto/jig`
   * первым выпуском после 1.0.0.
   */
  const PACKAGE_ANCHOR = 'ds-1c-taxi'

  it('имя компонента якорем быть не может: лжёт в обе стороны, имя пакета — нет', () => {
    const dir = consumerRepo()
    try {
      expect(status(`git grep -l "Split"`, dir), 'чужой SplitView выдал себя за наш Split').toBe(0)
      expect(status(`git grep -l "Tooltip"`, dir), 'потребитель, но якорь пуст — ноль ни о чём').toBe(1)
      expect(status(`git grep -l "${PACKAGE_ANCHOR}"`, dir), 'имя пакета есть у любого потребителя').toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('вне репозитория git grep не молчит: код не 0 и не 1', () => {
    const dir = tempRoot('norepo-')
    try {
      writeFileSync(resolve(dir, 'Orders.tsx'), 'DataTable\n')
      expect(status('git grep -l "DataTable"', dir)).toBe(128)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('новейшая секция CHANGELOG: каждый блок bash — git grep без пути, с якорем; пиксели — со шкалой', () => {
    const md = readFileSync(CHANGELOG, 'utf8')
    const heads = [...md.matchAll(/^## \[/gm)].map((m) => m.index!)
    expect(heads.length, 'в CHANGELOG нет ни одной секции').toBeGreaterThan(1)
    const top = md.slice(heads[0], heads[1])
    const version = /^## \[([^\]]+)\]/.exec(top)![1]
    // Требование к ИМЕНИ якоря держится на секции, которая ещё не выпущена, —
    // в отличие от остальных, которые держатся на новейшей всегда. Выпущенная
    // секция здесь история в более сильном смысле, чем «её уже скопировали»:
    // под её командами стоят ЗАМЕРЫ на живых деревьях потребителей («0 в обоих
    // состояниях», «у site 0 при живом якоре»), которые сделаны тем самым
    // якорем и пересчитать которые отсюда нечем. Переписать команду, оставив
    // замер под ней, значит завести документ, который врёт; переписать замер
    // нельзя — значит правило начинает действовать со следующего выпуска, а
    // доказано оно на фикстуре выше.
    // Клон без тегов (`--no-tags`, checkout по умолчанию в CI) не значит «ни
    // один выпуск не вышел»: там пусто вообще всё, и признак «тега нет»
    // прочитал бы выпущенную секцию как готовящуюся — 123 красных строки,
    // зовущих переписать историю. Поэтому вопрос задаётся в два шага: сначала
    // есть ли теги вообще, и только потом — есть ли тег этой секции.
    const tag = (pattern: string) => execFileSync('git', ['tag', '--list', pattern],
      { cwd: resolve(__dirname, '../..'), encoding: 'utf8' }).trim()
    const released = tag('v*') === '' || tag(`v${version}`) !== ''
    const blocks = [...top.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]!)
    console.log(`changelog-search-command: секция ${version}${released ? ' (выпущена)' : ''}, блоков bash ${blocks.length}`)
    // Нуль блоков — секция без единой команды, а не чистая: правило про команду
    // в каждом пункте держится с 3.0.2.
    expect(blocks.length).toBeGreaterThan(0)

    const offenders: string[] = []
    blocks.forEach((b, i) => {
      // Продолжения `\` склеиваются: путь и якорь ищутся в КОМАНДЕ, не в строке.
      const cmds = b.replace(/\\\n\s*/g, ' ').split('\n').map((l) => l.trim()).filter(Boolean)
      for (const c of cmds) {
        if (/\bgrep\b/.test(c) && !/\bgit grep\b/.test(c)) offenders.push(`блок ${i + 1}: не git grep — ${c}`)
        if (/(^|[\s'"=])(src|frontend|app|lib|tests?)\//.test(c)) offenders.push(`блок ${i + 1}: зашит путь — ${c}`)
      }
      const anchors = cmds.filter((c) => /#\s*якорь/.test(c))
      if (!anchors.length) offenders.push(`блок ${i + 1}: нет строки с «# якорь»`)
      else if (!released && !anchors.some((c) => c.includes(`"${PACKAGE_ANCHOR}"`))) {
        offenders.push(`блок ${i + 1}: якорь не «${PACKAGE_ANCHOR}» — ${anchors[0]}`)
      }
    })
    if (/\d(\.\d+)?\s?px\b/.test(top) && !blocks.some((b) => /git grep -n "ds-ui-scale"/.test(b))) {
      offenders.push('секция называет пиксели, а команды `git grep -n "ds-ui-scale"` в ней нет')
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('каждая команда новейшей секции ЗАПУСКАЕТСЯ на раскладке consumer-a: код 0 или 1', () => {
    // Не «правильный ответ» — предмет у каждой свой, — а «вызов не сломан»:
    // битый флаг, незакрытая кавычка, забытый файл скрипта дают 2/127/128.
    const md = readFileSync(CHANGELOG, 'utf8')
    const heads = [...md.matchAll(/^## \[/gm)].map((m) => m.index!)
    const top = md.slice(heads[0], heads[1])
    const dir = consumerRepo()
    try {
      copyFileSync(SCRIPT, resolve(dir, 'find-unlabeled-fields.pl'))
      const broken: string[] = []
      for (const [, b] of top.matchAll(/```bash\n([\s\S]*?)```/g)) {
        const cmds = b!.replace(/\\\n\s*/g, ' ').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
        for (const c of cmds) {
          const s = status(c, dir)
          if (s !== 0 && s !== 1) broken.push(`код ${s}: ${c}`)
        }
      }
      expect(broken, broken.join('\n')).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
