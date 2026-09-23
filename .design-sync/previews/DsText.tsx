import { DsText, Pagination, Calendar } from '@santarinto/jig'
import type { DsTextOverrides } from '@santarinto/jig'

// `DsText` ничего не рисует сам: это провайдер текста, который компоненты
// произносят от себя (подписи, «Сегодня», диапазон «1–20 из 347»), и локали
// дат и чисел. Без провайдера всё по-русски и в `ru-RU` — оборачивать нужно
// только чтобы поменять слово или язык.

const Screen = () => (
  <div style={{ display: 'grid', gap: 16, width: 720 }}>
    <Calendar year={2026} month={8} selectedId="2026-09-02"
      onSelect={() => {}} onNavigate={() => {}} onToday={() => {}} />
    <Pagination page={1} pageCount={18} variant="arrows" total={347} pageSize={20}
      pageSizeOptions={[20, 50, 100]} onChange={() => {}} onPageSizeChange={() => {}} />
  </div>
)

/** Без провайдера: русский словарь и `ru-RU` — умолчание, а не пустота. */
export const Default = () => <Screen />

// Ссылка стабильная — модульная константа: объект, созданный на каждый
// рендер, перерисует всех потребителей контекста.
const EN: DsTextOverrides = {
  'calendar.today': 'Today',
  'pagination.pageSizeLabel': 'Rows per page',
  'pagination.range': (from, to, total) => `${from}–${to} of ${total}`,
}

/** Язык подписи и язык даты едут вместе: `value` и `locale` на одном провайдере. */
export const English = () => (
  <DsText value={EN} locale="en-US">
    <Screen />
  </DsText>
)
