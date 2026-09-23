import { describe, it, expect } from 'vitest'
import { classify, targetSections, type Cell, type TargetCell, type TargetHit } from './case-report.js'

interface M extends Cell { over: boolean; declared?: string; gap: number }
const cell = (at: string, over: boolean, gap = 0, declared?: string): M =>
  ({ at, url: `/frame.html?${at}`, c: at.split('/')[0]!, over, gap, declared })
const run = (ms: M[], unmeasured: { at: string; why: string }[] = [], known = new Map<string, string>()) =>
  classify<M>({
    measured: new Map(ms.map((m) => [m.at, m])), unmeasured, known,
    bad: (m) => m.over, declaredOf: (m) => m.declared, gapOf: (m) => m.gap,
  })

describe('классификация исходов обхода', () => {
  it('нарушение вне списка известных попадает в violations, худшее первым', () => {
    const s = run([cell('A/base ×1', true, 5), cell('B/base ×1', true, 40)])
    expect(s.violations.map((v) => v.at)).toEqual(['B/base ×1', 'A/base ×1'])
    expect(s.badCount).toBe(2)
  })

  it('известное нарушение не краснеет и уходит в свою секцию', () => {
    const s = run([cell('A/base ×1', true, 5)], [], new Map([['A/base ×1', 'DS-304']]))
    expect(s.violations).toEqual([])
    expect(s.known.map((v) => v.at)).toEqual(['A/base ×1'])
    expect(s.badCount).toBe(0)
  })

  it('известное, которое больше не нарушает, — устаревшее исключение и КРАСНОЕ', () => {
    const s = run([cell('A/base ×1', false)], [], new Map([['A/base ×1', 'DS-304']]))
    expect(s.stale).toEqual([{ at: 'A/base ×1', code: 'DS-304', why: 'больше не нарушает' }])
    expect(s.badCount).toBe(1)
  })

  it('известное, пары которого в обходе нет вовсе, — тоже устаревшее', () => {
    const s = run([], [], new Map([['A/gone ×1', 'DS-304']]))
    expect(s.stale[0]!.why).toBe('такой пары в обходе нет')
  })

  it('не измеренную пару вторым разом устаревшей НЕ называем', () => {
    const s = run([], [{ at: 'A/base ×1', why: 'кадр не смонтировался' }], new Map([['A/base ×1', 'DS-304']]))
    expect(s.stale).toEqual([])
    expect(s.badCount).toBe(1) // только «не измерено»
  })

  it('объявленное нарушение обязано нарушать, иначе КРАСНОЕ', () => {
    const s = run([cell('A/wide ×1', false, 0, 'лента шире кадра нарочно')])
    expect(s.declaredQuiet.map((v) => v.at)).toEqual(['A/wide ×1'])
    expect(s.badCount).toBe(1)
    const ok = run([cell('A/wide ×1', true, 9, 'лента шире кадра нарочно')])
    expect(ok.declaredQuiet).toEqual([])
    expect(ok.violations).toEqual([])
    expect(ok.badCount).toBe(0)
  })

  // Порядок вывода — предмет отдельных утверждений, не побочный эффект тестов
  // выше: там в каждом списке не больше одного элемента, а на списке из
  // одного утверждение о порядке упасть не может (ловушка 3,
  // docs/writing-checks.md). Ниже — по одному списку на секцию, с составом,
  // на котором сортировка и добор по адресу видны.
  it('declared сортируется по адресу, а не по разрыву', () => {
    const s = run([
      cell('B/wide ×1', true, 99, 'лента шире кадра нарочно'),
      cell('A/wide ×1', true, 1, 'лента шире кадра нарочно'),
    ])
    expect(s.declared.map((v) => v.at)).toEqual(['A/wide ×1', 'B/wide ×1'])
  })

  it('known сортируется по разрыву, худшее первым', () => {
    const s = run(
      [cell('A/base ×1', true, 5), cell('B/base ×1', true, 40)],
      [],
      new Map([['A/base ×1', 'DS-1'], ['B/base ×1', 'DS-2']]),
    )
    expect(s.known.map((v) => v.at)).toEqual(['B/base ×1', 'A/base ×1'])
  })

  it('stale сортируется по адресу', () => {
    const s = run([], [], new Map([['B/gone ×1', 'DS-2'], ['A/gone ×1', 'DS-1']]))
    expect(s.stale.map((x) => x.at)).toEqual(['A/gone ×1', 'B/gone ×1'])
  })

  it('равный разрыв сортируется по адресу — это добор, а не совпадение', () => {
    const s = run([cell('B/base ×1', true, 10), cell('A/base ×1', true, 10)])
    expect(s.violations.map((v) => v.at)).toEqual(['A/base ×1', 'B/base ×1'])
  })
})

