/**
 * Текст, который компоненты произносят ОТ СЕБЯ (DS-139).
 *
 * Граница словаря — не «слышно или видно», а «компонент сказал это сам, и
 * потребитель не может сказать иначе». Поэтому здесь и доступные имена
 * (`aria-label`, `ds-visually-hidden`), и видимый текст без пропа («меньше» у
 * легенды Heatmap, «в сети» у Avatar), и умолчания текстовых пропов.
 *
 * Здесь НЕ лежат:
 * - предупреждения `jig: …` — их читает разработчик в консоли, они несут
 *   коды задач и имена пропов, и перевод сделал бы их хуже;
 * - `ReactNode`-пропы, которые потребитель уже задал у себя.
 *
 * Ключ — `<имяКомпонента с маленькой буквы>.<что это>`. Правило механическое:
 * по ключу видно компонент, не заглядывая в таблицу соответствий. Исключение
 * одно — `chart.*`: имена видов графиков общие для трёх компонентов и живут в
 * общем `chartLabel`.
 *
 * Ключи ПЛОСКИЕ, с точкой внутри имени, а не вложенные объекты: слияние тогда
 * `{ ...RU, ...value }` — один уровень, без рекурсии и без сюрприза «задал
 * половину ветки, потерял вторую».
 *
 * Значение — строка ИЛИ функция. Подстановку (`Выбрать строку 42`) шаблоном в
 * строке не выразить без парсера, а функция даёт то же бесплатно: арность
 * проверяет TS, и потребитель волен согласовать число и падеж — чего
 * `{n} совпадений` не умеет никогда.
 */
export interface DsTextDict {
  'agentTranscript.tool': string
  'agentTranscript.thinking': string
  'agentTranscript.result': string
  'agentTranscript.pending': string
  'agentTranscript.streaming': string
  'agentTranscript.toLatest': string
  /** Имя ПРОКРУЧИВАЕМОЙ ОБЛАСТИ, а не компонента: его слышит тот, кто в неё вошёл. */
  'agentTranscript.region': string

  'alert.close': string

  'asOf.at': string
  'asOf.stale': string
  'asOf.days': (days: number) => string

  'avatar.online': string
  'avatar.busy': string
  'avatar.away': string
  'avatar.offline': string

  'breadcrumbs.nav': string

  'eventCalendar.prevDay': string
  'eventCalendar.nextDay': string
  'eventCalendar.prevWeek': string
  'eventCalendar.nextWeek': string
  'eventCalendar.today': string
  'eventCalendar.viewLabel': string
  'eventCalendar.viewDay': string
  'eventCalendar.viewWeek': string
  'eventCalendar.viewMonth': string
  'eventCalendar.slots': string
  'eventCalendar.allDay': string
  'eventCalendar.more': (count: number) => string
  'eventCalendar.locked': (title: string) => string
  'eventCalendar.grabbed': (title: string) => string
  'eventCalendar.at': (from: string, to: string, day: string) => string
  'eventCalendar.applied': (title: string) => string
  'eventCalendar.cancelled': (title: string) => string
  'calendar.year': string
  'calendar.month': string
  'calendar.prevMonth': string
  'calendar.nextMonth': string
  'calendar.today': string

  'codeBlock.copy': string
  'codeBlock.copied': string
  'codeBlock.copyFailed': string

  'combobox.placeholder': string
  'combobox.searchPlaceholder': string
  'combobox.empty': string
  'combobox.create': (query: string) => string

  'chart.bar': string
  'chart.line': string
  'chart.donut': string
  /**
   * Подпись пустого поля, когда легенда скрыла ВСЕ ряды (DS-185). Общая
   * на `LineChart` и `BarChart` — у обоих легенда-переключатель, и одно и то
   * же состояние не должно называться двумя словами.
   */
  'chart.allHidden': string

