import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Восемь дев-серверов на одной машине, и ни один не имеет права уехать молча.
 *
 * По умолчанию vite при занятом порте БЕРЁТ СЛЕДУЮЩИЙ СВОБОДНЫЙ и печатает это
 * одной строкой в терминале. Пока верстак поднимался руками на время работы, цена
 * была невелика. С DS-123 он поднят ПОСТОЯННО службой `ds-workbench` на
 * 5274 — и без `strictPort` картина выходит такая: человек набирает `npm run wb`,
 * сервер молча садится на 5275, человек открывает закладку 5274 и смотрит на
 * ЧУЖОЙ процесс, приняв его за свою правку. Дефекта нет, ошибки нет, картинка
 * правдоподобна. Заодно 5275 — порт `smoke:wb`, то есть следующий `check-full`
 * падает в другом месте и по другой причине.
 *
 * Гейт держит две вещи разом:
 *
 * 1. `strictPort: true` в обоих конфигах — столкновение обязано ронять процесс,
 *    а не уползать. Для верстака это ещё и полезное сообщение: «уже работает».
 * 2. Все порты различны. Это тот же дефект с другой стороны: если служба
 *    и скрипт совпадут номерами, `strictPort` превратит тихую подмену в красный
 *    `check-full`, но чинить всё равно придётся здесь.
 *
 * Числа берутся РАЗБОРОМ ИСХОДНИКОВ, а не импортом: `scripts/*.mjs` при импорте
 * поднимают браузер и дев-сервер, а конфиги vite — асинхронные фабрики. Разбор
 * текста здесь честнее, чем то, что пришлось бы для этого запустить.
 */
const ROOT = resolve(__dirname, '../..')

/** Где живёт порт и чем он занят. Порядок — по номеру, чтобы список читался. */
const PLACES = [
  { file: 'vite.demo.config.ts', what: 'демо', re: /port:\s*(\d{4})/, strict: true },
  { file: 'vite.workbench.config.ts', what: 'верстак и служба', re: /port:\s*(\d{4})/, strict: true },
  { file: 'scripts/smoke-workbench.mjs', what: 'wb-smoke', re: /PORT\s*=\s*(\d{4})/, strict: false },
  { file: 'scripts/measure-memory.mjs', what: 'measure:memory', re: /PORT\s*=\s*(\d{4})/, strict: false },
  { file: 'scripts/case-states.mjs', what: 'states', re: /PORT\s*=\s*(\d{4})/, strict: false },
  { file: 'scripts/measure-dock-floor.mjs', what: 'dock-floor', re: /PORT\s*=\s*(\d{4})/, strict: false },
  // `shell-rhythm` (DS-151) сидел на 5279 мимо этого списка: гейт его не
  // видел, и следующий свободный порт выбирался бы на глаз. Внесён вместе с
  // обходом случаев (DS-177), который занял 5280 как первый после него.
  { file: 'scripts/measure-shell-rhythm.mjs', what: 'shell-rhythm', re: /PORT\s*=\s*(\d{4})/, strict: false },
  // Порт у ТОЧКИ ВХОДА матрицы, а не у строк: `case-overflow.mjs` и
  // `case-targets.mjs` — модули, своего дев-сервера не поднимают, и места для
  // порта у них нет. До 18.09.2026 здесь стоял `case-overflow.mjs`, пока строка
  // была прогоном; оставь его в списке — регулярка не найдёт литерала и гейт
  // покраснеет «ослеп», то есть ровно так, как обязан.
  { file: 'scripts/case-matrix.mjs', what: 'matrix', re: /PORT\s*=\s*(\d{4})/, strict: false },
] as const

describe('dev server ports', () => {
  it('vite-конфиги несут strictPort: true — занятый порт роняет запуск, а не уводит на соседний', () => {
    const offenders: string[] = []
    let checked = 0
    for (const p of PLACES) {
      if (!p.strict) continue
      checked++
      const src = readFileSync(resolve(ROOT, p.file), 'utf8')
      if (!/strictPort:\s*true/.test(src)) {
        offenders.push(
          `${p.file} (${p.what}): нет strictPort — при занятом порте vite молча возьмёт соседний`,
        )
      }
    }
    // Обратная мутация: пустой PLACES или снятый флаг `strict` у обоих дали бы
    // ровно такой же зелёный результат, ничего не проверив.
    expect(checked, 'ни одного конфига с strict: true в PLACES — обход пуст').toBe(2)
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('все порты из PLACES различны', () => {
    const found = new Map<number, string[]>()
    const missing: string[] = []
    for (const p of PLACES) {
      const src = readFileSync(resolve(ROOT, p.file), 'utf8')
      const m = src.match(p.re)
      if (!m) {
        missing.push(`${p.file}: порт не найден выражением ${p.re} — гейт ослеп на это место`)
        continue
      }
      const port = Number(m[1])
      found.set(port, [...(found.get(port) ?? []), `${p.file} (${p.what})`])
    }
    const clashes = [...found.entries()]
      .filter(([, who]) => who.length > 1)
      .map(([port, who]) => `${port}: ${who.join(' и ')}`)

    // Не найденный порт — это молчаливая слепота гейта, а не пропуск: правка
    // формы записи (`port: 5274` → переменная) обязана краснеть здесь, а не
    // выясняться на живой машине.
    expect(missing, missing.join('\n')).toEqual([])
    expect(found.size, `ожидались ${PLACES.length} РАЗНЫХ портов`).toBe(PLACES.length)
    expect(clashes, clashes.join('\n')).toEqual([])
  })
})
