/**
 * Вывод диалога агента. `kind: 'block'`.
 *
 * НА ВХОДЕ НОРМАЛИЗОВАННАЯ МОДЕЛЬ, а не провайдерский stream-json: разбор чужого
 * формата живёт у потребителя, система форматов агентов не знает. Ход бывает
 * трёх видов — `message` (реплика с текстом, размышлениями и вызовами
 * инструментов), `event` (карточка результата или системное сообщение с
 * метриками) и `raw` (моноширинные строки терминала).
 *
 * Что здесь нельзя увидеть поодиночке:
 *  - **`show.raw` выкидывает ходы ИЗ ОКНА, а `show.thinking`/`show.toolCalls` —
 *    только блоки внутри реплики.** Разница не косметическая: скрытое сырьё
 *    меняет длину списка и высоты, скрытый блок — нет. Случай `blocks`;
 *  - **транскрипт из одного сырья при `show.raw: false` выглядит ПУСТЫМ.**
 *    `turns` не пуст, ошибки нет, рисуется `emptyState`. Случай `empty`;
 *  - **`onTurnClick` меняет ОБЁРТКУ заголовка, а не его состав.** Заголовок
 *    становится кнопкой, а аватар, имя, бейдж роли и время остаются те же — до
 *    DS-186 бейдж в кнопочной ветке терялся, и цену за клик платил
 *    читатель. Случай `click`;
 *  - **`renderMarkdown` отменяет подсветку `query`.** Подсветка живёт в ветке
 *    plain-текста, и как только потребитель подключил свой рендер, она
 *    молча исчезает. Случай `markdown`;
 *  - **`roleLabels` — словарь потребителя, и без него в интерфейсе печатаются
 *    сырые токены** `assistant`, `user`, `system`, `tool`.
 *
 * Оконный рендер здесь тот же, что у `LogViewer` (`internal/useVirtualList.ts`),
 * и `getTurnId` обязателен по той же причине: индекс ломается при подгрузке
 * старых реплик вверх. Функцию надо держать СТАБИЛЬНОЙ — фильтр по всему
 * транскрипту мемоизирован в любом случае, но сборку ключей мемо удержит только
 * при неизменной ссылке; замер до правки — 3992 чтения `kind` на кадр
 * прокрутки при 2000 ходах, 25 после.
 */
import { useState, type ReactNode } from 'react'
import { defineFixture } from '../../internal/fixture.js'
import {
  AgentTranscript,
  type AgentTranscriptShow,
  type TranscriptRole,
  type TranscriptTurn,
} from './AgentTranscript.js'
import type { BadgeTone } from '../Badge/Badge.js'

const ROLE_LABELS: Partial<Record<TranscriptRole, string>> = {
  assistant: 'Агент',
  user: 'Оператор',
  system: 'Система',
  tool: 'Инструмент',
}

const ROLE_TONES: Partial<Record<TranscriptRole, BadgeTone>> = {
  assistant: 'accent',
  user: 'neutral',
  system: 'warning',
  tool: 'info',
}

const D1 = '2026-03-17'
const D2 = '2026-03-18'
const at = (day: string, hm: string) => `${day}T${hm}:00+03:00`

const READ_INPUT = `{
  "file_path": "src/components/Heatmap/Heatmap.tsx",
  "offset": 150,
  "limit": 120
}`

const BASH_INPUT = `{
  "command": "npm run typecheck",
  "description": "Проверка типов после правки порогов"
}`

