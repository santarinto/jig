/**
 * Доступное имя узла — то, что услышит клавиатурный пользователь.
 *
 * ЗАЧЕМ ОТДЕЛЬНАЯ ФУНКЦИЯ, А НЕ `textContent` (DS-211). Слой таб-стопов
 * существует ровно затем, чтобы показать, что услышит человек, обходя
 * интерфейс. Подписывая узлы сырым текстом разметки, он отвечал на ДРУГОЙ
 * вопрос — «что написано», — и разница между этими двумя вопросами и есть
 * предмет половины наших замечаний по доступности. Живой случай: у вкладки
 * `FormTabs/many` крестик убран из имени намеренно (`aria-hidden` там
 * несущий), а док подписывал стоп «Реализация ТК-00417×» — то есть прибор
 * показывал ровно то, чего мы добивались НЕ показывать. Скрыв свой успех, он
 * завтра скрыл бы и провал.
 *
 * ЭТО ПРИБЛИЖЕНИЕ, И ОБ ЭТОМ СКАЗАНО ВСЛУХ — в самой панели, а не только
 * здесь. Точное значение умеет axe-core (`accessibleTextVirtual`), и он в
 * верстаке уже есть, но приезжает ЛЕНИВО и только под включённый слой axe:
 * 568 КБ минифицированного файла. Слой таб-стопов включают отдельно и часто, и
 * платить за него мегабайтом чужого кода ради подписи в списке — цена не по
 * товару. Приближение, о цене которого сказано, честнее точного значения, о
 * цене которого умолчали.
 *
 * ЧЕГО ЭТОТ РАСЧЁТ НЕ ЗНАЕТ, и это перечислено, чтобы не выдавать за большее:
 *  - РАСКЛАДКИ. `display: none` из ЛИСТА (а не из атрибута `hidden`) сюда не
 *    доходит: узел, спрятанный стилями, получит имя, а axe про такой отвечает
 *    пустой строкой. Ровно те 8 расхождений, что остались в замере ниже, —
 *    скрытый `<input type="file">` у `FileDrop`. Это тот же перекос, что у
 *    самого обхода стопов в `tabstops.ts` (он такой узел вообще не должен
 *    показывать), и по той же причине — лишнее видно и объяснимо, пропущенное
 *    молчит;
 *  - `<slot>` и shadow DOM — в системе их нет;
 *  - родных имён браузера у `<input type="submit">` без `value` («Отправить»)
 *    и у `<summary>` без текста («Подробности»): они локальные и зашиты в
 *    браузер, повторять их значило бы завести второй словарь;
 *  - `aria-describedby`, `aria-valuetext` и значений полей: это ОПИСАНИЕ и
 *    значение, а не имя, и слой спрашивает про имя.
 *
 * СВЕРЕНО С axe-core НА ЖИВЫХ ФИКСТУРАХ, а не выведено из спецификации.
 * Обход всех 379 кейсов каталога в chromium: 2460 таб-стопов, из них 2452
 * отрисованных — и на всех 2452 `accessibleTextVirtual` и эта функция дают
 * ОДНУ строку. Оставшиеся 8 — скрытые поля `FileDrop` выше.
 *
 * Замер по дороге поправил три догадки, каждая из которых выглядела разумной и
 * была неверна; они записаны у своих правил (`PHRASING`, `ROLES_FROM_CONTENT`,
 * `nameOf`), потому что следующий, кто станет «упрощать», начнёт ровно с них.
 * Расхождение с axe — дефект здесь, а не разница во вкусах.
 */

/** Поддеревья, которых в имени нет. `aria-hidden` — несущий, не украшение. */
const EXCLUDED = '[aria-hidden="true"],[hidden]'

/** Пробелы разметки схлопываются один раз, наверху расчёта. */
const clean = (v: string): string => v.replace(/\s+/g, ' ').trim()

