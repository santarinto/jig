import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Pagination, pageWindow } from './Pagination.js'
import { DS_TEXT_RU } from '../../dictionary/text.js'

describe('Pagination', () => {
  it('marks the active page and pages via next; prev disabled on first page', async () => {
    const onChange = vi.fn()
    render(<Pagination page={1} pageCount={3} onChange={onChange} />)
    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Вперёд' }))
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('fires onChange with the clicked page number', async () => {
    const onChange = vi.fn()
    render(<Pagination page={1} pageCount={3} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '3' }))
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('многоточие рисуется в паре со страницей, к которой ведёт', () => {
    // `…` значит «пропуск ДО этой страницы»: знак привязан смыслом к соседу
    // справа. Пару завели, когда ряд номеров ПЕРЕНОСИЛСЯ (DS-142): она
    // рвалась первой — на 360 в псевдолокали верхний ряд кончался на «…», а
    // «18» начинала нижний, и оторванное многоточие читается как «и так
    // далее», то есть как КОНЕЦ списка. С DS-282 ряд не переносится
    // нигде, и разорвать пару переносом больше нечем — но разметка остаётся
    // той же и по второй причине: компактный вид снимает номера селектором
    // `> .ds-pager__jump`, то есть по прямому ребёнку ряда.
    const { container } = render(<Pagination page={97} pageCount={200} />)
    const jumps = [...container.querySelectorAll('.ds-pager__jump')]
    // Окно `pageWindow(97, 200)` — [1, …, 96, 97, 98, …, 200]: два многоточия.
    expect(jumps).toHaveLength(2)
    for (const j of jumps) {
      expect(j.querySelectorAll('.ds-pager__gap')).toHaveLength(1)
      expect(j.querySelectorAll('.ds-pager__btn')).toHaveLength(1)
      // Именно СЛЕДУЮЩАЯ страница, а не любая: порядок внутри пары и есть
      // смысл знака.
      expect(j.firstElementChild).toHaveClass('ds-pager__gap')
    }
    expect(jumps.map((j) => j.querySelector('.ds-pager__btn')!.textContent)).toEqual(['96', '200'])
    // Ни одного многоточия вне пары: одинокое — это ровно тот разрыв, против
    // которого пара и заведена.
    const lone = [...container.querySelectorAll('.ds-pager__gap')]
      .filter((g) => !g.closest('.ds-pager__jump'))
    expect(lone, `многоточий вне пары: ${lone.length}`).toHaveLength(0)
  })

  it('пара не съедает кнопку: страниц столько же, сколько номеров в окне', () => {
    // Обратная мутация. Склейка сдвигает индекс, и «пропустить соседа» —
    // естественная ошибка такой петли: полоса при этом выглядит нормально,
    // просто одной страницы в ней нет.
    const { container } = render(<Pagination page={97} pageCount={200} />)
    const nums = pageWindow(97, 200).filter((p) => p !== null)
    const shown = [...container.querySelectorAll('.ds-pager__nav .ds-pager__btn')]
      .map((b) => b.textContent)
      .filter((t) => /^\d+$/.test(t ?? ''))
    expect(shown).toEqual(nums.map(String))
  })

  it('uses text-on-accent on the active page (readable on dark accent)', () => {
    const css = readFileSync(resolve(__dirname, 'Pagination.css'), 'utf8')
    const block = css.match(/\.ds-pager__btn\.is-active\s*\{([^}]+)\}/)
    expect(block, 'missing .ds-pager__btn.is-active rule').not.toBeNull()
    expect(block![1]).toMatch(/color:\s*var\(--ds-text-on-accent\)/)
    expect(block![1]).not.toMatch(/--ds-text-on-solid/)
  })
})

describe('pageWindow', () => {
  it('показывает все номера, пока их немного — многоточие вместо одного номера ничего не экономит', () => {
    expect(pageWindow(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('сворачивает длинную полосу: первая, последняя, текущая и соседи', () => {
    expect(pageWindow(50, 500)).toEqual([1, null, 49, 50, 51, null, 500])
  })

  it('у краёв не рисует многоточие вплотную к первой или последней', () => {
    expect(pageWindow(2, 500)).toEqual([1, 2, 3, null, 500])
    expect(pageWindow(499, 500)).toEqual([1, null, 498, 499, 500])
  })

  it('никогда не даёт повторов и не теряет края', () => {
    for (let count = 1; count <= 60; count++) {
      for (let page = 1; page <= count; page++) {
        const w = pageWindow(page, count)
        const nums = w.filter((x): x is number => x !== null)
        expect(new Set(nums).size, `повтор при page=${page}, count=${count}`).toBe(nums.length)
        expect(nums[0], `нет первой при page=${page}, count=${count}`).toBe(1)
        expect(nums[nums.length - 1], `нет последней при page=${page}, count=${count}`).toBe(count)
        expect(nums.includes(page), `нет текущей при page=${page}, count=${count}`).toBe(true)
        expect([...nums].sort((a, b) => a - b), `порядок сбит при page=${page}`).toEqual(nums)
      }
    }
  })
})

describe('Pagination: подвал таблицы', () => {
  const bar = (extra = {}) => render(
    <Pagination
      page={2} pageCount={18} variant="arrows"
      total={347} pageSize={20} pageSizeOptions={[8, 25, 50]}
      onChange={() => {}} onPageSizeChange={() => {}}
      {...extra}
    />,
  )

  it('метка диапазона считает от страницы и размера', () => {
    bar()
    expect(screen.getByText('21–40 из 347')).toBeInTheDocument()
  })

  it('последняя страница не выходит за общее число', () => {
    render(<Pagination page={18} pageCount={18} total={347} pageSize={20} />)
    expect(screen.getByText('341–347 из 347')).toBeInTheDocument()
  })

  it('пустая выдача не печатает «1–0»', () => {
    render(<Pagination page={1} pageCount={0} total={0} pageSize={20} />)
    expect(screen.getByText('0 из 0')).toBeInTheDocument()
  })

  it('formatRange задаёт всю строку целиком — язык меняет порядок слов, не только слова', () => {
    bar({ formatRange: (f: number, t: number, n: number) => `${f}–${t} of ${n}` })
    expect(screen.getByText('21–40 of 347')).toBeInTheDocument()
  })

  it('селектор размера отдаёт число, а не строку', async () => {
    const onSize = vi.fn()
    render(
      <Pagination page={1} pageCount={5} total={100} pageSize={25}
        pageSizeOptions={[8, 25, 50]} onPageSizeChange={onSize} />,
    )
    await userEvent.selectOptions(screen.getByRole('combobox'), '50')
    expect(onSize).toHaveBeenCalledWith(50)
  })

  it('селектор назван подписью, а не остаётся безымянным', () => {
    bar()
    expect(screen.getByRole('combobox', { name: 'На странице' })).toBeInTheDocument()
  })

  it('стрелки сохраняют доступное имя, хотя показывают глиф', () => {
    bar()
    expect(screen.getByRole('button', { name: 'Назад' })).toHaveTextContent('‹')
    expect(screen.getByRole('button', { name: 'Вперёд' })).toHaveTextContent('›')
  })

  it('в режиме стрелок номеров нет — иначе подвал не стал бы компактнее', () => {
    bar()
    expect(screen.queryByRole('button', { name: '2' })).not.toBeInTheDocument()
  })

  it('многоточие не кнопка: нажимать не на что, а с клавиатуры это была бы остановка в никуда', () => {
    render(<Pagination page={50} pageCount={500} onChange={() => {}} />)
    expect(screen.getAllByText('…').length).toBe(2)
    expect(screen.queryByRole('button', { name: '…' })).not.toBeInTheDocument()
  })
})

describe('Pagination: прежняя форма не тронута', () => {
  it('без total и без вариантов размера полосой не становится', () => {
    const { container } = render(<Pagination page={2} pageCount={5} onChange={() => {}} />)
    expect(container.querySelector('.ds-pager--bar')).toBeNull()
    expect(container.querySelector('.ds-pager__range')).toBeNull()
    expect(container.querySelector('.ds-pager__size')).toBeNull()
  })

  it('кнопки остаются текстовыми, а не глифами', () => {
    // Утверждение про ВИДИМУЮ надпись, а не про textContent кнопки: с
    // DS-149 знак лежит в разметке рядом со словом, и `toHaveTextContent`
    // прошёл бы на подстроке, даже если бы слово убрали совсем. Спрашивается
    // поэтому элемент слова — его и прячет компактный вид.
    const { container } = render(<Pagination page={2} pageCount={5} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument()
    const words = [...container.querySelectorAll('.ds-pager__word')].map((w) => w.textContent)
    expect(words).toEqual(['Назад', 'Вперёд'])
  })

  it('метки нет, если дали total без pageSize: посчитать диапазон не из чего', () => {
    const { container } = render(<Pagination page={1} pageCount={5} total={100} />)
    expect(container.querySelector('.ds-pager__range')).toBeNull()
  })
})

/**
 * Компактный вид узкой полосы (DS-149).
 *
 * jsdom про ширину не знает ничего и `@container` не вычисляет — поэтому здесь
 * проверяется ровно то, на что порог опирается: КОНТРАКТ РАЗМЕТКИ и способ
 * скрытия. Сработал ли порог на нужной ширине, доказывает `make measure` —
 * случай «Pagination: полоса подвала переживает длину текста и приходит к
 * компактному виду на узком», в браузере, на пяти шкалах и двух наборах текста.
 * Разделено так намеренно: тест, объявивший себя проверкой порога и не умеющий
 * его вычислить, был бы зелёным ни о чём.
 */
describe('Pagination: то, на чём держится компактный вид', () => {
  const css = () => readFileSync(resolve(__dirname, 'Pagination.css'), 'utf8')

  it('номер помечен --page, а стрелка нет: компактный вид убирает ровно номера', () => {
    const { container } = render(<Pagination page={97} pageCount={200} onChange={() => {}} />)
    const nums = [...container.querySelectorAll('.ds-pager__btn--page')].map((b) => b.textContent)
    expect(nums).toEqual(pageWindow(97, 200).filter((p) => p !== null).map(String))
    // Стрелки — кнопки того же блока, и если бы модификатор попал и на них,
    // компактный вид спрятал бы управление целиком.
    const steps = [...container.querySelectorAll('.ds-pager__nav > .ds-pager__btn')]
      .filter((b) => !b.classList.contains('ds-pager__btn--page'))
    expect(steps).toHaveLength(2)
  })

  it('указатель позиции есть у pages и его нет у arrows', () => {
    const { container, rerender } = render(<Pagination page={3} pageCount={18} />)
    expect(container.querySelector('.ds-pager__pos')).toHaveTextContent('Стр. 3 из 18')
    rerender(<Pagination page={3} pageCount={18} variant="arrows" />)
    // У явных стрелок компактного вида нет вовсе — просили эту форму сами.
    expect(container.querySelector('.ds-pager__pos')).toBeNull()
  })

  it('модификатор --pages стоит только у pages: правила порога не красят явные стрелки', () => {
    const { container, rerender } = render(<Pagination page={3} pageCount={18} total={90} pageSize={5} />)
    expect(container.querySelector('.ds-pager')).toHaveClass('ds-pager--pages')
    rerender(<Pagination page={3} pageCount={18} total={90} pageSize={5} variant="arrows" />)
    expect(container.querySelector('.ds-pager')).not.toHaveClass('ds-pager--pages')
  })

  it('стрелка несёт и слово, и знак, а имя ей даёт слово', () => {
    render(<Pagination page={3} pageCount={18} />)
    const prev = screen.getByRole('button', { name: 'Назад' })
    expect(prev.querySelector('.ds-pager__word')).toHaveTextContent('Назад')
    expect(prev.querySelector('.ds-pager__arrow')).toHaveTextContent('‹')
    // Знак спрятан от диктора, иначе имя кнопки в широкой полосе стало бы
    // «Назад ‹» — знак там и так виден глазами, читать его вслух незачем.
    expect(prev.querySelector('.ds-pager__arrow')).toHaveAttribute('aria-hidden', 'true')
  })

  it('номера сняты display: none, а не visibility/opacity', () => {
    // Решение DS-149, и оно про ШИРИНУ, а не только про таб-стопы:
    // `visibility` и `opacity` оставляют коробку в потоке, ряд остаётся той же
    // ширины — то есть компактный вид не делает ровно того, ради чего заведён.
    const block = css().match(/@container \(max-width: 29em\)\s*\{([\s\S]*)\n\}/)
    expect(block, 'блок компактного вида не найден: порог переписали мимо теста').not.toBeNull()
    const hide = block![1].match(/--page,[\s\S]*?\.ds-pager__jump \{([^}]+)\}/)
    expect(hide, 'правило, снимающее номера, не найдено').not.toBeNull()
    expect(hide![1]).toMatch(/display:\s*none/)
    expect(hide![1]).not.toMatch(/visibility|opacity/)
  })

  it('порог компактного вида НИЖЕ порога складывания', () => {
    // Второй порог, а не замена первому. Числа читаются из самого CSS: вписанные
    // сюда, они разошлись бы с ним молча.
    const thresholds = [...css().matchAll(/@container \(max-width: ([\d.]+)em\)/g)]
      .map((m) => Number(m[1]))
    expect(thresholds, `порогов в файле ${thresholds.length}, ожидалось два`).toHaveLength(2)
    const [fold, compact] = [Math.max(...thresholds), Math.min(...thresholds)]
    // 59em с DS-282 (было 60em при базе `--ds-fs-base` 13, DS-375
    // подняла её до 14 — порог мерит НАБРАННЫЙ ТЕКСТ и пересчитан замером, а
    // не переведён по формуле 14/13): порог считает КОЛОНКУ ряда, а не ширину
    // полосы, и прежние 34em он поглощает — ниже 34em полоса складывается тем
    // более. Сколько именно, доказывает `make measure`; здесь держится только
    // то, что порогов ДВА и компактный ниже складывания.
    expect(fold).toBe(59)
    expect(compact, 'компактный порог догнал порог складывания — вторым он быть перестал')
      .toBeLessThan(fold)
  })
})

/**
 * Указатель позиции назван СЛОВОМ (DS-283).
 *
 * Приёмка DS-149 нашла глазами: в компактном виде на кадре 360 одна под
 * другой встают две строки одного вида «N из M» — диапазон записей
 * («41–60 из 347») и указатель страницы («3 из 18»). Один оборот, один стиль,
 * соседние строки, а величины РАЗНОГО РОДА: записи и страницы. Различало их
 * только положение указателя между стрелками, а на шкале 1.5 стрелки
 * разъезжаются к краям на 235px — и две строки читаются одним счётчиком.
 *
 * Различаем словом, а не цветом и не начертанием: цвет не бывает единственным
 * носителем, а оттенок серого рядом с серым не сказал бы вовсе ничего.
 * Сокращение, а не «Страница», — чтобы указатель не вырос на шкале 1.5, где
 * компактному виду и так тесно.
 *
 * Проверяется ПАРОЙ (docs/writing-checks.md, п.6): утверждение «указатель
 * начинается со „Стр.“», взятое в одиночку, переживёт день, когда то же слово
 * припишут и диапазону, — то есть переживёт возврат ровно того дефекта, ради
 * которого написано. Схлопнувшиеся состояния проходят порознь.
 */
describe('Pagination: указатель страниц и диапазон записей различимы словом', () => {
  const firstWord = (s: string) => s.trim().split(/\s+/)[0]

  it('указатель компактного вида начинается со «Стр.»', () => {
    const { container } = render(<Pagination page={3} pageCount={18} />)
    // Сравнение с `textContent` целиком, а не `toHaveTextContent` со строкой:
    // та ищет ПОДСТРОКУ и «3 из 18» нашла бы и в «Стр. 3 из 18», то есть
    // молчала бы ровно о приписке, ради которой написана.
    expect(container.querySelector('.ds-pager__pos')!.textContent).toBe('Стр. 3 из 18')
  })

  it('диапазон записей остался без приписки, и первые слова двух фраз разные', () => {
    const pos = DS_TEXT_RU['pagination.position'](3, 18)
    const range = DS_TEXT_RU['pagination.range'](41, 60, 347)
    expect(pos).toBe('Стр. 3 из 18')
    expect(range).toBe('41–60 из 347')
    // Диапазон начинается с ЧИСЕЛ: приписки у него не завелось, и оборот «из»
    // у обоих остался на месте — расходятся они началом, а не оборотом.
    expect(firstWord(range)).toBe('41–60')
    expect(firstWord(pos)).toBe('Стр.')
    expect(firstWord(pos), 'два счётчика снова начинаются одинаково')
      .not.toBe(firstWord(range))
  })
})