  /**
   * НАЗВАНИЕ ТОНА, зачитываемое перед сообщением (DS-157).
   *
   * Общее на `Toast`, `NotificationCenter` и `Alert` — второе исключение из
   * правила «ключ по имени компонента», рядом с `chart.*`, и по той же
   * причине: тон это один словарь системы, а не свойство одного компонента.
   * Развести его по трём префиксам значило бы завести три перевода слова
   * «Ошибка», которым запрещено расходиться.
   *
   * Слово СКРЫТО визуально, а не выброшено: значок закрывает зрячего
   * дальтоника и молчит для диктора (он `aria-hidden`), слово — наоборот.
   * Порознь каждый закрывает половину, вместе — обе.
   */
  'tone.info': string
  'tone.success': string
  'tone.warning': string
  'tone.error': string

  'codeInput.digit': (position: number) => string

  /** Кнопка свёрнутого хвоста `CommandBar` — и подпись, и доступное имя разом. */
  'commandBar.more': string

  'dataTable.selectColumn': string
  'dataTable.actionsColumn': string
  'dataTable.selectRow': (rowId: string) => string
  'dataTable.expandRow': (rowId: string) => string
  'dataTable.collapseRow': (rowId: string) => string

  'datePicker.clear': string
  'datePicker.open': string
  'datePicker.dialog': string
  'datePicker.placeholder': string

  'donutChart.total': string

  'drawer.close': string

  'dropdownMenu.label': string

  'edgeBundling.summary': (nodes: number, edges: number) => string

  'estimateMark.hint': string

  'fileDrop.remove': (fileName: string) => string
  /**
   * Приглашение зоны рисуется ДВУМЯ соседними узлами: `dropHint` обычным
   * текстом, `browse` — подчёркнутой ссылкой. Разрезать фразу по ключам плохо
   * (порядок слов в другом языке свой), но склеить нельзя: половина фразы
   * оформлена ссылкой, и одна строка не выразила бы этого без разметки внутри
   * значения. Оба ключа рисуются подряд, `browse` вторым.
   */
  'fileDrop.dropHint': string
  'fileDrop.browse': string
  'fileDrop.size': (bytes: number) => string

  /**
   * Имя самой полосы (DS-175). `role="tablist"` имени не требует, и axe
   * его отсутствие не показывает — поэтому оно и прожило до приёмки волны 4.
   * Скринридер на безымянном таблисте объявляет «вкладка, 2 из 5» и молчит о
   * том, ЧТО это за список; в интерфейсе, где рядом живут `Tabs` (виды одного
   * экрана) и `FormTabs` (что у пользователя открыто), различить их больше
   * нечем. Отсюда «формы», а не «вкладки»: имя обязано называть предмет, а не
   * повторять роль, которую скринридер и так произнесёт.
   */
  'formTabs.strip': string
  'formTabs.home': string
  'formTabs.close': (tabLabel: string) => string
  /** `title` вкладки, когда форма открыта и не записана (`FormTab.modified`). */
  'formTabs.modified': string

  'functionPanel.nav': string

  'globalSearch.placeholder': string

  'heatmap.less': string
  'heatmap.more': string
  'heatmap.grid': (from: string, to: string) => string
  /** Имя ПРОКРУЧИВАЕМОЙ ОБЛАСТИ, а не картинки: его слышит тот, кто в неё вошёл. */
  'heatmap.region': string

  'logViewer.matchNav': string
  'logViewer.prevMatch': string
  'logViewer.nextMatch': string
  'logViewer.matchCountHint': string
  'logViewer.expandRow': string
  'logViewer.collapseRow': string
  'logViewer.toLatest': string
  /** Имя ПРОКРУЧИВАЕМОЙ ОБЛАСТИ, а не компонента: его слышит тот, кто в неё вошёл. */
  'logViewer.region': string

  'metricStrip.noData': string

  'modal.close': string

  'money.rateAt': string

  'notificationCenter.region': string
  'notificationCenter.dismiss': (title: string) => string

  'numberField.decrement': string
  'numberField.increment': string

