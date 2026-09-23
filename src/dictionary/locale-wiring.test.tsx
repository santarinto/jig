import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { DsText, useDsLocale, DS_LOCALE_DEFAULT } from './DsText.js'
import { Timeline } from '../components/Timeline/Timeline.js'
import { LogViewer } from '../components/LogViewer/LogViewer.js'
import { Heatmap } from '../components/Heatmap/Heatmap.js'
import { AgentTranscript } from '../components/AgentTranscript/AgentTranscript.js'
import { Calendar } from '../components/Calendar/Calendar.js'
import { EventCalendar } from '../components/EventCalendar/EventCalendar.js'
import { BarChart } from '../components/BarChart/BarChart.js'
import { DonutChart } from '../components/DonutChart/DonutChart.js'

/**
 * Локаль доезжает до КАЖДОГО из восьми мест (DS-184).
 *
 * Почему отдельным файлом и почему гейта `date-locale` мало. Гейт запрещает
 * компоненту брать локаль самому — то есть ловит возврат дефекта, — но ничего
 * не говорит о том, что провайдер работает. Компонент, перестав звать `Intl`
 * ВОВСЕ, прошёл бы гейт и потерял бы форматирование молча.
 *
 * Проверка построена на РАЗЛИЧЕНИИ, а не на счётчике: один и тот же случай
 * рисуется дважды — без провайдера и под `<DsText locale="en-US">`, — и
 * утверждение в том, что вывод РАЗНЫЙ и что каждая половина именно та, какую
 * ждём. «Есть английский текст» проходило бы и на компоненте, который английский
 * прибил; «текст изменился» прошло бы на любом дребезге.
 *
 * Часовой пояс здесь НЕ проверяется и проверяться не может: у машины он свой, и
 * тест, зависящий от него, красен на половине машин. Даты подобраны так, чтобы
 * ответ не зависел от пояса (полдень UTC), а `Heatmap` держит `timeZone: 'UTC'`
 * сам — про это отдельное утверждение ниже.
 */

afterEach(() => {
  document.body.innerHTML = ''
})

/** Полдень: сдвиг в любой реальный пояс не уводит дату на соседние сутки. */
const NOON = '2026-09-02T12:00:00.000Z'

function both(node: ReactNode): { ru: string; en: string } {
  const a = render(<>{node}</>)
  const ru = a.container.textContent ?? ''
  a.unmount()
  const b = render(<DsText locale="en-US">{node}</DsText>)
  const en = b.container.textContent ?? ''
  b.unmount()
  return { ru, en }
}

