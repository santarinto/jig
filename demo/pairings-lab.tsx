import { StrictMode, useMemo, type JSX } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import '../fonts/inter.css'
import './pairings-lab.css'

import {
  FOREGROUNDS,
  NOT_A_SURFACE,
  NOT_PROMISED,
  SURFACES,
  THEMES,
  TINT_IS_NOT_A_CARRIER,
  TONES,
  TONE_JND,
  pairsFor,
  toneColour,
  tonePairs,
  type Pair,
  type ThemeName,
  type ToneCarrier,
} from '../tokens/colourPairs.js'

/* ------------------------------------------------------------------ *
 * СПРАВКА ПО СОЧЕТАЕМОСТИ — DS-181.
 *
 * Отвечает потребителю и агенту на вопрос «какой цвет законен на какой
 * поверхности», не заставляя их читать `src/__guards__`.
 *
 * РАСХОЖДЕНИЕ СО СТРАНИЦЕЙ НЕВОЗМОЖНО ПО ПОСТРОЕНИЮ, и это не обещание.
 * Страница и гейт зовут ОДИН модуль `tokens/colourPairs.ts` — те же словари,
 * те же полы, та же классификация. Скопировать сюда числа было бы дешевле, и
 * ровно так уже разошёлся `docs/contrast-report.md`: его таблицы называют
 * прежнюю палитру серий и зебру `#FAFAFA`, которой в токенах нет с тех пор,
 * как её меняли.
 *
 * ЗНАЧЕНИЯ БЕРУТСЯ ИЗ БРАУЗЕРА, а не из текста `tokens.css`. Гейт читает файл,
 * страница читает `getComputedStyle` — и это разные источники НАМЕРЕННО: если
 * они разойдутся, значит в бандл уехало не то, что лежит в токенах, и страница
 * скажет об этом вслух (блок «Расхождение» ниже), вместо того чтобы показать
 * правдоподобную таблицу не о том.
 *
 * Тёмная тема снимается со скрытого контейнера `[data-theme="dark"]`: токены
 * объявлены на селекторе, поэтому потомок отдаёт тёмные значения, пока сама
 * страница остаётся светлой. Обе темы видны рядом — то, ради чего DS-153.
 * ------------------------------------------------------------------ */

/** Значения всех цветовых токенов темы, как их отдаёт браузер. */
function readTheme(theme: ThemeName): Map<string, string> {
  const host = document.createElement('div')
  if (theme === 'dark') host.setAttribute('data-theme', 'dark')
  host.className = 'pl__probe'
  document.body.appendChild(host)
  const cs = getComputedStyle(host)
  const out = new Map<string, string>()
  for (const s of [...SURFACES, ...NOT_A_SURFACE]) out.set(s.token, hex(cs.getPropertyValue(`--ds-${s.token}`)))
  for (const f of FOREGROUNDS) out.set(f.token, hex(cs.getPropertyValue(`--ds-${f.token}`)))
  // Тона берут ещё и `-fg`, и поверхность — они уже собраны выше, кроме тонов
  // без своего токена в словарях.
  for (const t of ['success', 'warning', 'error', 'info', 'accent']) {
    out.set(`${t}-fg`, hex(cs.getPropertyValue(`--ds-${t}-fg`)))
  }
  host.remove()
  return out
}

/** `#RRGGBB` из того, что вернул браузер: он отдаёт объявленное значение как есть. */
function hex(raw: string): string {
  const s = raw.trim()
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(s)
  if (m) {
    const b = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
    return `#${b.toUpperCase()}`
  }
  const rgb = /^rgba?\(([^)]*)\)$/.exec(s)
  if (rgb) {
    const [r, g, b] = rgb[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number)
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
  }
  return s
}

const STATE_CLASS = { legal: 'pl__legal', unintended: 'pl__unintended', fail: 'pl__fail' } as const