  'pagination.nav': string
  'pagination.prev': string
  'pagination.next': string
  'pagination.pageSizeLabel': string
  'pagination.range': (from: number, to: number, total: number) => string
  /**
   * Указатель позиции компактной полосы — «Стр. 3 из 18» между стрелками
   * (DS-149, слово с DS-283).
   *
   * Считает СТРАНИЦЫ, а не записи, и поэтому не дублирует `pagination.range`,
   * хотя обе фразы имеют вид «X из Y». Разошлись они по предмету: диапазон
   * отвечает «какие записи видно», указатель — «на какой ты странице», и
   * управление рядом с ним двигает именно страницы. В компактном виде номеров
   * не остаётся вовсе, так что другого ответа на «где я» в ряду нет; а в полосе
   * с одним лишь `pageSizeOptions` (без `total` и `pageSize`) диапазона нет и
   * подавно.
   *
   * ПРЕДМЕТ НАЗВАН СЛОВОМ, и это не украшение. До DS-283 умолчание было
   * «3 из 18» — тот же оборот, тот же стиль, что у диапазона записей, и в
   * сложенной полосе обе строки встают одна под другой: «41–60 из 347» и
   * «3 из 18» читаются одним счётчиком. Различало их только положение
   * указателя между стрелками, а на шкале 1.5 стрелки разъезжаются к краям на
   * 235px и от этого признака не остаётся ничего. Цветом или начертанием
   * различать нечего: цвет не бывает единственным носителем, а оттенок серого
   * рядом с серым не сказал бы вовсе ничего.
   *
   * Сокращение, а не «Страница»: указатель живёт в самом тесном виде полосы, и
   * длинное слово выкупило бы различимость шириной там, где её нет. Перевод
   * обязан сохранить и краткость, и то, что первое слово РАСХОДИТСЯ с началом
   * `pagination.range` — иначе приписка ничего не различает.
   *
   * Одним пропом на всю фразу, как `pagination.range`, и по той же причине:
   * языки расходятся не только словами, но и порядком.
   */
  'pagination.position': (page: number, pageCount: number) => string

  'pivotTable.total': string
  'pivotTable.empty': string

  /**
   * Подпись landmark'а `<nav>`, а НЕ подписи пунктов: те приходят пропом
   * (`routes[].label`) и рисуются в `.ds-routebar__label`.
   *
   * Ключ назывался `routeBar.label` до приёмки DS-139 и был переименован
   * ДО выпуска, по двум доводам сразу. Соглашение: подпись навигационного
   * landmark'а у всех остальных зовётся `.nav` (`breadcrumbs.nav`,
   * `pagination.nav`, `functionPanel.nav`), и одно исключение из четырёх — это
   * не вариативность, а промах. Столкновение: `label` рядом с живым
   * `routes[].label` уводит потребителя, который ищет, как переименовать
   * разделы, ровно не туда — и уводит молча, потому что переопределение
   * сработает, просто не там, где он смотрит.
   */
  'routeBar.nav': string

  'searchBar.clear': string
  'searchBar.submit': string
  'searchBar.placeholder': string

  'skeleton.loading': string

  'split.resize': string

  'tabs.scrollStart': string
  'tabs.scrollEnd': string
  'tabs.more': string
  'tabs.closeTab': (tabLabel: string) => string

  'themeToggle.toLight': string
  'themeToggle.toDark': string

  'toast.close': string
}

/**
 * Что потребитель передаёт в `<DsText>`. Именно `Partial`, а не полный словарь:
 * второго языка живьём нет, задача — гигиена и правка формулировок, и требовать
 * все ключи ради одного «Закрыть» значило бы брать налог за каждый релиз, где я
 * добавил ключ.
 */
export type DsTextOverrides = Partial<DsTextDict>

/**
 * Русское склонение по числу: 1 узел, 2 узла, 5 узлов. Живёт здесь, а не в
 * компоненте, потому что правило склонения — часть РУССКОГО текста: у другого
 * языка оно своё, и потребитель, переопределяющий ключ, переопределяет и его.
 */
