import { CHART_SERIES_COUNT, chartSeriesVar, type ChartPaletteSlot } from '../../tokens/chartPalette.js'

/**
 * Цвет ряда графика: закреплённый слот палитры или свободный по порядку
 * (DS-185). ОДИН расчёт на отметки, легенду и подсказку: пока каждый
 * из них звал `chartSeriesVar(index)` сам, они совпадали только потому, что
 * индекс у всех был один и тот же; закрепление слота это совпадение ломает
 * первым же вызовом, который о нём забыл.
 *
 * Правило:
 *  - ряд с `paletteSlot` получает ровно `--ds-chart-N` — без заворота, это
 *    обещание потребителю, а не позиция;
 *  - ряды без слота занимают свободные слоты ПО ПОРЯДКУ массива, обходя
 *    закреплённые. Без единого закрепления это в точности `chartSeriesVar(i)`,
 *    то есть прежние цвета, включая заворот после восьмого;
 *  - когда свободные кончились, незакреплённые заворачиваются по свободным же —
 *    на закреплённый цвет они не садятся, пока свободный слот есть хоть один
 *    (закреплены все восемь — девятый ряд заворачивается, цветов больше нет);
 *  - один слот у двух рядов одного графика — ИСКЛЮЧЕНИЕ при отрисовке. Молча
 *    выбрать одного значило бы нарисовать два ряда одним цветом: график
 *    выглядит целым, а различимость, ради которой слот закрепляли, пропала.
 */
export interface PaletteSlotted {
  id: string
  paletteSlot?: ChartPaletteSlot
}

export function assignPaletteSlots(
  items: readonly PaletteSlotted[],
  component: string,
): ReadonlyMap<string, string> {
  const owner = new Map<number, string>()
  for (const it of items) {
    const slot = it.paletteSlot
    if (slot === undefined) continue
    // Союз держит TS; `any` на пути потребителя — нет, и заворот 9 → 1 молча
    // покрасил бы ряд в чужой цвет.
    if (!Number.isInteger(slot) || slot < 1 || slot > CHART_SERIES_COUNT) {
      throw new Error(
        `jig: ${component}: paletteSlot ${String(slot)} у «${it.id}» вне 1..${CHART_SERIES_COUNT}`,
      )
    }
    const prev = owner.get(slot)
    if (prev !== undefined && prev !== it.id) {
      throw new Error(
        `jig: ${component}: paletteSlot ${slot} закреплён и за «${prev}», и за «${it.id}» — `
        + 'два ряда одного графика получили бы один цвет',
      )
    }
    owner.set(slot, it.id)
  }

  const out = new Map<string, string>()
  const free = Array.from({ length: CHART_SERIES_COUNT }, (_, i) => i + 1)
    .filter((n) => !owner.has(n))
  let next = 0
  for (const it of items) {
    if (out.has(it.id)) continue
    if (it.paletteSlot !== undefined) {
      out.set(it.id, chartSeriesVar(it.paletteSlot - 1))
    } else if (free.length === CHART_SERIES_COUNT || free.length === 0) {
      // Без закреплений — прежний индекс с прежним заворотом, буква в букву.
      // Все восемь закреплены, а рядов больше — девятому своего цвета нет ни
      // при каком правиле, и он заворачивается, как заворачивался всегда.
      out.set(it.id, chartSeriesVar(next++))
    } else {
      out.set(it.id, chartSeriesVar(free[next++ % free.length]! - 1))
    }
  }
  return out
}
