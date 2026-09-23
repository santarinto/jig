import { describe, it, expect, afterEach, beforeAll } from 'vitest'
import { runAxe } from './axe-layer.js'

beforeAll(() => {
  // axe спрашивает у canvas контекст (пробует посчитать контраст поверх
  // картинки), jsdom его не умеет и печатает стектрейс «Not implemented» на
  // КАЖДЫЙ прогон. Отвечаем `null` — ровно то же самое, что jsdom и хотел
  // сказать, только без трёх экранов мусора в `make check`.
  //
  // Проверку это не ослабляет: «контраст здесь не решается» утверждает тест
  // про `incomplete`, и он краснеет, если разряд потерять.
  HTMLCanvasElement.prototype.getContext = () => null
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('runAxe', () => {
  it('спрашивает только про поддерево корня — нарушение соседа не приезжает', async () => {
    // Вопрос №2 задачи: нарушения, принадлежащие разметке ВОКРУГ компонента
    // (обёртка кадра, соседняя копия в «Состояниях»), к компоненту отношения
    // не имеют. Отсекаются корнем прогона, а не фильтром результата.
    document.body.innerHTML = '<div id="outside"><img src="x.png"></div><div id="root"></div>'
    const root = document.getElementById('root')!
    root.innerHTML = '<button></button>'

    const report = await runAxe([root])
    const ids = report.violations.map((v) => v.id)

    expect(ids).toContain('button-name')
    expect(ids).not.toContain('image-alt')
  })

  it('нерешённое правило едет ОТДЕЛЬНЫМ разрядом, а не молчит вместе с нулём нарушений', async () => {
    // Вопрос №3 задачи. `color-contrast` здесь не решается — jsdom не считает
    // ни цвет, ни раскладку, — и в этом случае axe кладёт правило в
    // `incomplete`, а не в `violations`. Отчёт, знающий только про нарушения,
    // напечатал бы «0» и был бы формально прав: ровно та зелёная проверка,
    // которая ничего не проверяет.
    document.body.innerHTML = '<div id="root"><p>просто текст компонента</p></div>'

    const report = await runAxe([document.getElementById('root')!])

    expect(report.violations).toEqual([])
    expect(report.incomplete).toContain('color-contrast')
  })

  it('серьёзность кодируется ПОЗИЦИЕЙ: список идёт critical → minor, а не порядком axe', async () => {
    // Закон системы: величину цвет не кодирует никогда, а `impact` —
    // упорядоченная величина. Значит единственное место, где серьёзность
    // видна, — порядок в списке, и он обязан быть нашим. Свой порядок axe
    // даёт по порядку правил в аудите: на этой же разметке он выдаёт
    // critical, minor, serious, serious.
    document.body.innerHTML = `<div id="root">
      <h2></h2>
      <a href="#"></a>
      <button></button>
      <ul><div>не li</div></ul>
    </div>`

    const report = await runAxe([document.getElementById('root')!])

    expect(report.violations.map((v) => v.id)).toEqual([
      'button-name',
      'link-name',
      'list',
      'empty-heading',
    ])
  })

  it('внутри одной серьёзности порядок axe сохраняется — сортировка стабильная', async () => {
    // Два `serious` подряд: перестановка ровесников означала бы, что список
    // прыгает между прогонами на неизменной разметке.
    document.body.innerHTML = `<div id="root">
      <a href="#"></a>
      <ul><div>не li</div></ul>
    </div>`

    const report = await runAxe([document.getElementById('root')!])

    expect(report.violations.map((v) => v.id)).toEqual(['link-name', 'list'])
  })

  it('нарушение приезжает СО СВОИМИ УЗЛАМИ — оверлей рисуется по ним, а не по селектору', async () => {
    // Селектор пришлось бы искать обратно в документе, а на классах он нашёл
    // бы в лучшем случае первый подходящий узел — та же ловушка, из-за
    // которой прицел ходит по индексам (`dom-path.ts`). У правила бывает
    // несколько нарушивших узлов, и подсветить надо каждый.
    document.body.innerHTML = `<div id="root">
      <button id="a"></button>
      <button id="b"></button>
    </div>`
    const root = document.getElementById('root')!

    const report = await runAxe([root])
    const nameless = report.violations.find((v) => v.id === 'button-name')!

    expect(nameless.nodes.map((n) => n.el)).toEqual([
      document.getElementById('a'),
      document.getElementById('b'),
    ])
  })

  it('нарушение несёт человеческий текст правила, а не только его id', async () => {
    // `button-name` — имя для машины. В доке рядом с ним обязан стоять текст,
    // по которому понятно, что чинить, без похода в helpUrl.
    document.body.innerHTML = '<div id="root"><button></button></div>'

    const report = await runAxe([document.getElementById('root')!])

    expect(report.violations[0].help).toMatch(/\S/)
    expect(report.violations[0].help).not.toBe(report.violations[0].id)
  })

  it('ноль нарушений едет вместе с числом ПРИМЕНЁННЫХ правил, а не сам по себе', async () => {
    // Вопрос №3 задачи, вторая половина. «0 нарушений» без второго числа
    // читается как «доступность проверена».
    //
    // Считаются ПРИМЕНЁННЫЕ, а не все: неприменимых правил в axe при любой
    // разметке под сотню, и сумма с ними — почти константа, которая ни о чём
    // не говорит. Отсюда две опоры, а не порог: на пустом корне применённых
    // РОВНО НОЛЬ (с неприменимыми было бы 88), и число растёт вместе с
    // разметкой.
    document.body.innerHTML = '<div id="empty"></div>'
    const onEmpty = await runAxe([document.getElementById('empty')!])

    document.body.innerHTML = '<div id="root"><button>Отправить</button></div>'
    const onButton = await runAxe([document.getElementById('root')!])

    expect(onEmpty.applied).toBe(0)
    expect(onButton.violations).toEqual([])
    expect(onButton.applied).toBeGreaterThan(onEmpty.applied)
  })

  it('два прогона разом становятся в очередь, а не отказывают', async () => {
    // У axe один экземпляр на документ, и второй `run` до конца первого он
    // отклоняет («Axe is already running»). Своим `busy`-флагом это не
    // закрывается: прогон переживает размонтирование кадра, и следующий кадр
    // получил бы отказ вместо отчёта — молча, потому что отказ ловится
    // `catch`. Очередь живёт ЗДЕСЬ, у единственного места, которое зовёт axe.
    document.body.innerHTML = '<div id="root"><button></button></div>'
    const root = document.getElementById('root')!

    const both = await Promise.all([runAxe([root]), runAxe([root])])

    expect(both.map((r) => r.violations.map((v) => v.id))).toEqual([
      ['button-name'],
      ['button-name'],
    ])
  })

  it('нарушение в ПОРТАЛЕ приезжает — корней несколько, и второй не игнорируется', async () => {
    // DS-163. Оверлеи Modal, Drawer и тостера монтируются прямым
    // ребёнком `body` кадра, вне поддерева хоста. С одноузловым контекстом
    // слой отвечал «смотреть было нечего» — приглашение пройти мимо ровно
    // там, где претензии axe самые частые.
    document.body.innerHTML =
      '<div id="root"><p>превью</p></div><div id="overlay" role="dialog"><button></button></div>'

    const report = await runAxe([
      document.getElementById('root')!,
      document.getElementById('overlay')!,
    ])

    expect(report.violations.map((v) => v.id)).toContain('button-name')
  })

  it('НЕСКОЛЬКО корней не будят правила уровня страницы — контекст остаётся элементным', async () => {
    // Граница, ради которой корни остались списком элементов, а не документом
    // целиком. `document-title` и `html-has-lang` живут вне любого поддерева:
    // придя в отчёт, они стали бы претензией к оболочке кадра, которую человек
    // не пишет. Опора — на СЕБЕ: тот же документ, спрошенный целиком, их даёт.
    document.body.innerHTML =
      '<div id="root"><button></button></div><div id="overlay"><button></button></div>'
    document.title = ''
    document.documentElement.removeAttribute('lang')

    const byRoots = await runAxe([
      document.getElementById('root')!,
      document.getElementById('overlay')!,
    ])
    const byDocument = await runAxe([document.documentElement])

    expect(byDocument.violations.map((v) => v.id)).toContain('html-has-lang')
    expect(byRoots.violations.map((v) => v.id)).toEqual(['button-name'])
  })

  it('число ПРИМЕНЁННЫХ правил считает оба корня, а не только первый', async () => {
    // Иначе «применилось правил: N» на открытом окне отвечало бы про фон, а
    // читалось бы как про окно.
    document.body.innerHTML =
      '<div id="root"></div><div id="overlay"><a href="#">ссылка</a></div>'
    const host = document.getElementById('root')!
    const overlay = document.getElementById('overlay')!

    const alone = await runAxe([host])
    const both = await runAxe([host, overlay])

    expect(alone.applied).toBe(0)
    expect(both.applied).toBeGreaterThan(0)
  })

})