/**
 * Кто вообще именуется СОДЕРЖИМЫМ.
 *
 * `<pre tabindex="0" role="group">` — таб-стоп, но роль `group` имени из
 * текста НЕ даёт: диктор на нём молчит, пока нет `aria-label`. Слой,
 * подписывающий такой стоп первыми тридцатью символами кода, показывает имя,
 * которого нет, — то есть прячет настоящий дефект (область прокрутки без
 * подписи) за правдоподобной строкой. Замерено: `CodeBlock` без `label` даёт
 * 8 таких стопов, axe отвечает про них пустой строкой, и пустая строка здесь
 * — правильный ответ, а не потеря.
 *
 * СПИСОК РОЛЕЙ, А НЕ «есть атрибут role». Первая версия разрешала содержимое
 * любому узлу с ролью, и `role="group"` у `CodeBlock` прошёл насквозь — то
 * есть проверка выглядела сделанной, а число расхождений выросло с 32 до 106.
 * Роли, именуемые содержимым, перечислены в ARIA поимённо, и `group` в этот
 * перечень не входит.
 *
 * Ограничение действует ТОЛЬКО на верхний узел. Внутри обхода содержимого роли
 * не спрашиваются: `<span>` в кнопке текст даёт, иначе не осталось бы имени ни
 * у одной кнопки системы.
 */
const ROLES_FROM_CONTENT = new Set([
  'button', 'cell', 'checkbox', 'columnheader', 'gridcell', 'heading', 'link',
  'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'radio', 'row',
  'rowheader', 'switch', 'tab', 'tooltip', 'treeitem',
])

/** То же для элементов БЕЗ явной роли — по родной роли тега. */
const NATIVE_FROM_CONTENT = [
  'button', 'summary', 'a[href]', 'area[href]', 'label', 'legend',
  'option', 'output', 'th', 'td', 'caption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
].join(',')

/**
 * Явная роль ПЕРЕБИВАЕТ родную, а не складывается с ней: `<button
 * role="group">` для дерева доступности — группа, и текст внутри неё именем не
 * становится.
 */
function allowsNameFromContent(el: Element): boolean {
  const role = el.getAttribute('role')?.trim().split(/\s+/)[0]?.toLowerCase()
  if (role) return ROLES_FROM_CONTENT.has(role)
  return el.matches(NATIVE_FROM_CONTENT)
}

/**
 * Соседи-НЕ-СТРОЧНЫЕ разделяются пробелом, строчные — нет.
 *
 * Правило по ТЕГУ, а не по `getComputedStyle`. Это замер, и первая версия
 * ошиблась ровно здесь: она спрашивала раскладку, и плитка `Dashboard` —
 * `<span class="ds-tile__title">` с `display: block` из CSS — получала пробел,
 * которого axe не ставит. Верно наоборот: axe смотрит тип содержимого ТЕГА
 * (`phrasing` по HTML), поэтому `<span>` не разделяется никогда, даже
 * блочный, а `<div>` разделяется всегда. Замерено попарно на одном прогоне:
 * `Dashboard` — «Заказов за смену184» (три `<span>`), `LedgerList` —
 * «01.08.2026 ООО «Ромашка» …» (четыре `<div>`).
 *
 * Список снят ИЗ САМОГО axe (`getStandards().htmlElms`, тип `phrasing`), а не
 * выписан из спецификации по памяти: у axe в нём нет ни `img`, ни `input` —
 * оба по HTML строчные, — и выписанный «правильный» список разошёлся бы с
 * прибором, с которым мы сверяемся.
 */
const PHRASING = new Set([
  'a', 'abbr', 'area', 'audio', 'b', 'bdi', 'bdo', 'br', 'button', 'canvas',
  'cite', 'code', 'data', 'datalist', 'del', 'dfn', 'em', 'embed', 'i',
  'iframe', 'ins', 'kbd', 'label', 'link', 'map', 'mark', 'math', 'meter',
  'noscript', 'object', 'output', 'picture', 'progress', 'q', 'ruby', 's',
  'samp', 'script', 'select', 'slot', 'small', 'span', 'strong', 'sub', 'sup',
  'svg', 'template', 'textarea', 'time', 'u', 'var', 'video', 'wbr',
])

/**
 * Имя узла БЕЗ схлопывания пробелов — схлопывает один раз верхний вызов.
 *
 * Это не мелочь оформления. Схлопывая (и обрезая) имя каждого потомка, расчёт
 * терял разделяющий пробел из разметки: `<span> Все </span><span>128</span>`
 * давал «Все128». Обратная крайность — склеивать куски пробелом — расходится с
 * axe в другую сторону: он границе элемента пробела НЕ добавляет, «Средний
 * чек» и `<span>742,00 ₽</span>` дают «Средний чек742,00 ₽». Замерено на 2460
 * таб-стопах каталога, а не выведено из спецификации.
 *
 * `seen` режет цикл `aria-labelledby` → сюда же: пара узлов, ссылающихся друг
 * на друга, иначе повесила бы кадр.
 */
