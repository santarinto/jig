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
import { FRAME_API, SCRATCH_ID, type Env, type FrameJig, type NodeInfo, type Ready, type ShellJig } from './jig-api.js'

const sleep = (win: Window, ms: number): Promise<void> => new Promise((res) => win.setTimeout(res, ms))

export function makeShellJig(win: Window, opts: { loadSearch: string }): ShellJig {
  /**
   * `iframe.wb__frame` по индексу (умолчание 0) или переданный элемент.
   * Нет кадров вовсе, без аргумента при кадрах > 1 (сетка — неоднозначно,
   * какой из них «главный»), индекс вне диапазона — три разных отказа
   * словами.
   */
  function frameEl(which?: number | HTMLIFrameElement): HTMLIFrameElement {
    if (which instanceof HTMLIFrameElement) return which
    const doc = win.document
    const all = [...doc.querySelectorAll<HTMLIFrameElement>('iframe.wb__frame')]
    if (all.length === 0) throw new Error('jig: нет iframe.wb__frame — это не оболочка верстака')
    if (which === undefined) {
      if (all.length > 1) throw new Error(`jig: в сетке ${all.length} кадров — jig.frame(i), i от 0 до ${all.length - 1}`)
      return all[0]!
    }
    const found = all[which]
    if (!found) throw new Error(`jig: в сетке ${all.length} кадров — jig.frame(i), i от 0 до ${all.length - 1}`)
    return found
  }

  /** Окно кадра без `jig` — «кадр ещё грузится». */
  function frame(which?: number | HTMLIFrameElement): FrameJig {
    const el = frameEl(which)
    const frameWin = el.contentWindow as (Window & { jig?: FrameJig }) | null
    const frameJig = frameWin?.jig
    if (!frameJig) throw new Error('jig: кадр ещё грузится — await jig.ready()')
    return frameJig
  }

  /**
   * Аудит адреса ЭТОГО документа (оболочки), а не адреса, зеркалящего кадр.
   *
   * `sx`/`sy` БЕЗ роли `port` (JIG-42) — просьба указывает в пустоту: сама
   * `auditAddress` этого не знает, она разбирает СТРОКУ и ролей случая не
   * видит. Здесь роли есть — `frame().nodes()` уже спрошен ради `env()` —
   * поэтому находка дописывается сюда, а не заводит второй проход по адресу.
   * Кадр ещё грузится (`frame()`/`nodes()` бросает) — находка не пишется:
   * судить пока не о чем, а не «роли нет».
   */
  function withShellAddress(e: Env): Env {
    const address = auditAddress(opts.loadSearch, 'shell')
    const askedScroll = (['sx', 'sy'] as const).filter((k) => k in address.asked)
    if (askedScroll.length) {
      let roles: Record<string, NodeInfo> | null = null
      try {
        roles = frame().nodes()
      } catch {
        /* кадр ещё грузится — нечем судить о роли port */
      }
      if (roles && !('port' in roles)) {
        for (const key of askedScroll) {
          address.ignored.push({ key, why: 'у случая нет роли port — прокрутку не к чему применить' })
        }
      }
    }
    return { ...e, params: { ...e.params, address } }
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

  /**
   * `nodes()` оболочки несёт ЕЩЁ И `page` — коробку узла во вьюпорте
   * ОБОЛОЧКИ, а не только кадра (решение 1.3 спецификации): область для
   * зума браузерному агенту без снимка-ориентира. Смещение — прямоугольник
   * `<iframe>` плюс его собственная рамка (`clientLeft`/`clientTop`), r2 тем
   * же округлением, что и остальные коробки `jig`.
   */
  function nodes(): Record<string, NodeInfo> {
    const base = frame().nodes()
    const f = frameEl()
    const r = f.getBoundingClientRect()
    const ox = r.left + f.clientLeft
    const oy = r.top + f.clientTop
    const r2 = (n: number): number => Math.round(n * 100) / 100
    const out: Record<string, NodeInfo> = {}
    for (const [role, info] of Object.entries(base)) {
      out[role] = {
        ...info,
        page: info.box ? { l: r2(info.box.l + ox), t: r2(info.box.t + oy), r: r2(info.box.r + ox), b: r2(info.box.b + oy) } : null,
      }
    }
    return out
  }

  const delegated = {} as Record<string, unknown>
  for (const name of FRAME_API) {
    if (name === 'env') delegated[name] = env
    else if (name === 'ready') delegated[name] = ready
    else if (name === 'nodes') delegated[name] = nodes
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
        'jig.frame(i?) → FrameJig — кадр i в сетке (умолч. 0); без аргумента при кадрах >1 — бросок',
        'jig.scratch → HTMLElement — слот #jig-scratch для проб (fixed, не сдвигает оболочку)',
        'jig.clearScratch() → number — чистит слот, отдаёт сколько убрано',
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