const RUN: TranscriptTurn[] = [
  {
    kind: 'message', id: 't1', ts: at(D1, '09:12'), role: 'user',
    author: { name: 'Оператор', kind: 'human' },
    text: 'Порог у теплокарты включительный или нет? День с одной поездкой красится как день без поездок.',
  },
  {
    kind: 'message', id: 't2', ts: at(D1, '09:12'), role: 'assistant',
    author: { name: 'claude-opus-5', kind: 'agent' },
    thinking: 'Сначала смотрю heatLevel — там цикл по порогам. Если сравнение строгое, '
      + 'единица останется на нулевой ступени. Проверить надо не рендером, а таблицей границ.',
    text: 'Смотрю `heatLevel` и таблицу границ рядом с ним.',
    toolCalls: [
      {
        id: 'c1', name: 'Read', summary: 'src/internal/heatLevel.ts',
        input: READ_INPUT,
        result: { text: 'export function heatLevel(value: number, thresholds: number[]): number {\n  let n = 0\n  for (const t of thresholds) if (value >= t) n++\n  return Math.min(HEAT_LEVELS - 1, n)\n}' },
      },
    ],
  },
  {
    kind: 'message', id: 't3', ts: at(D1, '09:14'), role: 'assistant',
    author: { name: 'claude-opus-5', kind: 'agent' },
    // `##` и `**` здесь РАБОЧИЕ, а не оформление: случай `markdown` утверждает,
    // что дефолт печатает разметку буквами, и до волны 6 во всём наборе не было
    // ни одной решётки и ни одной звёздочки — то есть утверждение проверить было
    // не на чем. Слово «порог» тут не добавлено и не убрано: счётчик подсветок в
    // заметке (4 сверху, 0 снизу) посчитан по всему набору.
    text: '## Ответ\n\n'
      + 'Порог включительный: `value >= t`. Значение, равное порогу, уже принадлежит '
      + '**верхней ступени**, поэтому при `[1, 3, 6, 10]` день с одной поездкой — '
      + 'ступень 1, а не 0.',
    toolCalls: [
      {
        id: 'c2', name: 'Bash', summary: 'npm run typecheck',
        input: BASH_INPUT,
        result: { text: 'src/components/Heatmap/Heatmap.fixture.tsx(206,16): error TS6133: \'p\' is declared but its value is never read.', isError: true },
      },
    ],
  },
  {
    kind: 'raw', id: 't4', ts: at(D1, '09:15'),
    text: '$ npm run typecheck\n> tsc --noEmit\n\nFound 1 error in src/components/Heatmap/Heatmap.fixture.tsx:206',
  },
  {
    kind: 'message', id: 't5', ts: at(D2, '10:02'), role: 'assistant',
    author: { name: 'claude-opus-5', kind: 'agent' },
    text: 'Убрал неиспользуемый параметр, тайпчек чист.',
    toolCalls: [
      {
        id: 'c3', name: 'Edit', summary: 'Heatmap.fixture.tsx:206',
        input: '{\n  "old_string": "render: (p) => (",\n  "new_string": "render: () => ("\n}',
        result: { text: '', pending: true },
      },
    ],
  },
  {
    kind: 'event', id: 't6', ts: at(D2, '10:04'), variant: 'result',
    title: 'Прогон завершён', tone: 'success',
    metrics: [
      { id: 'turns', label: 'Ходов', value: '6' },
      { id: 'tools', label: 'Вызовов', value: '3' },
      { id: 'dur', label: 'Длительность', value: '52 мин' },
      { id: 'cost', label: 'Токенов', value: '184 200' },
    ],
    text: 'Тайпчек зелёный, гейты фикстур не запускались.',
  },
  {
    kind: 'message', id: 't7', ts: at(D2, '10:05'), role: 'assistant',
    author: { name: 'claude-opus-5', kind: 'agent' },
    text: 'Дальше пишу случай про включительный порог и считаю ячейки нулевой ступени',
    streaming: true,
  },
]

/** Только сырьё: `turns` не пуст, а при дефолтном `show` рисуется пустота. */
const RAW_ONLY: TranscriptTurn[] = Array.from({ length: 12 }, (_, i) => ({
  kind: 'raw' as const,
  id: `r${i}`,
  ts: at(D1, `09:${String(20 + i).padStart(2, '0')}`),
  text: `[${String(i).padStart(3, '0')}] npm warn deprecated inflight@1.0.6: This module is not supported`,
}))

const ALL_ON: AgentTranscriptShow = { thinking: true, toolCalls: true, raw: true }
const TEXT_ONLY: AgentTranscriptShow = { thinking: false, toolCalls: false, raw: false }

/** Стабильная ссылка: инлайновая стрелка промахивается мимо мемо каждый рендер. */
const turnId = (t: TranscriptTurn) => t.id

