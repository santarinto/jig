#!/usr/bin/env node
/**
 * Два файла, которых нет в исходниках, но которые нужны потребителю без
 * сборщика. Оба ГЕНЕРИРУЮТСЯ, а не пишутся руками: копия списка токенов или
 * копия порядка импортов, поддерживаемая отдельно, разъезжается — вопрос
 * только когда.
 *
 * 1. `dist/styles.bundle.css` — `src/styles.css` с вшитыми `@import`.
 *    62 импорта для сборщика ничего не стоят; для `<link>` в браузере это 62
 *    последовательных запроса и требование раздавать всё дерево `dist/src`
 *    статикой. Потребитель замерил на живой странице: 65 запросов.
 *
 *    Порядок сохраняется дословно — он значим: часть правил системы решается
 *    порядком, а не весом селектора (разделитель `DataTable`, зебра, правила
 *    потребителя поверх наших).
 *
 * 2. `dist/theme-auto.css` — системная тёмная тема без единой строки JS.
 *    Тёмная у нас на `[data-theme="dark"]`, поэтому без этого файла путь
 *    «уважать `prefers-color-scheme`» закрыт для того, у кого нет клиентского
 *    JS вовсе.
 *
 *    ПОДКЛЮЧАЕТСЯ ЯВНО и в `styles.css` не входит: сегодня приложение, не
 *    звавшее `initTheme()`, на машине с системной тёмной рисуется светлым.
 *    Медиазапрос в `tokens.css` перекрасил бы всех существующих потребителей
 *    при ближайшем бампе — молча, потому что это цвет, а не типы.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

/** Разворачивает цепочку `@import` вглубь, сохраняя порядок. */
function inline(file, seen = new Set()) {
  const abs = resolve(file)
  if (seen.has(abs)) return `/* повтор пропущен: ${abs.slice(ROOT.length + 1)} */\n`
  seen.add(abs)
  const css = readFileSync(abs, 'utf8')
  const dir = dirname(abs)
  return css.replace(/^@import\s+["']([^"']+)["']\s*;?\s*$/gm, (_m, spec) => {
    const target = resolve(dir, spec)
    if (!existsSync(target)) throw new Error(`@import не найден: ${spec} (из ${abs})`)
    return `/* ${spec} */\n${inline(target, seen)}`
  })
}

function buildStylesBundle() {
  const out = join(DIST, 'styles.bundle.css')
  const css = inline(join(DIST, 'src/styles.css'))
  const left = css.match(/^@import/gm)
  if (left) throw new Error(`в бандле остались ${left.length} @import — цепочка развернулась не вся`)
  writeFileSync(out, css)
  return css
}

/**
 * Тёмные токены под `prefers-color-scheme`, вычитанные из `tokens.css`.
 *
 * `:root:not([data-theme])` — скоуп обязателен: явно поставленный атрибут
 * (ручной выбор, тумблер потребителя) должен ПОБЕЖДАТЬ системный, а не
 * спорить с ним. Без `:not(...)` медиазапрос и атрибут оказались бы одного
 * веса, и решал бы порядок файлов у потребителя.
 */
function buildThemeAuto() {
  const tokens = readFileSync(join(DIST, 'tokens/tokens.css'), 'utf8')
  const m = tokens.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)
  if (!m) throw new Error('в tokens.css не найден блок [data-theme="dark"]')
  const body = m[1]
  writeFileSync(join(DIST, 'theme-auto.css'),
    '/* Системная тёмная тема без JS. Подключается ЯВНО, рядом со styles.css.\n'
    + '   Сгенерировано scripts/build-bundles.mjs из tokens.css — руками не править.\n'
    + '   Явный data-theme побеждает системный: скоуп :not([data-theme]). */\n'
    + '@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]) {'
    + body.replace(/\n/g, '\n  ') + '\n  }\n}\n')
  return body
}

const bundle = buildStylesBundle()
const dark = buildThemeAuto()
const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(1)} КБ`
// В stderr, а не в stdout: сборка бежит внутри `npm pack` (через `prepare`), а
// stdout `npm pack` — это имя тарбола, которое читают скриптом. Строка отчёта
// в stdout склеивалась с именем файла, и установка шла по несуществующему пути.
process.stderr.write(`bundles: styles.bundle.css ${kb(bundle)} · theme-auto.css из ${dark.match(/--ds-[a-z0-9-]+:/g)?.length ?? 0} токенов\n`)
