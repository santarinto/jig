/**
 * Модальное окно. `kind: 'block'`.
 *
 * Единственная фикстура системы, где случай отличается от базового СТРУКТУРОЙ,
 * а не пропсами, — и ровно этот случай назван в `src/internal/fixture.ts`
 * причиной, по которой формат не может быть чисто декларативным. Здесь он
 * впервые используется по назначению: «закрыто» и «открыто» — это не значение
 * пропа в одном дереве, а разные деревья, потому что содержимое окна живёт в
 * портале, а не в потоке.
 *
 * Сцена окну не нужна, и это стоит знать заранее: `Fixture.frame` со своим
 * `scene: 'fixed-overlay'` снят из контракта (DS-91). Кадр — `<iframe>`,
 * `position: fixed` в нём кроет кадр, а не окно оболочки, и окно оказывается
 * ровно там, где ему положено, без единого поля в шапке.
 */
import { useState } from 'react'
import { defineFixture } from '../../internal/fixture.js'
import { Modal } from './Modal.js'
import { Button } from '../Button/Button.js'

interface Props {
  title: string
  body: string
  closeOnBackdrop: boolean
  closeOnEscape: boolean
  withFooter: boolean
}

/**
 * Окно управляемо: `open` + `onClose` — контракт компонента, и фикстура обязана
 * показывать его живым. Кнопка нужна не для красоты — без неё не видно, что
 * фокус возвращается на неё при закрытии.
 */
function Live({
  title,
  body,
  closeOnBackdrop,
  closeOnEscape,
  footer,
  startOpen = false,
}: {
  title: string
  body: string
  closeOnBackdrop: boolean
  closeOnEscape: boolean
  footer?: React.ReactNode
  startOpen?: boolean
}) {
  const [open, setOpen] = useState(startOpen)
  return (
    <div>
      <Button onClick={() => setOpen(true)}>Открыть окно</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        closeOnBackdrop={closeOnBackdrop}
        closeOnEscape={closeOnEscape}
        footer={footer}
      >
        <p style={{ margin: 0 }}>{body}</p>
      </Modal>
    </div>
  )
}

const FOOTER = (
  <>
    <Button variant="secondary">Отмена</Button>
    <Button variant="primary">Провести</Button>
  </>
)

export default defineFixture<Props>({
  name: 'Modal',
  group: 'Оверлеи',
  kind: 'block',

  props: {
    title: 'Проведение документа',
    body: 'Документ будет проведён и попадёт в отчётность за август.',
    closeOnBackdrop: true,
    closeOnEscape: true,
    withFooter: true,
  },

  controls: {
    title: { kind: 'text', prop: true },
    body: { kind: 'text', prop: 'children' },
    closeOnBackdrop: { kind: 'bool', prop: true },
    closeOnEscape: { kind: 'bool', prop: true },
    withFooter: { kind: 'bool', prop: false },
  },

  data: {
    long: {
      body:
        'Документ будет проведён и попадёт в отчётность за август. Отменить ' +
        'проведение можно до закрытия периода; после закрытия потребуется ' +
        'сторнирующий документ, а он меняет обороты обеих сторон расчётов.',
    },
    'no-title': { title: '' },
  },

  cases: [
    {
      id: 'base',
      title: 'Закрыто',
      note:
        'Дерево без портала: окна нет в DOM вовсе. Это состояние важно само по ' +
        'себе — закрытое окно не должно оставлять после себя ни узла, ни ' +
        'перехваченного фокуса, ни блокировки прокрутки.',
    },
    {
      id: 'open',
      title: 'Открыто',
      note:
        'Другое ДЕРЕВО, а не другое значение пропа: содержимое уезжает в портал ' +
        'на body. Именно этот случай назван в формате фикстур причиной, по ' +
        'которой у кейса есть собственный render. Проверьте здесь три вещи, ' +
        'которых не видно в закрытом состоянии: фокус внутри окна и не уходит ' +
        'из него по Tab, фон не прокручивается, Escape закрывает. ' +
        'За окном намеренно положена длинная страница: блокировка прокрутки ' +
        'проверяется колесом НАД подложкой, а проверить её можно только там, ' +
        'где фону есть куда прокручиваться. Пока за окном стояла одна кнопка, ' +
        'заметка обещала «фон не прокручивается», а случай этого не показывал ' +
        '— то же, что было у `Drawer/scroll` до приёмки волны 3.',
      // Открытость утверждается с DS-127: до появления поля `shows`
      // (DS-134) три случая этой фикстуры, весь смысл которых в открытом
      // окне, не проверял никто — `fixtures-render` одинаково зелен на
      // открытом окне и на закрытом.
      shows: ['[role="dialog"][aria-modal="true"]'],
      render: (p) => (
        <div>
          <Live
            title={p.title}
            body={p.body}
            closeOnBackdrop={p.closeOnBackdrop}
            closeOnEscape={p.closeOnEscape}
            footer={p.withFooter ? FOOTER : undefined}
            startOpen
          />
          <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
            {Array.from({ length: 16 }, (_, i) => (
              <p key={i} style={{ margin: 0, color: 'var(--ds-text-muted)' }}>
                Строка страницы под окном №{i + 1}. Прокрутите колесом над
                подложкой: страница обязана стоять.
              </p>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'sticky',
      title: 'Случайный клик не стирает форму',
      note:
        'Здесь closeOnBackdrop и closeOnEscape выключены: окно с наполовину ' +
        'заполненной формой не должно закрываться от промаха мимо. Разница с ' +
        'предыдущим случаем не видна глазом вовсе — она в том, ЧЕГО не ' +
        'происходит: щёлкните по подложке и нажмите Escape, окно обязано ' +
        'остаться. Утверждение парное с «Открыто», порознь оба окна одинаковы.',
      // В `props`, а не литералом в `render` (DS-164): литерал перекрывал
      // крутилки, и панель показывала их отмеченными при выключенном поведении.
      props: { closeOnBackdrop: false, closeOnEscape: false },
      shows: ['[role="dialog"][aria-modal="true"]'],
      render: (p) => (
        <Live
          title={p.title}
          body={p.body}
          closeOnBackdrop={p.closeOnBackdrop}
          closeOnEscape={p.closeOnEscape}
          footer={p.withFooter ? FOOTER : undefined}
          startOpen
        />
      ),
    },
    {
      id: 'no-footer',
      title: 'Без подвала',
      note:
        'Окно-сообщение: закрыть можно крестиком, подложкой и Escape. Пустой ' +
        'подвал не рисуется — полоса без кнопок читалась бы как «кнопки не ' +
        'приехали».',
      props: { withFooter: false },
      shows: ['[role="dialog"][aria-modal="true"]'],
      render: (p) => (
        <Live
          title={p.title}
          body={p.body}
          closeOnBackdrop={p.closeOnBackdrop}
          closeOnEscape={p.closeOnEscape}
          startOpen
        />
      ),
    },
  ],

  render: (p) => (
    <Live
      title={p.title}
      body={p.body}
      closeOnBackdrop={p.closeOnBackdrop}
      closeOnEscape={p.closeOnEscape}
      footer={p.withFooter ? FOOTER : undefined}
    />
  ),
})
