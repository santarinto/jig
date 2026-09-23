/**
 * Чистая половина обхода случаев (DS-177).
 *
 * Вынесена по тому же доводу, что и `sweep-plan.ts`: браузер нужен, чтобы СНЯТЬ
 * числа, а решить, что из них нарушение, можно и без него. Ошибка именно здесь —
 * не та секция, потерянное устаревшее исключение — дала бы ПРАВДОПОДОБНЫЙ
 * зелёный отчёт, то есть худший из исходов.
 *
 * Четыре исхода, и каждый из них краснеет отдельно:
 *  - нарушение вне `known`;
 *  - `known`, которое больше не нарушает ЛИБО которого в обходе нет, —
 *    устаревшее исключение: строка больше ничего не прикрывает по делу;
 *  - объявленное фикстурой нарушение, которое НЕ нарушает, — довод протух;
 *  - «не измерено» считает вызывающий, здесь оно лишь гасит устаревшее, чтобы
 *    одна и та же пара не краснела дважды по двум разным поводам.
 */

export interface Cell {
  /** Адрес ячейки: `Компонент/случай ×шкала`. */
  at: string
  /** Адрес кадра для человека. */
  url: string
  /** Имя компонента — для счёта «в скольких компонентах». */
  c: string
}

export interface ClassifyInput<M extends Cell> {
  measured: Map<string, M>
  unmeasured: { at: string; why: string }[]
  known: Map<string, string>
  bad: (m: M) => boolean
  declaredOf: (m: M) => string | undefined
  gapOf: (m: M) => number
}

export interface Sections<M> {
  violations: M[]
  known: M[]
  declared: M[]
  declaredQuiet: M[]
  stale: { at: string; code: string; why: string }[]
  badCount: number
}

export function classify<M extends Cell>(input: ClassifyInput<M>): Sections<M> {
  const { measured, unmeasured, known, bad, declaredOf, gapOf } = input
  const all = [...measured.values()]
  const byGap = (a: M, b: M) => gapOf(b) - gapOf(a) || a.at.localeCompare(b.at)
  const byAt = (a: M, b: M) => a.at.localeCompare(b.at)

  const declared = all.filter((m) => declaredOf(m) !== undefined).sort(byAt)
  const plain = all.filter((m) => declaredOf(m) === undefined && bad(m))
  const violations = plain.filter((m) => !known.has(m.at)).sort(byGap)
  const knownHit = plain.filter((m) => known.has(m.at)).sort(byGap)
  const declaredQuiet = declared.filter((m) => !bad(m))

  const unmeasuredAt = new Set(unmeasured.map((u) => u.at))
  const stale = [...known.entries()]
    .filter(([at]) => !unmeasuredAt.has(at) && !(measured.get(at) && bad(measured.get(at)!)))
    .map(([at, code]) => ({
      at, code,
      why: measured.has(at) ? 'больше не нарушает' : 'такой пары в обходе нет',
    }))
    .sort((a, b) => a.at.localeCompare(b.at))

  return {
    violations, known: knownHit, declared, declaredQuiet, stale,
    badCount: unmeasured.length + violations.length + declaredQuiet.length + stale.length,
  }
}

/** Цель клика, как её отдаёт `scanTargets` (`SmallTarget`); здесь нужна форма, а не DOM. */
export interface TargetHit {
  path: string
  width: number
  height: number
  hit: boolean | null
  /** Чем накрыта (`SmallTarget.coveredBy`): есть только при `hit === false`. */
  coveredBy?: string
}

/** Ячейка строки цели клика: списки `scanTargets` плюс довод фикстуры. */
export interface TargetCell extends Cell {
  total: number
  small: TargetHit[]
  unhittable: TargetHit[]
  unreachable: TargetHit[]
  row: { tinyTargets?: string }
}

export interface TargetSections<M> extends Sections<M> {
  /** Объявлено `tinyTargets`, а мелкой цели в ячейке нет — довод протух. */
  absent: M[]
  /** Ячейки, где у части целей попадание не снято (`unreachable`), по адресу. */
  far: M[]
  /** Сколько таких ЦЕЛЕЙ — они и идут в счёт красного. */
  farCount: number
}

/** Пол цели, CSS px — SC 2.5.8, тот же, что в `scanTargets`. */
export const TARGET_FLOOR = 24

/**
 * Исходы строки ЦЕЛИ КЛИКА (DS-177) — поверх `classify`, а не правкой его
 * модели. У `classify` объявленная ячейка уходит в «объявлено» ЦЕЛИКОМ, а
 * `tinyTargets` снимает ТОЛЬКО мелкость: непопадаемость решением не бывает.
 * Поэтому `classify` получает производную форму: объявленной ячейка считается
 * лишь без `unhittable`, а с ними идёт общим путём — нарушение или `KNOWN`, как
 * необъявленная.
 *
 * Сверху — две вещи, которых у `classify` нет:
 *  - «объявлено, но нет» и при `unhittable`: такая ячейка ушла в нарушения по
 *    непопадаемости, но протухший довод обязан быть назван сам, а не утонуть
 *    в соседней причине;
 *  - `unreachable` — ни нарушение, ни «не измерено» целиком (второе спрятало
 *    бы мелкие цели той же ячейки): своя секция, и каждая такая ЦЕЛЬ в счёте
 *    красного.
 *
 * Худшее первым: непопадаемая цель хуже любой мелкой (по мелкой попасть
 * трудно, по перекрытой нельзя); мелкая — на сколько меньшая сторона не
 * дотягивает до пола.
 */