/**
 * Результат `onTurnClick`, видимый и СЧЁТНЫЙ (DS-341). С пустышкой кадр
 * от клика не менялся, и «срабатывает один раз» глазом не проверялся вовсе;
 * счётчик отличает «дважды» от «раз». Сбрасывать сменой случая ничего не надо:
 * стенд есть только у `click`, и уход с него снимает узел целиком.
 */
function Opened({ children }: { children: (open: (id: string) => void) => ReactNode }) {
  const [last, setLast] = useState({ id: '', n: 0 })
  return (
    <div>
      {children((id) => setLast((s) => ({ id, n: s.n + 1 })))}
      <div style={{ marginTop: '0.5rem', color: 'var(--ds-text-muted)', fontSize: 'var(--ds-fs-sm)' }}>
        {last.id ? `открыт: ${last.id}` : 'ничего не открыто'} · вызовов: {last.n}
      </div>
    </div>
  )
}

/** Потребительский рендер markdown в две строки — ровно то, чего в DS нет. */
const poorMansMarkdown = (md: string) => (
  <div style={{ whiteSpace: 'pre-wrap' }}>
    {md.split('\n').map((row, i) => (
      <p key={i} style={{ margin: '0 0 0.35rem', fontWeight: row.startsWith('## ') ? 600 : 400 }}>
        {row.replace(/^## /, '')}
      </p>
    ))}
  </div>
)

interface Props {
  turns: TranscriptTurn[]
  show?: AgentTranscriptShow
  query?: string
  groupByDay: boolean
  dense: boolean
  height: number | string
  roleLabels?: Partial<Record<TranscriptRole, string>>
}

export default defineFixture<Props>({
  name: 'AgentTranscript',
  group: 'Данные',
  kind: 'block',

  props: {
    turns: RUN,
    groupByDay: false,
    dense: false,
    height: 420,
    roleLabels: ROLE_LABELS,
  },

  controls: {
    groupByDay: { kind: 'bool', prop: true },
    dense: { kind: 'bool', prop: true },
    query: { kind: 'text', prop: true },
  },

  data: {
    'raw-only': { turns: RAW_ONLY },
    'all-on': { show: ALL_ON },
    'no-labels': { roleLabels: undefined },
  },

  cases: [
    {
      id: 'base',
      title: 'Прогон: реплики, вызовы, карточка результата',
      shows: ['[role="log"]'],
      note:
        'СЕМЬ ХОДОВ, НО В ОКНЕ ШЕСТЬ: `show.raw` по умолчанию `false`, и ход '
        + '`raw` не рисуется вовсе. Остальные пять — реплики, шестая — карточка '
        + 'результата с четырьмя метриками. Метрика тут та же `Metric`, что у '
        + '`MetricStrip`, без конвертации; колонок берётся `min(6, n)`, а при '
        + 'одной метрике их нет вовсе — одна строка. Замерено: ходов в окне 6, '
        + 'ячеек метрики 4, колонок 4, бейджей роли 5 — по одному на реплику.\n\n'
        + 'Область прокрутки объявлена `role="log"` с `aria-live="polite"` и '
        + '`aria-relevant="additions"`: скринридер читает ПРИБАВЛЕНИЕ, а не '
        + 'перечитывает весь диалог на каждое изменение. Последняя реплика '
        + 'помечена `streaming` — в имени заголовка появляется «печатает», и это '
        + 'не только курсор в углу.\n\n'
        + 'Роли подписаны словарём потребителя. Наберите набор `no-labels`: '
        + 'бейджи начнут печатать сырые `assistant` и `user` — это поведение по '
        + 'умолчанию, а не заглушка, потому что переводить их системе нечем.\n\n'
        + 'Кнопка «К последним» плавает и появляется, когда прокрутка ушла от '
        + 'низа. Прилипание к низу снимается ручной прокруткой вверх и '
        + 'возвращается этой кнопкой.',
    },
    {
      id: 'blocks',
      title: 'Скрыть блок и скрыть ход — разные вещи',
      props: { show: TEXT_ONLY },
      shows: ['[role="log"]'],
      note:
        'СВЕРХУ `{thinking: false, toolCalls: false, raw: false}`, СНИЗУ всё '
        + '`true`. Считайте карточки: сверху ходов ШЕСТЬ, снизу СЕМЬ — ход `raw` '
        + 'выпадает из окна целиком, потому что пустой ход дал бы строку нулевой '
        + 'высоты и сломал бы раскладку окна. `thinking` и `toolCalls` из окна не '
        + 'выпадают: реплика остаётся, у неё пропадают блоки, и высота меняется '
        + 'внутри той же карточки. Замерено: 6 и 7 карточек, терминальный ход '
        + 'ровно один и живёт только в нижней.\n\n'
        + 'НИЧЕГО НЕ УДАЛЕНО. `turns` в обоих случаях один и тот же массив из '
        + 'семи ходов; отличается только то, что нарисовано.\n\n'
        + '`show` — форма controlled: своих рычагов у компонента в v1 нет, '
        + 'глобальное «свернуть все размышления» это переключатель в тулбаре '
        + 'ПОТРЕБИТЕЛЯ, а локальное раскрытие блока живёт внутри. Поэтому '
        + '`onShowChange` объявлен, но компонентом не зовётся — он зарезервирован '
        + 'под встроенный тулбар.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <AgentTranscript
            turns={p.turns} getTurnId={turnId} height={260}
            roleLabels={ROLE_LABELS} roleTones={ROLE_TONES} show={TEXT_ONLY}
          />
          <AgentTranscript
            turns={p.turns} getTurnId={turnId} height={260}
            roleLabels={ROLE_LABELS} roleTones={ROLE_TONES} show={ALL_ON}
          />
        </div>
      ),
    },
    {
      id: 'tools',
      title: 'Четыре состояния вызова инструмента',
      props: { show: ALL_ON },
      shows: ['[aria-expanded="false"]'],
      note:
        'В ПРОГОНЕ ЧЕТЫРЕ ВЫЗОВА И ЧЕТЫРЕ СОСТОЯНИЯ РЕЗУЛЬТАТА: обычный (`Read`), '
        + 'ошибка (`Bash`, `isError` — своя рамка), ожидание (`Edit`, `pending` — '
        + 'спиннер с текстовым именем, а не только анимация) и «результата ещё '
        + 'нет» — вызов без поля `result` вовсе. Последнее отличается от '
        + '`pending` тем, что не обещает ничего: `pending` это «ждём», а '
        + 'отсутствие — «не знаем».\n\n'
        + 'КНОПКА РАСКРЫТИЯ ОТДЕЛЕНА ОТ ТЕЛА, и это не стиль, а требование: тело '
        + 'блока — `CodeBlock` со своей кнопкой копирования, и вложи мы её в '
        + 'кнопку раскрытия, получился бы интерактив внутри интерактива. Гейт '
        + '`no-nested-interactive` держит это отдельно от глаз.\n\n'
        + 'Раскрытие роняет измеренную высоту РЕПЛИКИ и пересобирает окно: '
        + 'проверьте, что соседние карточки не прыгают. Параметры и результат '
        + 'ограничены 240px и прокручиваются внутри себя — иначе один `Read` на '
        + 'тысячу строк занял бы весь транскрипт.',
      render: (p) => (
        <AgentTranscript
          turns={[
            ...p.turns,
            {
              kind: 'message', id: 't8', ts: at(D2, '10:06'), role: 'assistant',
              author: { name: 'claude-opus-5', kind: 'agent' },
              text: 'Запустил гейты фикстур.',
              toolCalls: [{
                id: 'c4', name: 'Bash', summary: 'npx vitest run src/__guards__/fixtures.test.ts',
                input: '{\n  "command": "npx vitest run src/__guards__/fixtures.test.ts"\n}',
              }],
            },
          ]}
          getTurnId={turnId}
          height={480}
          roleLabels={ROLE_LABELS}
          roleTones={ROLE_TONES}
          show={ALL_ON}
        />
      ),
    },
    {
      id: 'click',
      title: 'Клик по реплике меняет обёртку заголовка, а не его состав',
      shows: ['[role="log"]'],
      note:
        'СВЕРХУ БЕЗ `onTurnClick`, СНИЗУ С НИМ, данные те же. В обоих заголовках '
        + 'аватар, имя, БЕЙДЖ РОЛИ и время — в том же порядке. Меняется только '
        + 'обёртка: снизу заголовок стал кнопкой (прыжок к строке в сыром логе).\n\n'
        + 'ДО DS-186 БЫЛО НЕ ТАК. Замерено в chromium на этих же семи '
        + 'ходах: сверху 5 заголовков-`div` и 5 бейджей, снизу 5 кнопок и НОЛЬ '
        + 'бейджей. Ветки заголовка писались порознь, и в кнопочной `Badge` '
        + 'просто не было — роль пропадала из видимого заголовка у всех реплик '
        + 'разом, а `roleTones` переставал значить что-либо: красить нечего. '
        + 'Технической причины не было: `Badge` — `span`, вложить его в кнопку '
        + 'законно. Теперь содержимое собирается один раз, ветвится только '
        + 'обёртка, и разъехаться нечему.\n\n'
        + 'Обработчик висит на ЗАГОЛОВКЕ, а не на карточке, и это обосновано: '
        + 'внутри карточки живут кнопки раскрытия и копирования, а кнопка внутри '
        + 'кнопки — запрещённая разметка.\n\n'
        + 'Под нижним транскриптом — строка «открыт: <id> · вызовов: N» '
        + '(DS-341): клик по заголовку обязан дать РОВНО +1 и id своего хода.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <AgentTranscript
            turns={p.turns} getTurnId={turnId} height={240}
            roleLabels={ROLE_LABELS} roleTones={ROLE_TONES}
          />
          <Opened>
            {(open) => (
              <AgentTranscript
                turns={p.turns} getTurnId={turnId} height={240}
                roleLabels={ROLE_LABELS} roleTones={ROLE_TONES}
                onTurnClick={(t) => open(t.id)}
              />
            )}
          </Opened>
        </div>
      ),
    },
    {
      id: 'markdown',
      title: 'Свой рендер markdown отменяет подсветку',
      props: { query: 'порог' },
      shows: ['[role="log"]'],
      note:
        'ЗАПРОС ОДИН И ТОТ ЖЕ — «порог». СВЕРХУ дефолт: текст идёт '
        + 'plain-строкой, `pre-wrap`, и вхождения подсвечены. СНИЗУ подключён '
        + '`renderMarkdown` потребителя — подсветки НЕТ НИ ОДНОЙ. Замерено: '
        + 'подсвеченных вхождений 4 сверху и 0 снизу.\n\n'
        + 'Причина в одной ветке: подсветка живёт там же, где plain-текст, и '
        + 'подменяя рендер, потребитель забирает её вместе с ним. Ни ошибки, ни '
        + 'предупреждения при этом нет — просто поиск по транскрипту перестаёт '
        + 'что-либо показывать. Кто подключает свой markdown, обязан подсвечивать '
        + 'сам.\n\n'
        + 'Парсера markdown в системе нет намеренно: `Prose` ест уже готовый '
        + 'HTML, а тащить зависимость ради одного компонента несоразмерно. '
        + 'Дефолт — не «markdown сломан», а «текст как есть»; в верхней панели '
        + 'видно, что `**` и `##` печатаются буквами — они стоят в ответе про '
        + 'порог (ход `t3`). До приёмки волны 6 эта фраза держалась ни на чём: во '
        + 'всём наборе было НОЛЬ решёток и НОЛЬ звёздочек, и проверяющий на 900 '
        + 'честно записал расхождение — заметка обещала то, чего в кадре не '
        + 'было.\n\n'
        + 'Подсветка `raw`-ходов от этого не зависит: там свой `highlight` мимо '
        + '`renderText`. Включите набор `all-on` и убедитесь, что в терминальном '
        + 'ходе она осталась.',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <AgentTranscript
            turns={p.turns} getTurnId={turnId} height={240} query="порог"
            roleLabels={ROLE_LABELS} roleTones={ROLE_TONES}
          />
          <AgentTranscript
            turns={p.turns} getTurnId={turnId} height={240} query="порог"
            roleLabels={ROLE_LABELS} roleTones={ROLE_TONES}
            renderMarkdown={poorMansMarkdown}
          />
        </div>
      ),
    },
    {
      id: 'day',
      title: 'Разделитель дня живёт ВНУТРИ реплики',
      props: { groupByDay: true, show: ALL_ON },
      shows: ['[role="heading"][aria-level="3"]'],
      note:
        'ПРОГОН ИДЁТ ДВА ДНЯ: 17 и 18 марта. Разделителей ДВА — на первой реплике '
        + 'вообще и на первой реплике нового дня, — и оба нарисованы ВНУТРИ '
        + 'карточки, а не отдельной строкой окна.\n\n'
        + 'Это решение про виртуализацию, а не про вид. Отдельная строка означала '
        + 'бы элемент без своего `turn-id`: кэш высот сбился бы, а компенсация '
        + 'подгрузки сверху считала бы не то количество элементов. Инлайновый '
        + 'разделитель просто делает реплику выше — окно этого даже не замечает.\n\n'
        + 'Разделитель — `role="heading"` третьего уровня: в дереве доступности '
        + 'по дням можно прыгать, как по заголовкам.\n\n'
        + 'ФОРМАТ ДАТЫ БОЛЬШЕ НЕ ЛОВУШКА (DS-184). Разделители печатают '
        + '«17 марта 2026 г.» и «18 марта 2026 г.» — по-русски, хотя '
        + '`navigator.language` в chromium владельца равен `en-US`. До этой '
        + 'задачи здесь стояло «March 17, 2026»: `formatDay` по умолчанию звал '
        + '`Intl` БЕЗ ЛОКАЛИ, то есть брал её у браузера, внутри документа, '
        + 'объявленного `lang="ru"`. Теперь локаль приезжает из `<DsText '
        + 'locale>` вместе со словарём, умолчание — `ru-RU`, и тем же швом её '
        + 'берёт `Calendar`, где раньше она была прибита литералом. Потребителю, '
        + 'которому нужен свой ФОРМАТ (а не язык), `formatDay` по-прежнему '
        + 'доступен и перекрывает локаль.',
    },
    {
      id: 'empty',
      title: 'Двенадцать ходов, и пусто',
      props: { turns: RAW_ONLY },
      note:
        'В `turns` ДВЕНАДЦАТЬ ХОДОВ, все `raw`, `show.raw` по умолчанию `false` — '
        + 'и компонент рисует `emptyState`. Ни ошибки, ни следа: пустой прогон, '
        + 'прогон, отфильтрованный до нуля, и потерянные данные выглядят '
        + 'одинаково.\n\n'
        + 'Именно так это и приходит к потребителю: терминальный вывод — самый '
        + 'частый вид хода у обёрток командной строки, а спрятан он по умолчанию. '
        + 'Первый экран выглядит сломанным ровно в тот момент, когда всё '
        + 'работает.\n\n'
        + 'Лечится это не компонентом, а `emptyState`, который умеет говорить: '
        + 'здесь надпись прямо называет причину и рычаг. Пустая заглушка «Ничего '
        + 'нет» была бы хуже, чем ничего.\n\n'
        + 'Переключите `show.raw` в `true` набором `all-on` — двенадцать строк '
        + 'появятся из того же массива. Замерено: карточек ноль, панель держит '
        + 'заданные 220 пикселей и не схлопывается.',
      render: (p) => (
        <AgentTranscript
          turns={p.turns}
          getTurnId={turnId}
          height={220}
          roleLabels={ROLE_LABELS}
          emptyState={
            <span>
              Показывать нечего: все 12 ходов — терминальный вывод, а он скрыт
              (<code>show.raw: false</code>).
            </span>
          }
        />
      ),
    },
  ],

  render: (p) => (
    <AgentTranscript
      turns={p.turns}
      getTurnId={turnId}
      show={p.show}
      query={p.query}
      groupByDay={p.groupByDay}
      dense={p.dense}
      height={p.height}
      roleLabels={p.roleLabels}
      roleTones={ROLE_TONES}
      emptyState={<span>Прогон ещё не начинался.</span>}
    />
  ),
})