const plural = (n: number, one: string, few: string, many: string): string => {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

/**
 * Русское умолчание. Обязано оставаться работающим без единой строки настройки:
 * у большинства потребителей интерфейс русский, и задача про словарь не должна
 * быть у них заметна вовсе.
 */
export const DS_TEXT_RU: DsTextDict = {
  'agentTranscript.tool': 'Параметры',
  'agentTranscript.thinking': 'Размышления',
  'agentTranscript.result': 'Результат',
  'agentTranscript.pending': 'ждём результат',
  'agentTranscript.streaming': 'печатает',
  'agentTranscript.toLatest': 'К последним',
  'agentTranscript.region': 'Диалог агента',

  'alert.close': 'Закрыть',

  'asOf.at': 'на',
  'asOf.stale': 'устарело',
  'asOf.days': (days) => `${days} дн.`,

  'avatar.online': 'в сети',
  'avatar.busy': 'занят',
  'avatar.away': 'отошёл',
  'avatar.offline': 'не в сети',

  'breadcrumbs.nav': 'Хлебные крошки',

  'eventCalendar.prevDay': 'Предыдущий день',
  'eventCalendar.nextDay': 'Следующий день',
  'eventCalendar.prevWeek': 'Предыдущая неделя',
  'eventCalendar.nextWeek': 'Следующая неделя',
  'eventCalendar.today': 'Сегодня',
  'eventCalendar.viewLabel': 'Вид календаря',
  'eventCalendar.viewDay': 'День',
  'eventCalendar.viewWeek': 'Неделя',
  'eventCalendar.viewMonth': 'Месяц',
  'eventCalendar.slots': 'Сетка времени',
  'eventCalendar.allDay': 'весь день',
  // Функцией, а не шаблоном: «+1 ещё» и «+5 ещё» согласуются по-разному в
  // языках, где это важно, и потребитель волен сказать иначе.
  'eventCalendar.more': (count: number) => `+${count} ещё`,
  'eventCalendar.locked': (title: string) => `${title}: изменить нельзя`,
  'eventCalendar.grabbed': (title: string) =>
    `${title}: перенос. Стрелки двигают, Shift со стрелкой тянет конец, Enter применяет, Esc отменяет`,
  // Положение объявляется ЦЕЛИКОМ, а не дельтой: «на 30 минут позже» бесполезно
  // тому, кто потерял точку отсчёта, а он её теряет на третьем шаге.
  'eventCalendar.at': (from: string, to: string, day: string) => `${from}–${to}, ${day}`,
  'eventCalendar.applied': (title: string) => `${title}: перенос применён`,
  'eventCalendar.cancelled': (title: string) => `${title}: перенос отменён`,
  'calendar.year': 'Год',
  'calendar.month': 'Месяц',
  'calendar.prevMonth': 'Предыдущий месяц',
  'calendar.nextMonth': 'Следующий месяц',
  'calendar.today': 'Сегодня',

  'codeBlock.copy': 'Копировать',
  'codeBlock.copied': 'Скопировано',
  'codeBlock.copyFailed': 'Не удалось',

  'combobox.placeholder': 'Выберите…',
  'combobox.searchPlaceholder': 'Поиск…',
  'combobox.empty': 'Ничего не найдено',
  'combobox.create': (query) => `Создать «${query}»`,

  'chart.bar': 'Столбчатая диаграмма',
  'chart.line': 'График',
  'chart.donut': 'Круговая диаграмма',
  'chart.allHidden': 'Все ряды скрыты',

  // Двоеточие ВНУТРИ значения, а не в разметке: в другом языке разделитель
  // может быть другим (или его может не быть вовсе), и зашить его в JSX
  // значило бы отдать перевод наполовину.
  'tone.info': 'Сообщение:',
  'tone.success': 'Успешно:',
  'tone.warning': 'Предупреждение:',
  'tone.error': 'Ошибка:',

  'codeInput.digit': (position) => `Цифра ${position}`,

  'commandBar.more': 'Ещё',

  'dataTable.selectColumn': 'Выбор',
  'dataTable.actionsColumn': 'Действия',
  'dataTable.selectRow': (rowId) => `Выбрать строку ${rowId}`,
  'dataTable.expandRow': (rowId) => `Развернуть строку ${rowId}`,
  'dataTable.collapseRow': (rowId) => `Свернуть строку ${rowId}`,

  'datePicker.clear': 'Очистить',
  'datePicker.open': 'Открыть календарь',
  'datePicker.dialog': 'Выбор даты',
  'datePicker.placeholder': 'ДД.ММ.ГГГГ',

  'donutChart.total': 'Всего',

  'drawer.close': 'Закрыть',

  'dropdownMenu.label': 'Действия',

  'edgeBundling.summary': (nodes, edges) =>
    `Иерархическое связывание: ${nodes} ${plural(nodes, 'узел', 'узла', 'узлов')}, `
    + `${edges} ${plural(edges, 'связь', 'связи', 'связей')}`,

  'estimateMark.hint': 'оценочная величина',

  'fileDrop.remove': (fileName) => `Удалить ${fileName}`,
  'fileDrop.dropHint': 'Перетащите файлы сюда или',
  'fileDrop.browse': 'выберите',
  'fileDrop.size': (bytes) => {
    if (bytes < 1024) return `${bytes} Б`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
  },

  'formTabs.strip': 'Открытые формы',
  'formTabs.home': 'Начальная страница',
  'formTabs.close': (tabLabel) => `Закрыть ${tabLabel}`,
  'formTabs.modified': 'Не записано',

  'functionPanel.nav': 'Функции раздела',

  'globalSearch.placeholder': 'Поиск везде',

  'heatmap.less': 'меньше',
  'heatmap.more': 'больше',
  'heatmap.grid': (from, to) => `Активность с ${from} по ${to}`,
  'heatmap.region': 'Сетка активности',

  'logViewer.matchNav': 'Навигация по совпадениям',
  'logViewer.prevMatch': 'Предыдущее совпадение',
  'logViewer.nextMatch': 'Следующее совпадение',
  'logViewer.matchCountHint': 'Совпадений в загруженном логе',
  'logViewer.expandRow': 'Развернуть строку',
  'logViewer.collapseRow': 'Свернуть строку',
  'logViewer.toLatest': 'К последним',
  'logViewer.region': 'Журнал',

  'metricStrip.noData': 'данных нет',

  'modal.close': 'Закрыть',

  'money.rateAt': 'курс от',

  'notificationCenter.region': 'Центр оповещений',
  'notificationCenter.dismiss': (title) => `Скрыть ${title}`,

  'numberField.decrement': 'Уменьшить',
  'numberField.increment': 'Увеличить',

  'pagination.nav': 'Постраничная навигация',
  'pagination.prev': 'Назад',
  'pagination.next': 'Вперёд',
  'pagination.pageSizeLabel': 'На странице',
  'pagination.range': (from, to, total) => (total === 0 ? '0 из 0' : `${from}–${to} из ${total}`),
  'pagination.position': (page, pageCount) => `Стр. ${page} из ${pageCount}`,

  'pivotTable.total': 'Итого',
  'pivotTable.empty': 'Сводить нечего',

  'routeBar.nav': 'Разделы',

  'searchBar.clear': 'Очистить',
  'searchBar.submit': 'Найти',
  'searchBar.placeholder': 'Поиск (Ctrl+F)',

  'skeleton.loading': 'Загрузка',

  'split.resize': 'Изменить размер',

  'tabs.scrollStart': 'Прокрутить к началу',
  'tabs.scrollEnd': 'Прокрутить к концу',
  'tabs.more': 'Ещё вкладки',
  'tabs.closeTab': (tabLabel) => `Закрыть вкладку ${tabLabel}`,

  'themeToggle.toLight': 'Светлая тема',
  'themeToggle.toDark': 'Тёмная тема',

  'toast.close': 'Закрыть',
}