export function targetSections<M extends TargetCell>(input: {
  measured: Map<string, M>
  unmeasured: { at: string; why: string }[]
  known: Map<string, string>
}): TargetSections<M> {
  const { measured } = input
  const waived = (m: M) => m.row.tinyTargets !== undefined
  const sections = classify<M>({
    ...input,
    bad: (m) => m.small.length > 0 || m.unhittable.length > 0,
    declaredOf: (m) => (m.unhittable.length === 0 ? m.row.tinyTargets : undefined),
    // Мелкость объявленной ячейки не вычитается из разрыва намеренно: в
    // нарушения объявленная ячейка попадает только с `unhittable`, то есть уже
    // с разрывом во весь пол — больше не бывает, и ветка была бы мёртвой.
    gapOf: (m) => Math.max(
      0,
      ...m.small.map((t) => TARGET_FLOOR - Math.min(t.width, t.height)),
      ...m.unhittable.map(() => TARGET_FLOOR),
    ),
  })
  const byAt = (a: M, b: M) => a.at.localeCompare(b.at)
  const all = [...measured.values()]
  // Случай — ключ без « ×шкала»: цель растёт со шкалой
  // (`calc(<n>rem * var(--ds-ui-scale))`) и законно дотягивается до пола на
  // старшей — рост, не протухание. Смягчение DS-177 (шаг 6, ruling):
  // протухшим довод считается ЦЕЛИКОМ ПО СЛУЧАЮ — мелкой цели нет НИ НА ОДНОЙ
  // судимой шкале, — а не когда её нет на одной. Строгая форма красила бы
  // Prose, KeyValueList и слоты EventCalendar на 1.5 ложно. Печатается ОДИН
  // раз на случай (первая по адресу шкала — представитель), а не по ячейке.
  // Хвост « касание» (сенсорная ось, DS-336) снимается тоже: довод
  // принадлежит СЛУЧАЮ, и цель, которую сенсорная ветка выросла до пола,
  // — тот же рост, что по шкале, а не протухание.
  //
  // И хвост « 768» (ось ширины, DS-347; число — вторая ширина оси,
  // DS-380 подняла её с 440) — по той же причине и на живом
  // примере: слоты `EventCalendar` на кадре 768 дорастают до пола, потому что
  // треку дня достаётся больше места. Пока хвост не снимался, пять его случаев
  // приходили «объявлено, но нет» — довод объявлен верно, а ось сделала из
  // одного случая два. Рост по ширине — тот же рост, что по шкале и по пальцу.
  const caseOf = (at: string) => at.replace(/ ×[\d.]+( касание)?( \d+)?$/, '')
  const declaredCells = all.filter(waived)
  const hasSmallByCase = new Map<string, boolean>()
  for (const m of declaredCells) {
    const c = caseOf(m.at)
    hasSmallByCase.set(c, (hasSmallByCase.get(c) ?? false) || m.small.length > 0)
  }
  const absentCases = [...hasSmallByCase].filter(([, has]) => !has).map(([c]) => c)
  const absent = absentCases
    .map((c) => declaredCells.filter((m) => caseOf(m.at) === c).sort(byAt)[0]!)
    .sort(byAt)
  const far = all.filter((m) => m.unreachable.length > 0).sort(byAt)
  const farCount = far.reduce((n, m) => n + m.unreachable.length, 0)
  // KNOWN на ячейке, ушедшей в `declared`, прикрывать нечего: мелкость снял
  // довод, а непопадаемой цели там нет (иначе ячейка шла бы общим путём).
  // `classify` эту строку не трогает — ячейка для него «нарушает», — и она
  // жила бы вечно. Ячейка без мелкой цели уже устаревшая у `classify`
  // («больше не нарушает»), второй раз не называется.
  const staleAt = new Set(sections.stale.map((x) => x.at))
  const redundant = sections.declared
    .filter((m) => input.known.has(m.at) && !staleAt.has(m.at))
    .map((m) => ({ at: m.at, code: input.known.get(m.at)!, why: 'случай объявил tinyTargets — строка KNOWN лишняя' }))
  const stale = [...sections.stale, ...redundant].sort((a, b) => a.at.localeCompare(b.at))
  return {
    ...sections, stale, absent, far, farCount,
    badCount: sections.badCount - sections.declaredQuiet.length + absent.length + farCount + redundant.length,
  }
}
