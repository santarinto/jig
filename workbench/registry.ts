/**
 * Реестр фикстур для кадра.
 *
 * ЛЕНИВО, и `eager: true` здесь запрещён. При eager кадр тянет ВСЕ фикстуры со
 * всеми их стресс-данными — включая наборы по 500 строк у каждой, — а в режиме
 * сетки это множится на шесть кадров. По влиянию на холодный старт и память это
 * крупнее, чем бюджет обхода CSSOM, из-за которого спорили на ревью.
 *
 * В гейте (src/__guards__/fixtures.test.ts) — наоборот, eager обязателен: там
 * нужен весь список сразу, а стресс-данные никого не рисуют.
 *
 * Регистра, который надо пополнять руками, нет намеренно: он протух бы на
 * третьем компоненте.
 */
/// <reference types="vite/client" />
// Ссылка точечная, а не через "types" в tsconfig: тот список действует на весь
// проект, и `import.meta.glob` стал бы доступен в src/ — то есть в коде пакета,
// который собирается голым tsc и никакого Vite не знает.
import { KINDS } from 'virtual:ds-wb/kinds'
import type { AnyFixture } from '../src/internal/fixture.js'
import type { KindRow } from './protocol.js'

const mods = import.meta.glob<{ default: AnyFixture }>(['../src/components/*/*.fixture.tsx', '../src/icons/*.fixture.tsx'])

const nameOf = (path: string): string => path.split('/').pop()!.replace('.fixture.tsx', '')

/**
 * Карта видов (DS-67) — из виртуального модуля `virtual:ds-wb/kinds`,
 * который дев-плагин собирает РАЗБОРОМ исходников (`workbench/kinds-plugin.ts`).
 * Ни один модуль компонента при этом не исполняется, и карта готова ещё до
 * того, как человек откроет выбор начинки.
 *
 * Отсортирована плагином по имени — второй сортировки здесь нет намеренно.
 */
export function fixtureKinds(): KindRow[] {
  return KINDS
}

/**
 * Имена — ИЗ ТОЙ ЖЕ карты, а не вторым обходом glob-а. Два списка имён,
 * собранных разными способами, расходятся тихо: слева фикстура есть, в выборе
 * начинки её нет, и виноватым выглядит `fitsSlot`.
 */
export function fixtureNames(): string[] {
  return KINDS.map((k) => k.name)
}

export async function loadFixture(name: string): Promise<AnyFixture | null> {
  const entry = Object.entries(mods).find(([p]) => nameOf(p) === name)
  if (!entry) return null
  const mod = await entry[1]()
  return mod.default
}
