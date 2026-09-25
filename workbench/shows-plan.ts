/**
 * План гейта состояний: какие кейсы обещают что-то показать и что именно.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ. `scripts/case-states.mjs` — голый Node, а фикстуры
 * это `.tsx`: прочитать их он может только через дев-сервер, то есть из
 * страницы. Поэтому план собирается ЗДЕСЬ и уезжает наверх обычными данными
 * (`page.evaluate`), а не разбором исходников регулярками. Разбор соврал бы
 * первым: `shows` — массив строк, и одна многострочная запись уводит regexp в
 * молчаливый пропуск, то есть в зелёный гейт с недосчитанными кейсами.
 *
 * ЗАПРЕТ `eager` ИЗ `registry.ts` СЮДА НЕ ПЕРЕНОСИТСЯ, и это не оплошность.
 * Там он про КАДР: eager тянет все фикстуры со всеми наборами по 500 строк, а
 * в сетке это множится на шесть документов. Здесь фикстуры нужны все и сразу
 * по определению задачи, а страница живёт один вызов и ничего не рисует. Этот
 * модуль не импортирует ни кадр, ни оболочка — только гейт.
 */
/// <reference types="vite/client" />
import type { AnyFixture } from '../src/internal/fixture.js'

/** Строка плана — ровно адрес кадра плюс то, что там обязано найтись. */
export interface ShowsRow {
  c: string
  caseId: string
  shows: string[]
}

const mods = import.meta.glob<{ default: AnyFixture }>(['../src/components/*/*.fixture.tsx', '../src/icons/*.fixture.tsx'])

export async function showsPlan(): Promise<ShowsRow[]> {
  const rows: ShowsRow[] = []
  for (const load of Object.values(mods)) {
    const fx = (await load()).default
    for (const c of fx.cases) {
      // `c.shows` без `?.length`: пустой массив — ошибка СОСТАВА, её называет
      // `validateFixtures`. Проглотив его здесь, гейт состояний потерял бы
      // кейс молча и остался зелёным ровно на том объявлении, которое ничего
      // не утверждает.
      if (c.shows) rows.push({ c: fx.name, caseId: c.id, shows: c.shows })
    }
  }
  // Порядок — по адресу, чтобы красный список читался и не прыгал между
  // прогонами: порядок ключей glob-а зависит от файловой системы.
  rows.sort((a, b) => a.c.localeCompare(b.c) || a.caseId.localeCompare(b.caseId))
  return rows
}

/**
 * Строка плана гейта переполнения (DS-177): ВСЕ случаи всех фикстур, а не
 * только объявившие `shows`. `shows` едет с собой: открытый поповер обязан
 * войти в замер, и гейт ждёт объявленное, прежде чем мерить.
 */
export interface CaseRow {
  c: string
  caseId: string
  shows?: string[]
  /** Довод, почему случай ОБЯЗАН переполнять (`Case.overflows`). */
  overflows?: string
  /** Довод, почему случай ОБЯЗАН нести цель мельче 24 (`Case.tinyTargets`). */
  tinyTargets?: string
  /** Довод, почему случай ОБЯЗАН нести поле уже образца (`Case.narrowFields`). */
  narrowFields?: string
}

/**
 * ТОТ ЖЕ `mods`, что у `showsPlan`, а не второй `import.meta.glob`: две копии
 * шаблона путей разошлись бы при первом переезде фикстур молча, и один из
 * гейтов обходил бы меньше, оставаясь зелёным.
 *
 * Сходимость с фикстурами держит `shows-plan.test.ts`, а ПЛОЩАДЬ — сам гейт,
 * сверяя компоненты плана со списком каталогов на диске: план, согласный сам
 * с собой, зелен и тогда, когда glob потерял половину каталога.
 */
/** Строка плана гейта ролей (JIG-42): адрес кадра плюс объявленные роли. */
export interface NodesRow {
  c: string
  caseId: string
  nodes: Record<string, string>
}

/**
 * ТОТ ЖЕ `mods` (доводом `casesPlan` выше) — второй `import.meta.glob`
 * покраснил бы `fixture-coverage` («копии найдены все», десять копий
 * литералом) и мог молча обойти меньше каталогов, оставаясь зелёным.
 *
 * Без `?.length`-фильтра, тем же доводом, что у `showsPlan`: пустой `nodes:
 * {}` — ошибка состава, её называет `validateFixtures`, а не тишина здесь.
 */
export async function nodesPlan(): Promise<NodesRow[]> {
  const rows: NodesRow[] = []
  for (const load of Object.values(mods)) {
    const fx = (await load()).default
    for (const c of fx.cases) {
      if (c.nodes) rows.push({ c: fx.name, caseId: c.id, nodes: c.nodes as Record<string, string> })
    }
  }
  rows.sort((a, b) => a.c.localeCompare(b.c) || a.caseId.localeCompare(b.caseId))
  return rows
}

export async function casesPlan(): Promise<CaseRow[]> {
  const rows: CaseRow[] = []
  for (const load of Object.values(mods)) {
    const fx = (await load()).default
    for (const c of fx.cases) {
      const row: CaseRow = { c: fx.name, caseId: c.id }
      if (c.shows) row.shows = c.shows
      if (c.overflows !== undefined) row.overflows = c.overflows
      if (c.tinyTargets !== undefined) row.tinyTargets = c.tinyTargets
      if (c.narrowFields !== undefined) row.narrowFields = c.narrowFields
      rows.push(row)
    }
  }
  rows.sort((a, b) => a.c.localeCompare(b.c) || a.caseId.localeCompare(b.caseId))
  return rows
}
