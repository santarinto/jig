import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

/**
 * Песочница `/tmp` на один прогон (DS-165).
 *
 * `TMPDIR` подменяется ДО того, как поднят пул воркеров, поэтому `os.tmpdir()`
 * во всех воркерах и во всех дочерних процессах (`git`, `node scripts/*.mjs`)
 * указывает внутрь этого корня. Корень сносится целиком в `teardown`, включая
 * красный прогон: иначе слой ломался бы ровно в том случае, ради которого
 * написан.
 *
 * Замысел и остальные два слоя — в `src/__guards__/tmp-sandbox.ts`.
 */

/**
 * Прерванный прогон (SIGINT, kill -9) не доходит до `teardown` и оставляет
 * корень. Их сносит следующий прогон, но только заведомо чужие: свежие могут
 * принадлежать ЖИВОМУ соседнему прогону, а два vitest разом — обычное дело.
 * Шесть часов взяты с запасом: самый длинный целевой прогон — `check-full`,
 * ~3 минуты.
 */
const ABANDONED_AFTER_MS = 6 * 60 * 60 * 1000

const PREFIX = 'ds-run-'

let root = ''

function sweepAbandoned(realTmp: string): void {
  const now = Date.now()
  let names: string[]
  try {
    names = readdirSync(realTmp)
  } catch {
    return // недоступный /tmp — забота прогона, а не уборки
  }
  for (const name of names) {
    if (!name.startsWith(PREFIX)) continue
    const path = resolve(realTmp, name)
    try {
      if (now - statSync(path).mtimeMs < ABANDONED_AFTER_MS) continue
      rmSync(path, { recursive: true, force: true })
    } catch {
      // чужой владелец или гонка с другим прогоном — не наше дело
    }
  }
}

export function setup(): void {
  const realTmp = tmpdir()
  sweepAbandoned(realTmp)
  root = mkdtempSync(resolve(realTmp, PREFIX))
  process.env.TMPDIR = root
  // Отдельная переменная, потому что `TMPDIR` к моменту проверки мог быть
  // переставлен кем угодно ещё: гейт сравнивает не «переменная присвоена», а
  // «Node видит именно НАШ корень».
  process.env.DS_TMP_SANDBOX = root
}

export function teardown(): void {
  if (!root) return
  let left: string[] = []
  try {
    left = readdirSync(root)
  } catch {
    // корня уже нет — сносить и жаловаться не на что
  }

  // Сначала снос, потом падение. Обратный порядок оставлял бы мусор ровно в тот
  // прогон, когда мусор есть, — то есть слой не работал бы в единственном
  // случае, ради которого он существует.
  rmSync(root, { recursive: true, force: true })

  if (left.length === 0) return

  const listed = left.slice(0, 20).map((n) => `    ${n}`).join('\n')
  const more = left.length > 20 ? `\n    … и ещё ${left.length - 20}` : ''
  process.stderr.write(
    `\n${'═'.repeat(72)}\n` +
      `  ПЕСОЧНИЦА /tmp НЕ ПУСТА: ${left.length} записей осталось после прогона\n` +
      `${'═'.repeat(72)}\n` +
      `${listed}${more}\n\n` +
      `  Каждая — временный каталог, который тест создал и не снёс. Утечки в\n` +
      `  настоящий /tmp не случилось, песочница снесена целиком; но без неё\n` +
      `  эти записи копились бы с каждым прогоном (так набралось 6503 штуки —\n` +
      `  DS-165).\n\n` +
      `  Кто создал:  grep -rn "'${left[0].replace(/[A-Za-z0-9]{6}$/, '')}'" src workbench scripts\n` +
      `  Как чинить:  временный каталог заводится только через tempRoot() или\n` +
      `               tempRootManual() из src/__guards__/tmp-sandbox.ts —\n` +
      `               первый сносит сам, второму нужен afterAll.\n\n` +
      `  ВНИМАНИЕ: этот провал приходит ВНЕ теста и ВНЕ файла. Строки\n` +
      `  «Test Files» и «Tests» останутся ЗЕЛЁНЫМИ — прогон красный по коду\n` +
      `  возврата и по этому блоку, больше ни по чему.\n` +
      `${'═'.repeat(72)}\n\n`,
  )
  throw new Error(`песочница /tmp не пуста после прогона: ${left.length} записей`)
}
