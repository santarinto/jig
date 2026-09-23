/**
 * Сведение фикстуры и адреса в итоговые пропсы.
 *
 * Порядок важен и проверяется тестом: шапка → кейс → набор данных →
 * переопределения из адреса. Каждый следующий слой перекрывает предыдущий.
 *
 * Живёт отдельно от frame-app.tsx: там компонент и React-эффекты, здесь —
 * чистая функция слоёв, которую тест зовёт напрямую, без монтирования `Frame`.
 */
import type { AnyFixture } from '../src/internal/fixture.js'
import { coerceControl } from './control-value.js'
import type { FrameState } from './frame-url.js'

export function resolveCase(fx: AnyFixture, s: FrameState): Record<string, unknown> {
  const kase = fx.cases.find((x) => x.id === s.caseId) ?? fx.cases[0]
  const dataDelta = s.data ? (fx.data?.[s.data] ?? {}) : {}
  const props: Record<string, unknown> = { ...fx.props, ...kase?.props, ...dataDelta }

  for (const [k, raw] of Object.entries(s.props)) {
    // `hasOwn`, А НЕ ПРОСТО ПОИСК ПО КЛЮЧУ. `fx.controls['toString']` возвращает
    // МЕТОД `Object.prototype` — истинный, — и барьер ниже пропускал `toString`,
    // `constructor`, `valueOf` в компонент. То есть единственная защита от
    // мусора не работала ровно для тех имён, которые в адрес попадают проще
    // всего: `?p.toString=…` набирается руками, а место канваса с
    // `props:{"toString":"…"}` правится руками в файле.
    //
    // Расхождение шло и дальше: `snippetOf` печатает по
    // `Object.entries(controls)` и такой проп не показывает — кадр его
    // применил, сниппет о нём молчит.
    // `hasOwnProperty.call`, а не `Object.hasOwn`: цель сборки — ES2020, и
    // `hasOwn` там ещё нет. Менять цель ради одного вызова значило бы
    // подвинуть то, что едет потребителю, ради удобства одной строки.
    if (!Object.prototype.hasOwnProperty.call(fx.controls, k)) continue
    const ctl = fx.controls[k]
    // Крутилку, которой в фикстуре нет, из адреса не применяем: иначе старая
    // ссылка после переименования пропа молча подсунет мусор в компонент.
    if (!ctl) continue
    // НЕПОНЯТОЕ ЗНАЧЕНИЕ — как отсутствующее, а не как ложь (DS-265).
    // Разбор и довод — в `control-value.ts`; здесь важно только то, что при
    // `ok: false` слой адреса НЕ перекрывает умолчание случая, то есть
    // опечатка даёт обычный кадр, а не другой, законно выглядящий.
    const coerced = coerceControl(ctl, raw)
    if (!coerced.ok) continue
    props[k] = coerced.value
  }

  return props
}