function Matrix({ theme, values }: { theme: ThemeName; values: Map<string, string> }): JSX.Element {
  const pairs = pairsFor(theme, values)
  const at = (fg: string, bg: string): Pair =>
    pairs.find((p) => p.fg === fg && p.bg === bg)!
  return (
    <div className="pl__scroll">
      <table className="pl__matrix">
        <thead>
          <tr>
            <th>{theme === 'light' ? 'светлая' : 'тёмная'}</th>
            {SURFACES.map((s) => (
              <th key={s.token} className="pl__rot" title={s.why}>
                {s.token}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FOREGROUNDS.map((f) => (
            <tr key={f.token}>
              <th title={`${f.why}. Пол ${f.floor} — ${f.floorWhy}`}>
                {f.token} <span className="pl__unintended">≥{f.floor}</span>
              </th>
              {SURFACES.map((s) => {
                const p = at(f.token, s.token)
                return (
                  <td
                    key={s.token}
                    className={STATE_CLASS[p.state]}
                    title={`${p.fgHex} на ${p.bgHex} — ${p.state}`}
                  >
                    {p.ratio.toFixed(2)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const CARRIER_LABEL: Record<ToneCarrier, string> = {
  tone: 'сам токен — значок, рамка, сплошная заливка',
  label: 'подпись на своём тинте (--ds-*-fg)',
  tint: 'заливка 12% (у акцента 14%)',
}

function ToneTable({ theme, values }: { theme: ThemeName; values: Map<string, string> }): JSX.Element {
  return (
    <div className="pl__scroll">
      <table className="pl__tone">
        <thead>
          <tr>
            <th>{theme === 'light' ? 'светлая' : 'тёмная'}</th>
            {(['tone', 'label', 'tint'] as ToneCarrier[]).map((c) => (
              <th key={c} title={CARRIER_LABEL[c]}>
                {c}: худшая пара
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>
              {TONES.map((t) => (
                <span
                  key={t}
                  className="pl__swatch"
                  title={t}
                  style={{ background: toneColour('tint', t, values) }}
                />
              ))}
            </th>
            {(['tone', 'label', 'tint'] as ToneCarrier[]).map((c) => {
              const worst = tonePairs(c, theme, values).reduce((a, b) => (a.de <= b.de ? a : b))
              return (
                <td key={c} className={worst.de < TONE_JND ? 'pl__warn' : undefined}>
                  {worst.a}/{worst.b} — ΔE′ {worst.de.toFixed(2)} ({worst.vision})
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function App(): JSX.Element {
  const values = useMemo(
    () => Object.fromEntries(THEMES.map((t) => [t, readTheme(t)])) as Record<ThemeName, Map<string, string>>,
    [],
  )
  const counts = (theme: ThemeName): Record<string, number> => {
    const c: Record<string, number> = { legal: 0, unintended: 0, fail: 0 }
    for (const p of pairsFor(theme, values[theme])) c[p.state]++
    return c
  }
  const broken = THEMES.flatMap((t) =>
    pairsFor(t, values[t]).filter((p) => p.intended && p.state === 'fail'),
  )

  return (
    <div className="pl">
      <header className="pl__head">
        <h1>Сочетаемость цветов: что с чем ставят</h1>
        <p>
          Матрица «передний план × поверхность × тема» целиком:{' '}
          {FOREGROUNDS.length} × {SURFACES.length} × {THEMES.length} ={' '}
          {FOREGROUNDS.length * SURFACES.length * THEMES.length} пар. Числа считаются из
          значений токенов, которые отдал этот браузер, тем же модулем, которым их
          считает гейт <code>tokens/colourPairs.test.ts</code> — расходиться нечему.
        </p>
        <div className="pl__legend">
          <span>
            <b className="pl__legal">&nbsp;4.97&nbsp;</b> законна — объявлена и берёт пол
          </span>
          <span>
            <b className="pl__unintended">4.97</b> проходит по контрасту, но НЕ предназначена:
            ответ системы другой, смотрите строку слева
          </span>
          <span>
            <b className="pl__fail">4.97</b> не берёт пол
          </span>
        </div>
      </header>

      {broken.length > 0 && (
        <section className="pl__card pl__mismatch">
          <h2 className="pl__warn">Расхождение</h2>
          <p>
            Пара объявлена законной и не берёт пол по значениям ИЗ БРАУЗЕРА. Либо в бандл
            уехали не те токены, либо объявление устарело:
          </p>
          <ul className="pl__list">
            {broken.map((p) => (
              <li key={`${p.theme}${p.fg}${p.bg}`}>
                {p.theme}: --ds-{p.fg} ({p.fgHex}) на --ds-{p.bg} ({p.bgHex}) — {p.ratio.toFixed(2)}{' '}
                при поле {p.floor}
              </li>
            ))}
          </ul>
        </section>
      )}

      {THEMES.map((theme) => {
        const c = counts(theme)
        return (
          <section className="pl__card" key={theme}>
            <h2>{theme === 'light' ? 'Светлая тема' : 'Тёмная тема'}</h2>
            <p>
              законных {c.legal}, проходящих но не предназначенных {c.unintended}, не берущих пол{' '}
              {c.fail}
            </p>
            <h3>Пары</h3>
            <Matrix theme={theme} values={values[theme]} />
            <h3>Словарь тонов</h3>
            <ToneTable theme={theme} values={values[theme]} />
          </section>
        )
      })}

      <section className="pl__card">
        <h2>Тон: цвет подтверждает, а не несёт</h2>
        <p>
          Пол различимости тонов — {TONE_JND.toFixed(1)} (порог различения в CAM16-UCS), а не
          5.5, как у палитры серий. У серии цвет единственный носитель, у тона носитель —
          знак и слово (гейт <code>tone-carrier</code>). Подтверждению запас не нужен, но
          врать оно не имеет права.
        </p>
        <p>
          Заливка тона носителем НЕ является: в {TINT_IS_NOT_A_CARRIER.theme === 'light' ? 'светлой' : 'тёмной'}{' '}
          теме пара {TINT_IS_NOT_A_CARRIER.pair} при {TINT_IS_NOT_A_CARRIER.vision} даёт ΔE′{' '}
          {TINT_IS_NOT_A_CARRIER.de.toFixed(2)} — два тинта совпадают побайтово. Потолок здесь
          не природный: пара 12%-тинтов разводится до {TINT_IS_NOT_A_CARRIER.ceiling}, то есть
          их МОЖНО развести ценой смены смысловых цветов системы.
        </p>
      </section>

      <section className="pl__card">
        <h2>Чего сочетаемость не обещает</h2>
        <ul className="pl__list">
          {NOT_PROMISED.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>

      <section className="pl__card">
        <h2>Заливки, которые не поверхность</h2>
        <ul className="pl__list">
          {NOT_A_SURFACE.map((s) => (
            <li key={s.token}>
              <code>--ds-{s.token}</code> — {s.why}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
