/**
 * `window.jig` — сторона оболочки (JIG-40).
 *
 * Измеряющий код кадра (`jig.ts`) оболочка НЕ грузит — хром верстака
 * по-прежнему не берёт рантайм у кадра (правило оболочки, `shell-app.tsx`,
 * шапка). Вместо этого `jig` оболочки — тонкий слой делегирования: методы
 * измерения (`FRAME_API`) уходят главному кадру, а `frame()`/`scratch`/
 * `clearScratch()` — свои, оболочечные.
 */
import { auditAddress } from './frame-url.js'
import { FRAME_API, SCRATCH_ID, type Env, type FrameJig, type Ready, type ShellJig } from './jig-api.js'

const sleep = (win: Window, ms: number): Promise<void> => new Promise((res) => win.setTimeout(res, ms))

export function makeShellJig(win: Window, opts: { loadSearch: string }): ShellJig {
  /**
   * `iframe.wb__frame` по индексу (умолчание 0) или переданный элемент.
   * Нет кадров вовсе, без аргумента при кадрах > 1 (сетка — неоднозначно,
   * какой из них «главный»), индекс вне диапазона — три разных отказа
   * словами; окно кадра без `jig` — «кадр ещё грузится».
   */
  function frame(which?: number | HTMLIFrameElement): FrameJig {
    const doc = win.document
    let el: HTMLIFrameElement
    if (which instanceof HTMLIFrameElement) {
      el = which
    } else {
      const all = [...doc.querySelectorAll<HTMLIFrameElement>('iframe.wb__frame')]
      if (all.length === 0) throw new Error('jig: нет iframe.wb__frame — это не оболочка верстака')
      if (which === undefined) {
        if (all.length > 1) throw new Error(`jig: в сетке ${all.length} кадров — jig.frame(i), i от 0 до ${all.length - 1}`)
        el = all[0]!
      } else {
        const found = all[which]
        if (!found) throw new Error(`jig: в сетке ${all.length} кадров — jig.frame(i), i от 0 до ${all.length - 1}`)
        el = found
      }
    }
    const frameWin = el.contentWindow as (Window & { jig?: FrameJig }) | null
    const frameJig = frameWin?.jig
    if (!frameJig) throw new Error('jig: кадр ещё грузится — await jig.ready()')
    return frameJig
  }

  /** Аудит адреса ЭТОГО документа (оболочки), а не адреса, зеркалящего кадр. */
  function withShellAddress(e: Env): Env {
    return { ...e, params: { ...e.params, address: auditAddress(opts.loadSearch, 'shell') } }
  }

  function env(): Env {
    return withShellAddress(frame().env())
  }

  async function ready(o?: { timeoutMs?: number }): Promise<Ready> {
    const timeoutMs = o?.timeoutMs ?? 3000
    const t0 = win.performance.now()
    // Ждём появления `frame().jig`: `frame()` бросает «кадр ещё грузится»,
    // пока `contentWindow.jig` не поставлен, — цикл ловит ровно этот момент
    // и повторяет попытку, а не гадает по другому признаку.
    while (true) {
      try {
        frame()
        break
      } catch (e) {
        if (win.performance.now() - t0 >= timeoutMs) throw e
        await sleep(win, 50)
      }
    }
    const r = await frame().ready(o)
    return withShellAddress(r) as Ready
  }

  const delegated = {} as Record<string, unknown>
  for (const name of FRAME_API) {
    if (name === 'env') delegated[name] = env
    else if (name === 'ready') delegated[name] = ready
    else delegated[name] = (...args: unknown[]) => (frame() as unknown as Record<string, (...a: unknown[]) => unknown>)[name]!(...args)
  }

  const jig: ShellJig = {
    ...(delegated as Omit<FrameJig, 'help'>),
    get help(): string {
      const frameHelp = (() => {
        try {
          return frame().help
        } catch {
          return ''
        }
      })()
      return [
        frameHelp,
        'jig.frame(i?) → FrameJig главного кадра (или кадра i в сетке); без аргумента и кадров > 1 — бросок',
        'jig.scratch → HTMLElement — слот #jig-scratch для проб агента (fixed, не сдвигает оболочку)',
        'jig.clearScratch() → number — убирает детей слота, возвращает сколько убрано',
      ].filter(Boolean).join('\n')
    },
    frame,
    get scratch(): HTMLElement {
      const el = win.document.getElementById(SCRATCH_ID)
      if (!el) throw new Error(`jig: нет #${SCRATCH_ID}`)
      return el
    },
    clearScratch(): number {
      const el = win.document.getElementById(SCRATCH_ID)
      if (!el) throw new Error(`jig: нет #${SCRATCH_ID}`)
      const n = el.children.length
      el.replaceChildren()
      return n
    },
  }

  return jig
}

export function installShellJig(win: Window = window): ShellJig {
  const jig = makeShellJig(win, { loadSearch: win.location.search })
  win.jig = jig
  return jig
}
