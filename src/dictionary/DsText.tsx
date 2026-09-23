import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { DS_TEXT_RU } from './text.js'
import type { DsTextDict, DsTextOverrides } from './text.js'

/**
 * Умолчание контекста — сам русский словарь, а не `null` и не пустой объект.
 * Отсюда главное свойство шва: БЕЗ провайдера всё работает ровно как до
 * DS-139, и `useDsText` не обязан проверять, обёрнут ли он.
 */
const TextContext = createContext<DsTextDict>(DS_TEXT_RU)

/**
 * Локаль умолчания — `ru-RU`, а НЕ локаль браузера (DS-184).
 *
 * У системы уже есть языковое умолчание — русский словарь; второе умолчание из
 * другого источника вернуло бы ровно тот раскол, который эта задача чинит:
 * русские подписи рядом с датами на языке браузера. «09/02/2026» в русском
 * интерфейсе — не «непривычно», а ДРУГАЯ ДАТА для читателя, и ошибка эта
 * молчаливая и правдоподобная.
 */
export const DS_LOCALE_DEFAULT = 'ru-RU'

const LocaleContext = createContext<string>(DS_LOCALE_DEFAULT)

export interface DsTextProps {
  /**
   * Переопределения поверх русского умолчания. Незаданный ключ остаётся
   * русским — не пустеет и не бросает.
   *
   * Ссылка должна быть стабильной (модульная константа или `useMemo`): объект,
   * созданный заново на каждый рендер, перерисует ВСЕХ потребителей контекста,
   * включая обёрнутые в `React.memo` поддеревья — контекст их не щадит.
   *
   * Необязателен с DS-184: `<DsText locale="en-US">` без словаря — это
   * законный вызов, а `value={{}}` ради смены одной локали был бы обрядом.
   */
  value?: DsTextOverrides
  /**
   * BCP 47 для дат, времени и чисел: `Intl.DateTimeFormat` и
   * `Intl.NumberFormat` во всех компонентах берут её отсюда.
   *
   * Ездит вместе со словарём НАМЕРЕННО, а не третьим пропом на каждом
   * компоненте: язык подписи и язык даты — один вопрос, и разъехаться они не
   * должны никогда. Разные источники для них — это гарантированный экран с
   * русскими подписями и английскими датами.
   *
   * Часовой пояс сюда НЕ входит: это отдельный вопрос, и `Heatmap` держит свой
   * `timeZone: 'UTC'` осознанно.
   */
  locale?: string
  children?: ReactNode
}

/**
 * Провайдер текста, который компоненты произносят от себя.
 *
 * Вложение мержит, а не заменяет: внутренний `<DsText>` виден поверх внешнего,
 * и раздел приложения может поправить одно слово, не переписывая словарь
 * целиком.
 */
export function DsText({ value, locale, children }: DsTextProps) {
  const outer = useContext(TextContext)
  const outerLocale = useContext(LocaleContext)
  const merged = useMemo(() => (value ? { ...outer, ...value } : outer), [outer, value])
  // Оба провайдера рендерятся ВСЕГДА, даже когда locale не задана. Условный
  // провайдер менял бы форму дерева при появлении пропа и размонтировал бы всё
  // поддерево — то есть смена локали на лету стоила бы потери состояния.
  return (
    <LocaleContext.Provider value={locale ?? outerLocale}>
      <TextContext.Provider value={merged}>{children}</TextContext.Provider>
    </LocaleContext.Provider>
  )
}

/** Полный словарь: `useDsText()['modal.close']`, `useDsText()['dataTable.selectRow'](id)`. */
export function useDsText(): DsTextDict {
  return useContext(TextContext)
}

/**
 * Локаль дат, времени и чисел. Без провайдера — `ru-RU`.
 *
 * Публичный: потребитель форматирует и сам (свой `formatDay`, своя колонка
 * `DataTable`), и брать локаль ему надо оттуда же, откуда её берём мы, — иначе
 * его собственная ячейка и наш заголовок разъедутся на том же экране.
 */
export function useDsLocale(): string {
  return useContext(LocaleContext)
}
