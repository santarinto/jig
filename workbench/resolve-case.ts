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

/**
 * Один шаг слоя адреса, ровно то, что `resolveCase` делает с `p.<k>` —
 * вынесено на JIG-40, чтобы «применено» и «не применено» считала ОДНА функция
 * (`jig.env().params.fixture` спрашивает у `auditCase` ниже про то же самое,
 * что применяет `resolveCase`, и второй копии барьера не заводим).
 */
export type PropVerdict = { ok: true; value: unknown } | { ok: false; why: 'нет такой крутилки' | 'значение не понято' }

export function propOf(fx: AnyFixture, k: string, raw: string): PropVerdict {
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
  if (!Object.prototype.hasOwnProperty.call(fx.controls, k)) return { ok: false, why: 'нет такой крутилки' }
  const ctl = fx.controls[k]
  // Крутилку, которой в фикстуре нет, из адреса не применяем: иначе старая
  // ссылка после переименования пропа молча подсунет мусор в компонент.
  if (!ctl) return { ok: false, why: 'нет такой крутилки' }
  // НЕПОНЯТОЕ ЗНАЧЕНИЕ — как отсутствующее, а не как ложь (DS-265).
  // Разбор и довод — в `control-value.ts`; здесь важно только то, что при
  // `ok: false` слой адреса НЕ перекрывает умолчание случая, то есть
  // опечатка даёт обычный кадр, а не другой, законно выглядящий.
  const coerced = coerceControl(ctl, raw)
  if (!coerced.ok) return { ok: false, why: 'значение не понято' }
  return { ok: true, value: coerced.value }
}

/** Случай, который применяет резолвер: названный — если есть, иначе первый. */
function caseOf(fx: AnyFixture, id: string) {
  return fx.cases.find((x) => x.id === id) ?? fx.cases[0]
}

export function resolveCase(fx: AnyFixture, s: FrameState): Record<string, unknown> {
  const kase = caseOf(fx, s.caseId)
  const dataDelta = s.data ? (fx.data?.[s.data] ?? {}) : {}
  const props: Record<string, unknown> = { ...fx.props, ...kase?.props, ...dataDelta }

  for (const [k, raw] of Object.entries(s.props)) {
    const verdict = propOf(fx, k, raw)
    if (!verdict.ok) continue
    props[k] = verdict.value
  }

  return props
}

/**
 * АУДИТ ФИКСТУРЫ (JIG-40, решение спецификации п.2б): случай, набор данных и
 * крутилки из АДРЕСА против того, что реально загружено. Неизвестный случай
 * молча падает в первый, неизвестный набор — в `{}`, непонятая крутилка молча
 * пропускается (см. `resolve-case.ts` выше) — три способа, которыми опечатка
 * агента (имена из промта волны) выглядит как обычный кадр, а не как отказ.
 */
export interface CaseAudit {
  c: string
  /** `used` — id случая, который РЕАЛЬНО применён (`caseOf`), не то, что просили. */
  case: { asked: string; used: string | null }
  /** `null` — набор не задан адресом вовсе. */
  data: { asked: string; known: boolean } | null
  /** Только НЕ применённые крутилки — применённые ничем не отличаются от заданных фикстурой. */
  props: { key: string; asked: string; why: string }[]
}

export function auditCase(fx: AnyFixture, s: FrameState): CaseAudit {
  const kase = caseOf(fx, s.caseId)
  const props: { key: string; asked: string; why: string }[] = []
  for (const [k, raw] of Object.entries(s.props)) {
    const verdict = propOf(fx, k, raw)
    if (!verdict.ok) props.push({ key: k, asked: raw, why: verdict.why })
  }
  return {
    c: s.c,
    case: { asked: s.caseId, used: kase?.id ?? null },
    data: s.data ? { asked: s.data, known: !!fx.data && Object.prototype.hasOwnProperty.call(fx.data, s.data) } : null,
    props,
  }
}
