import { Accordion, type AccordionItem } from '@santarinto/jig'

const measures: AccordionItem[] = [
  { id: 'a', title: 'Замер 24.07.2026', content: 'Вес 72.5 кг · талия 82 см · жир 18.4%.' },
  { id: 'b', title: 'Замер 17.07.2026', content: 'Вес 73.1 кг · талия 83 см · жир 18.9%.' },
  { id: 'c', title: 'Замер 10.07.2026', content: 'Вес 73.6 кг · талия 84 см · жир 19.2%.' },
]

const faq: AccordionItem[] = [
  { id: 'q1', title: 'Как часто делать замеры?', content: 'Раз в неделю, в одно и то же время суток.' },
  { id: 'q2', title: 'Что важнее — вес или объёмы?', content: 'Объёмы и состав тела информативнее веса.' },
]

export const Single = () => (
  <div style={{ width: 320 }}>
    <Accordion items={measures} defaultOpenIds={['a']} />
  </div>
)

export const Multiple = () => (
  <div style={{ width: 320 }}>
    <Accordion items={faq} multiple defaultOpenIds={['q1', 'q2']} />
  </div>
)