describe('исходы строки цели клика', () => {
  const t = (path: string, width: number, height: number, hit: boolean | null = true): TargetHit =>
    ({ path, width, height, hit })
  const tc = (at: string, o: Partial<Pick<TargetCell, 'small' | 'unhittable' | 'unreachable'>> = {}, tiny?: string): TargetCell => ({
    at, url: `/frame.html?${at}`, c: at.split('/')[0]!, total: 3,
    small: o.small ?? [], unhittable: o.unhittable ?? [], unreachable: o.unreachable ?? [],
    row: tiny === undefined ? {} : { tinyTargets: tiny },
  })
  const go = (cs: TargetCell[], known = new Map<string, string>(), unmeasured: { at: string; why: string }[] = []) =>
    targetSections({ measured: new Map(cs.map((c) => [c.at, c])), unmeasured, known })

  it('чистая ячейка — ноль красного; мелкая и непопадаемая — нарушения', () => {
    expect(go([tc('A/base ×1')]).badCount).toBe(0)
    const s = go([tc('A/base ×1', { small: [t('button.x', 12, 12)] }), tc('B/base ×1', { unhittable: [t('button.y', 40, 40, false)] })])
    expect(s.violations.map((v) => v.at).sort()).toEqual(['A/base ×1', 'B/base ×1'])
    expect(s.badCount).toBe(2)
  })

  it('tinyTargets снимает мелкость: объявленная ячейка с мелкой целью — не нарушение', () => {
    const s = go([tc('A/field ×1', { small: [t('button.clear', 16, 16)] }, 'крестик в поле')])
    expect(s.violations).toEqual([])
    expect(s.declared.map((v) => v.at)).toEqual(['A/field ×1'])
    expect(s.badCount).toBe(0)
  })

  it('tinyTargets НЕ снимает непопадаемость: перекрытая цель на объявленном случае — нарушение', () => {
    const s = go([tc('A/field ×1', { small: [t('button.clear', 16, 16)], unhittable: [t('button.go', 40, 40, false)] }, 'крестик в поле')])
    expect(s.violations.map((v) => v.at)).toEqual(['A/field ×1'])
    expect(s.declared).toEqual([])
    expect(s.absent).toEqual([])
    expect(s.badCount).toBe(1)
  })

  it('объявлено, но мелкой цели нет — КРАСНОЕ «объявлено, но нет»', () => {
    const s = go([tc('A/field ×1', {}, 'крестик в поле')])
    expect(s.absent.map((v) => v.at)).toEqual(['A/field ×1'])
    expect(s.badCount).toBe(1)
  })

  it('объявлено, мелкой нет, но есть непопадаемая — оба дефекта названы, каждый своим именем', () => {
    const s = go([tc('A/field ×1', { unhittable: [t('button.go', 40, 40, false)] }, 'крестик в поле')])
    expect(s.violations.map((v) => v.at)).toEqual(['A/field ×1'])
    expect(s.absent.map((v) => v.at)).toEqual(['A/field ×1'])
    expect(s.badCount).toBe(2)
  })

  it('unreachable — своя секция, в счёт идёт каждая ЦЕЛЬ, и мелкие той же ячейки не прячутся', () => {
    const s = go([tc('A/long ×1', {
      small: [t('button.x', 12, 12)],
      unreachable: [t('button.far1', 40, 40, null), t('button.far2', 40, 40, null)],
    })])
    expect(s.far.map((v) => v.at)).toEqual(['A/long ×1'])
    expect(s.farCount).toBe(2)
    expect(s.violations.map((v) => v.at), 'мелкая цель той же ячейки названа').toEqual(['A/long ×1'])
    expect(s.badCount).toBe(3)
  })

  it('KNOWN прикрывает нарушение, а переставшее нарушать — устаревшее', () => {
    const known = new Map([['A/base ×1', 'DS-1']])
    const hit = go([tc('A/base ×1', { small: [t('button.x', 12, 12)] })], known)
    expect(hit.known.map((v) => v.at)).toEqual(['A/base ×1'])
    expect(hit.badCount).toBe(0)
    const gone = go([tc('A/base ×1')], known)
    expect(gone.stale.map((x) => x.at)).toEqual(['A/base ×1'])
    expect(gone.badCount).toBe(1)
  })

  it('KNOWN на случае, объявившем tinyTargets, — устаревшее: прикрывать там нечего', () => {
    // Объявленная ячейка уходит в `declared` ЦЕЛИКОМ, и `classify` видит её
    // «нарушающей» (мелкая цель есть) — то есть строку KNOWN не трогает. Без
    // этого строка списка жила бы вечно рядом с доводом, который уже её делает.
    const known = new Map([['A/field ×1', 'DS-9']])
    const s = go([tc('A/field ×1', { small: [t('button.clear', 16, 16)] }, 'крестик в поле')], known)
    expect(s.stale).toEqual([{ at: 'A/field ×1', code: 'DS-9', why: 'случай объявил tinyTargets — строка KNOWN лишняя' }])
    expect(s.badCount).toBe(1)
    // Сосед: та же строка на объявленной ячейке с непопадаемой целью — законно
    // известное нарушение (ячейка идёт общим путём), не устаревшее.
    const hit = go([tc('A/field ×1', { small: [t('button.clear', 16, 16)], unhittable: [t('button.go', 40, 40, false)] }, 'крестик')], known)
    expect(hit.stale).toEqual([])
    expect(hit.known.map((v) => v.at)).toEqual(['A/field ×1'])
    // И объявленная ячейка вовсе без мелкой цели называется устаревшей ОДИН раз.
    const quiet = go([tc('A/field ×1', {}, 'крестик')], known)
    expect(quiet.stale.map((x) => x.why)).toEqual(['больше не нарушает'])
  })

  it('худшее первым: непопадаемая прежде любой мелкой, из мелких — меньшая', () => {
    const s = go([
      tc('A/base ×1', { small: [t('button.a', 20, 30)] }),
      tc('B/base ×1', { small: [t('button.b', 10, 30)] }),
      tc('C/base ×1', { unhittable: [t('button.c', 40, 40, false)] }),
    ])
    expect(s.violations.map((v) => v.at)).toEqual(['C/base ×1', 'B/base ×1', 'A/base ×1'])
  })

  // Смягчение DS-177 (шаг 6): реверс-проверка судит СЛУЧАЙ по всем его
  // судимым шкалам разом, не отдельную ячейку. Цель растёт со шкалой
  // (`calc(<n>rem * var(--ds-ui-scale))`) и законно дотягивается до пола на
  // старших шкалах — это рост по шкале, а не протухший довод. Строгая форма
  // «на КАЖДОЙ шкале» красила бы Prose, KeyValueList и слоты EventCalendar на
  // 1.5 ложно.
  it('объявленный случай не протухает: мелкая цель нашлась хотя бы на одной шкале', () => {
    const s = go([
      tc('A/field ×0.875', { small: [t('button.clear', 16, 16)] }, 'крестик в поле'),
      tc('A/field ×1', { small: [t('button.clear', 18, 18)] }, 'крестик в поле'),
      tc('A/field ×1.15', {}, 'крестик в поле'),
      // Дорос до пола на 1.5 — мелкой цели тут нет, и это рост, не протухание.
      tc('A/field ×1.5', {}, 'крестик в поле'),
    ])
    expect(s.absent).toEqual([])
    expect(s.badCount).toBe(0)
  })

  it('объявленный случай протухает, только когда мелкой цели нет НИ НА ОДНОЙ шкале — и называется ОДИН раз, не по ячейке', () => {
    const s = go([
      tc('A/field ×0.875', {}, 'крестик в поле'),
      tc('A/field ×1', {}, 'крестик в поле'),
      tc('A/field ×1.15', {}, 'крестик в поле'),
      tc('A/field ×1.5', {}, 'крестик в поле'),
    ])
    expect(s.absent.map((v) => v.at)).toEqual(['A/field ×0.875'])
    expect(s.badCount).toBe(1)
  })

  // Сенсорная ось (DS-336): ячейка `… ×шкала касание` — тот же СЛУЧАЙ.
  // Сенсорная ветка, выросшая цель до пола, — тот же рост, что по шкале; без
  // снятия хвоста сенсорные ячейки были бы отдельным «случаем» и краснели бы
  // «объявлено, но нет» там, где довод жив на мышиных.
  it('сенсорная ячейка принадлежит тому же случаю: довод жив, если мелкая нашлась мышью', () => {
    const s = go([
      tc('A/field ×1', { small: [t('button.clear', 16, 16)] }, 'крестик в поле'),
      tc('A/field ×1 касание', {}, 'крестик в поле'),
    ])
    expect(s.absent).toEqual([])
    expect(s.badCount).toBe(0)
    // Сосед: мелкой нет НИ мышью, НИ пальцем — случай протух и назван один раз.
    const gone = go([tc('A/field ×1', {}, 'крестик'), tc('A/field ×1 касание', {}, 'крестик')])
    expect(gone.absent.map((v) => v.at)).toEqual(['A/field ×1'])
  })

  // Ось ширины (DS-347): ячейка `… ×шкала 440` — тот же СЛУЧАЙ, ровно по
  // той же причине. Живой пример: слоты EventCalendar на 440 дорастают до пола
  // (треку дня больше места), и пять его случаев приходили «объявлено, но нет»,
  // хотя довод жив на 360.
  it('ячейка второй ширины принадлежит тому же случаю: довод жив, если мелкая нашлась на 360', () => {
    const s = go([
      tc('A/field ×1.5', { small: [t('button.clear', 16, 16)] }, 'слот дня'),
      tc('A/field ×1.5 440', {}, 'слот дня'),
    ])
    expect(s.absent).toEqual([])
    expect(s.badCount).toBe(0)
    // Мелкой нет ни на одной ширине — случай протух и назван один раз.
    const gone = go([tc('A/field ×1.5', {}, 'слот'), tc('A/field ×1.5 440', {}, 'слот')])
    expect(gone.absent.map((v) => v.at)).toEqual(['A/field ×1.5'])
  })
})
