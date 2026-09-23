#!/usr/bin/env node
/**
 * `--ds-version` ДОЕХАЛ ДО СБОРКИ (DS-215, вынесен сюда DS-238).
 *
 * Утверждение проверяемо только ПОСЛЕ `build`, поэтому и живёт в отдельном
 * шаге `check-src`, идущем сразу за сборкой, а не в `guards`, которые идут ДО
 * неё. В guards оно было ложно-красным ровно в одном случае — и это случай
 * релиза: `make release` гонит `prepare` (бамп пяти версионных файлов) и сразу
 * `check-full`, где guards читают `dist/` от ПРОШЛОЙ версии и сообщают «версия
 * не доехала» там, где она не доехала ЕЩЁ. Ответ выглядел дефектом кода, а был
 * порядком шагов; поймано вживую при подготовке 4.2.1.
 *
 * Тот же класс, что ловушка `measure`, читающего собранный
 * `dist/src/styles.css`: там порядок спасает сам собой (build раньше measure),
 * здесь не спасал.
 *
 * Форма записи (кавычки, `:root`, совпадение `tokens/tokens.css` с
 * `package.json`) осталась в `src/__guards__/version-token.test.ts` — она про
 * ИСХОДНИК и сборки не требует. Чтение настоящим `getComputedStyle` — случай
 * «версия читается со страницы» в `scripts/measure-invariants.mjs`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version

/** Кавычки — часть утверждения: голое число не значение CSS. */
const QUOTED = /--ds-version:\s*"(\d+\.\d+\.\d+)"\s*;/

/**
 * Оба файла, которыми пользуются БЕЗ сборщика. `dist/src/styles.css` сюда не
 * входит намеренно: его читает `measure` настоящим браузером, и дублировать
 * текстом то, что проверено разбором, значило бы завести второе место, где
 * утверждение можно случайно ослабить.
 */
const FILES = ['tokens/tokens.css', 'styles.bundle.css']

const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

// Отсутствие dist здесь — не повод пропустить, как в guards (там свежий клон
// сборки ещё не видел). Шаг идёт ПОСЛЕ build, и если файла нет, сломана сборка.
for (const rel of FILES) {
  const path = join(DIST, rel)
  if (!existsSync(path)) fail(`dist/${rel} нет — шаг идёт после build, значит сборка не дала файл`)
  const m = QUOTED.exec(readFileSync(path, 'utf8'))
  if (!m) fail(`dist/${rel}: токена --ds-version нет — на странице потребителя спросить нечего`)
  if (m[1] !== version) fail(`dist/${rel} говорит ${m[1]}, а пакет ${version} — сборка не свежая`)
}

console.log(`dist-version OK — --ds-version "${version}" в ${FILES.map((f) => `dist/${f}`).join(' и ')}`)
