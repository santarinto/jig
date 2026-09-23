/**
 * Проверка состава фикстур — чистая функция, без vitest и без вывода.
 *
 * Живёт отдельно от гейта, чтобы её можно было позвать и из верстака (показать
 * ошибку в панели), и из теста. Возвращает список ошибок строками: пустой
 * список значит «всё сходится».
 *
 * Главное, ради чего написана: ссылка `{c:'Button', case:'danger'}` сегодня
 * верна, а после переименования кейса молча покажет пустоту. Типы такое не
 * ловят — связка выражена данными, а не сигнатурой.
 */
import type { AnyFixture, SlotKind } from './fixture.js'

/**
 * Годится ли фикстура вида `kind` в позицию, принимающую `accepts`.
 *
 * ОДНА функция на две половины: её зовёт гейт (через `validateFixtures`) и её же
 * зовут кадр (какую начинку рисовать) и панель (сколько начинок предложить).
 * Копий быть не должно — разъехавшись, они дают гейт, который пропускает то,
 * чего кадр не нарисует.
 *
 * Импортировать её из `workbench/` можно: этот модуль импортирует только ТИПЫ
 * и не исполняет ни одного компонента. Запрет «оболочка не импортирует фикстуры»
 * — про модули, которые тащат в документ панели компонент, его CSS и его
 * стресс-данные.
 *
 * `kind === undefined` годится куда угодно: фикстура не объявляла ограничений.
 */
export const fitsSlot = (accepts: SlotKind, kind: SlotKind | undefined): boolean =>
  accepts === 'any' || kind === undefined || kind === 'any' || accepts === kind

/**
 * `shows` — ОБЪЯВЛЕНИЕ, и здесь проверяется только оно само: что случай хочет
 * сказать. Держится ли утверждение, спрашивает `scripts/case-states.mjs` в
 * браузере — здесь ни кадра, ни раскладки нет.
 *
 * Две ошибки ловятся тут, потому что обе делают гейт состояний ЗЕЛЁНЫМ, ничего
 * не проверив, а красным он станет в другом месте и через минуту прогона:
 *
 * 1. Пустой список. `shows: []` — объявление, не утверждающее ничего: обход по
 *    нему проходит ноль раз и кейс числится проверенным.
 * 2. Классовый селектор. `.ds-combobox__list` верен ровно до ближайшего
 *    переименования блока, а роль и `aria-*` — контракт компонента наружу
 *    (`docs/writing-checks.md`, пункт 4). Запрет — по подстроке `.ds-`, потому
 *    что имя блока системы начинается только так; `[class*="ds-"]` он не
 *    закрывает, и это не дыра, а граница: обойти запрет можно любой ценой, а
 *    речь про то, чтобы его не нарушали не подумав.
 */
function showsErrors(name: string, caseId: string, shows: string[] | undefined): string[] {
  if (shows === undefined) return []
  const errs: string[] = []
  if (shows.length === 0) {
    errs.push(`${name}/${caseId}: shows объявлен пустым — это утверждение ни о чём`)
  }
  for (const sel of shows) {
    if (sel.trim() === '') {
      errs.push(`${name}/${caseId}: пустой селектор в shows`)
      continue
    }
    if (sel.includes('.ds-')) {
      errs.push(
        `${name}/${caseId}: селектор «${sel}» держится за класс системы. ` +
          `В shows идут роль и aria-состояние — контракт компонента, а не наше имя блока`,
      )
    }
  }
  return errs
}

export function validateFixtures(list: AnyFixture[]): string[] {
  const errs: string[] = []
  const byName = new Map<string, AnyFixture>()

  for (const f of list) {
    if (byName.has(f.name)) errs.push(`Фикстура «${f.name}» объявлена дважды`)
    byName.set(f.name, f)

    if (f.cases.length === 0) errs.push(`${f.name}: ни одного кейса`)

    const ids = new Set<string>()
    for (const c of f.cases) {
      if (ids.has(c.id)) errs.push(`${f.name}: кейс «${c.id}» объявлен дважды`)
      ids.add(c.id)
      errs.push(...showsErrors(f.name, c.id, c.shows))
      // `overflows` — довод, а не флаг (DS-177): пустая строка разрешила
      // бы случаю переполнять, ничего не сказав о том, зачем.
      if (c.overflows !== undefined && c.overflows.trim() === '') {
        errs.push(`${f.name}/${c.id}: overflows объявлен пустым — нужен довод, почему случай переполняет`)
      }
      if (c.tinyTargets !== undefined && c.tinyTargets.trim() === '') {
        errs.push(`${f.name}/${c.id}: tinyTargets объявлен пустым — нужен довод, почему случай несёт цель мельче 24`)
      }
      if (c.narrowFields !== undefined && c.narrowFields.trim() === '') {
        errs.push(`${f.name}/${c.id}: narrowFields объявлен пустым — нужен довод, почему случай несёт поле уже образцового значения`)
      }
    }
  }

  // Второй проход: ссылки разрешаются только когда известны все имена.
  for (const f of list) {
    for (const c of f.cases) {
      for (const [slotId, fill] of Object.entries(c.slots ?? {})) {
        const slot = f.slots?.[slotId]
        if (!slot) {
          errs.push(`${f.name}/${c.id}: начинка в позицию «${slotId}», которой нет`)
          continue
        }
        if (!('c' in fill)) {
          // Текстовая начинка допущена ТИПОМ, но не поддержана НИ ОДНОЙ половиной верстака
          // (панель не выбирает, кадр не рисует). Красный гейт в момент объявления дешевле
          // получаса «почему в ячейке пусто»: снять эту проверку — работа на минуту, и
          // делается она вместе с поддержкой, а не до неё.
          errs.push(`${f.name}/${c.id}: текстовая начинка «${slotId}» пока не поддержана`)
          continue
        }

        const target = byName.get(fill.c)
        if (!target) {
          errs.push(`${f.name}/${c.id}: начинка «${fill.c}» — такой фикстуры нет`)
          continue
        }
        if (fill.case && !target.cases.some((x) => x.id === fill.case)) {
          errs.push(`${f.name}/${c.id}: у «${fill.c}» нет кейса «${fill.case}»`)
        }
        if (!fitsSlot(slot.accepts, target.kind)) {
          errs.push(
            `${f.name}/${c.id}: позиция «${slotId}» принимает ${slot.accepts}, ` +
              `а «${fill.c}» объявлен как ${target.kind}`,
          )
        }
      }
    }
  }

  return errs
}