describe('locale wiring', () => {
  it('умолчание — ru-RU, а не локаль браузера', () => {
    function Probe() {
      return <span data-testid="probe">{useDsLocale()}</span>
    }
    render(<Probe />)
    expect(screen.getByTestId('probe').textContent).toBe('ru-RU')
    expect(DS_LOCALE_DEFAULT).toBe('ru-RU')
  })

  it('вложенный провайдер перекрывает внешний, а незаданная локаль наследуется', () => {
    function Probe() {
      return <span>{useDsLocale()}</span>
    }
    const { container } = render(
      <DsText locale="en-US">
        <Probe />
        <DsText locale="de-DE"><Probe /></DsText>
        {/* Словарь без локали не смеет сбрасывать локаль внешнего провайдера. */}
        <DsText value={{ 'modal.close': 'x' }}><Probe /></DsText>
      </DsText>,
    )
    expect(container.textContent).toBe('en-USde-DEen-US')
  })

  it('Timeline: заголовок дня и время', () => {
    const events = [{ id: '1', ts: NOON, kind: 'note', body: 'тело' }]
    const { ru, en } = both(<Timeline events={events} />)
    expect(ru).toContain('2 сентября 2026')
    expect(en).toContain('September 2, 2026')
  })

  it('Timeline без группировки: метка времени несёт дату, и связь с groupByDay не порвана', () => {
    const events = [{ id: '1', ts: NOON, kind: 'note', body: 'тело' }]
    const { ru, en } = both(<Timeline events={events} groupByDay={false} />)
    // Порядок частей — вот что различает локали в этом формате, и вот из-за
    // чего задача и заведена: «09/02/2026» в русском интерфейсе читается как
    // девятое февраля.
    expect(ru).toMatch(/02\.09\.2026/)
    expect(en).toMatch(/09\/02\/2026/)
  })

  it('LogViewer: отметка времени', () => {
    const lines = [{ ts: NOON, kind: 'info', text: 'строка' }]
    const el = <LogViewer lines={lines} getLineId={(l) => l.ts} />
    const a = render(el)
    const ru = a.container.textContent ?? ''
    a.unmount()
    // ar-EG, а НЕ en-US, и это не каприз: у `LogViewer` в опциях прибит
    // `hour12: false`, поэтому «15:00:00» в русском и английском совпадает ЗНАК
    // В ЗНАК — сравнение с en-US было бы зелёным и при полностью оторванной
    // локали. Различает набор цифр: арабо-индийские против латинских.
    const b = render(<DsText locale="ar-EG">{el}</DsText>)
    const ar = b.container.textContent ?? ''
    b.unmount()
    expect(ru).toContain('15:00:00')
    expect(ar).toContain('١٥:٠٠:٠٠')
  })

  it('AgentTranscript: разделитель дня', () => {
    const turns = [{ kind: 'message' as const, id: '1', role: 'user' as const, ts: NOON, text: 'привет' }]
    const { ru, en } = both(<AgentTranscript turns={turns} getTurnId={(t) => t.id} groupByDay />)
    expect(ru).toContain('02 сентября 2026')
    expect(en).toContain('September 02, 2026')
  })

  it('Heatmap: месяцы и дни недели, при этом timeZone UTC остаётся', () => {
    const { ru, en } = both(
      <Heatmap data={[{ date: '2026-09-02', value: 3 }]} from="2026-09-01" to="2026-09-30" />,
    )
    expect(ru).toContain('Сен')
    expect(en).toContain('Sep')
    // Подпись первого дня недели: ru «Пн», en «Mon». Первая буква поднята —
    // Intl отдаёт «пн» строчной, потому что так это пишется в тексте.
    expect(ru).toContain('Пн')
    expect(en).toContain('Mon')
  })

  it('Calendar: шапка месяца, дни недели и доступное имя дня', () => {
    const { ru, en } = both(<Calendar year={2026} month={8} selectedId="2026-09-02" />)
    expect(ru).toContain('Сентябрь 2026')
    expect(en).toContain('September 2026')
    expect(ru).toContain('Пн')
    expect(en).toContain('Mon')
  })

  it('Calendar: имя ячейки дня — родительный падеж от Intl, а не таблица месяцев', () => {
    render(<Calendar year={2026} month={8} selectedId="2026-09-02" />)
    // «2 сентября 2026 г.», а не «2 Сентябрь 2026»: своя таблица дала бы
    // именительный, и это ровно тот довод, ради которого тут Intl.
    expect(screen.getAllByLabelText(/2 сентября 2026/).length).toBeGreaterThan(0)
  })

  it('EventCalendar: доступное имя дня', () => {
    // Имя дня живёт в `aria-label`, а не в тексте: сравнивается разметка, иначе
    // тест мерил бы столбец часов и был бы зелен при любой локали.
    const a = render(<EventCalendar view="day" date="2026-09-02" events={[]} />)
    expect(a.container.innerHTML).toMatch(/2 сентября 2026/)
    a.unmount()
    const b = render(
      <DsText locale="en-US"><EventCalendar view="day" date="2026-09-02" events={[]} /></DsText>,
    )
    expect(b.container.innerHTML).toMatch(/September 2, 2026/)
    b.unmount()
  })

  it('BarChart: разделитель разрядов', () => {
    const { ru, en } = both(
      <BarChart categories={['a']} series={[{ id: 's', label: 'ряд', values: [1234567] }]} valueLabels />,
    )
    // Русский группирует неразрывным пробелом, английский — запятой. Сравнение
    // идёт по РАЗДЕЛИТЕЛЮ, а не по «строка изменилась».
    expect(ru).toContain('1 234 567')
    expect(en).toContain('1,234,567')
  })

  it('DonutChart: разделитель разрядов', () => {
    const { ru, en } = both(
      <DonutChart data={[{ id: 'a', label: 'a', value: 1234567 }]} />,
    )
    expect(ru).toContain('1 234 567')
    expect(en).toContain('1,234,567')
  })

  it('свой formatDay по-прежнему перекрывает локаль', () => {
    const events = [{ id: '1', ts: NOON, kind: 'note', body: 'тело' }]
    const { container } = render(
      <DsText locale="en-US">
        <Timeline events={events} formatDay={() => 'МОЙ ДЕНЬ'} />
      </DsText>,
    )
    expect(container.textContent).toContain('МОЙ ДЕНЬ')
    expect(container.textContent).not.toContain('September')
  })
})