function nameOf(el: Element, seen: Set<Element>, top: boolean): string {
  if (seen.has(el)) return ''
  seen.add(el)

  // 1. aria-labelledby — сильнее всего, включая собственный aria-label.
  const refs = el.getAttribute('aria-labelledby')?.trim()
  if (refs) {
    const doc = el.ownerDocument
    const parts = refs
      .split(/\s+/)
      .map((rid) => doc.getElementById(rid))
      .filter((n): n is HTMLElement => n !== null)
      .map((n) => nameOf(n, seen, false))
      .filter(Boolean)
    if (parts.length) return parts.join(' ')
  }

  // 2. aria-label.
  const label = el.getAttribute('aria-label')?.trim()
  if (label) return label

  // 3. Родное имя элемента: alt, value кнопки, подпись поля.
  const native = nativeName(el, seen)
  if (native) return native

  // 4. Содержимое — БЕЗ исключённых поддеревьев. Ради этого шага всё и затеяно.
  // Проверяется СХЛОПНУТОЕ, а возвращается сырое: содержимое из одних пробелов
  // именем не является, и без этой проверки строка " " считалась бы найденным
  // именем — то есть `title` ниже не сработал бы никогда.
  if (!top || allowsNameFromContent(el)) {
    const text = contentText(el, seen)
    if (clean(text)) return text
  }

  // 5. `title` — последнее средство, как и в спецификации.
  return el.getAttribute('title')?.trim() ?? ''
}

function nativeName(el: Element, seen: Set<Element>): string {
  const tag = el.tagName.toLowerCase()
  if (tag === 'img' || tag === 'area') return el.getAttribute('alt')?.trim() ?? ''
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase()
    if (type === 'button' || type === 'submit' || type === 'reset') {
      return el.getAttribute('value')?.trim() ?? ''
    }
    if (type === 'image') return el.getAttribute('alt')?.trim() ?? ''
  }
  if (tag === 'input' || tag === 'select' || tag === 'textarea') {
    const lab = labelOf(el, seen)
    if (clean(lab)) return lab
    return el.getAttribute('placeholder')?.trim() ?? ''
  }
  return ''
}

/**
 * Подпись поля: `<label for>` и оборачивающий `<label>`. Оба, а не один:
 * в системе встречаются обе формы, и поле, названное внешней подписью,
 * неотличимо от безымянного ровно по этой ветке (см. `find-unlabeled-fields.pl`
 * и пункт 4.0.1 в CHANGELOG — grep их не различает, а расчёт обязан).
 */
function labelOf(el: Element, seen: Set<Element>): string {
  const id = el.getAttribute('id')
  if (id) {
    // `CSS.escape` — id приходит из чужих рук; без него `id="a b"` роняет
    // селектор исключением, а не даёт пустое имя.
    const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id
    const explicit = el.ownerDocument.querySelector(`label[for="${esc}"]`)
    if (explicit) {
      const t = contentText(explicit, seen)
      if (clean(t)) return t
    }
  }
  const wrap = el.closest('label')
  if (!wrap) return ''
  const t = contentText(wrap, seen)
  return clean(t) ? t : ''
}

/**
 * Текст поддерева. Строчные куски склеиваются БЕЗ разделителя, остальные — с
 * пробелом (см. `PHRASING`); пробелы из самой разметки при этом сохраняются,
 * их схлопнет верхний вызов. Оба соблазна — обрезать каждый кусок и склеивать
 * всё пробелом — промеряны и расходятся с axe в разные стороны.
 */
function contentText(el: Element, seen: Set<Element>): string {
  let out = ''
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 /* text */) {
      out += node.textContent ?? ''
      continue
    }
    if (node.nodeType !== 1 /* element */) continue
    const child = node as Element
    if (child.matches(EXCLUDED)) continue
    const part = nameOf(child, seen, false)
    out += PHRASING.has(child.tagName.toLowerCase()) ? part : ` ${part} `
  }
  return out
}

export function accessibleName(el: Element): string {
  return clean(nameOf(el, new Set(), true))
}
