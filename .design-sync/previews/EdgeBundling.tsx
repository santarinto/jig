import { EdgeBundling } from '@santarinto/jig'

/**
 * Иерархическое связывание рёбер: дерево строится из точечных путей в `id`,
 * а `links` тянут дуги между листьями. Выборка нарочно плотная — на пяти
 * листьях приём не читается, видно просто несколько кривых.
 *
 * `innerPadding` — это поле под подписи: радиус кольца равен `size/2 -
 * innerPadding`, и остаток до края холста занимает текст. Скупое значение
 * срезает длинные имена вроде `AgglomerativeCluster`.
 */
const FLARE = [
  {
    id: 'flare.analytics.cluster.AgglomerativeCluster',
    links: ['flare.animate.Transitioner', 'flare.analytics.cluster.MergeEdge', 'flare.analytics.cluster.HierarchicalCluster'],
  },
  {
    id: 'flare.analytics.cluster.CommunityStructure',
    links: ['flare.analytics.cluster.HierarchicalCluster', 'flare.animate.Transitioner'],
  },
  {
    id: 'flare.analytics.cluster.HierarchicalCluster',
    links: ['flare.analytics.cluster.MergeEdge', 'flare.animate.Transitioner'],
  },
  { id: 'flare.analytics.cluster.MergeEdge', links: [] },
  {
    id: 'flare.analytics.graph.BetweennessCentrality',
    links: ['flare.animate.Transitioner', 'flare.analytics.graph.ShortestPaths'],
  },
  {
    id: 'flare.analytics.graph.LinkDistance',
    links: ['flare.animate.Transitioner', 'flare.analytics.graph.ShortestPaths'],
  },
  { id: 'flare.analytics.graph.ShortestPaths', links: ['flare.animate.Transitioner'] },
  { id: 'flare.analytics.graph.SpanningTree', links: ['flare.animate.Transitioner'] },
  {
    id: 'flare.animate.Transitioner',
    links: ['flare.animate.Transition', 'flare.animate.Easing', 'flare.animate.Parallel'],
  },
  { id: 'flare.animate.Transition', links: ['flare.animate.Tween'] },
  { id: 'flare.animate.Easing', links: ['flare.animate.Transition'] },
  { id: 'flare.animate.Parallel', links: ['flare.animate.Easing', 'flare.animate.Transition'] },
  { id: 'flare.animate.Tween', links: ['flare.animate.Transitioner'] },
  { id: 'flare.vis.data.Data', links: ['flare.vis.data.DataList', 'flare.vis.data.NodeSprite'] },
  { id: 'flare.vis.data.DataList', links: ['flare.vis.data.Data'] },
  { id: 'flare.vis.data.NodeSprite', links: ['flare.vis.data.Data'] },
  { id: 'flare.vis.operator.Operator', links: ['flare.vis.data.Data'] },
  {
    id: 'flare.vis.axis.CartesianAxes',
    links: ['flare.vis.operator.Operator', 'flare.vis.data.Data'],
  },
]

/** Граф зависимостей поверх иерархии пакетов: пучки идут через общего предка. */
export const Default = () => (
  <EdgeBundling
    items={FLARE}
    size={560}
    innerPadding={130}
    ariaLabel="Зависимости классов flare"
  />
)

/**
 * `tension` — сила стягивания к общему предку. Ближе к 1 пучки собираются
 * туже и структура пакетов читается яснее; ближе к 0 дуги распрямляются
 * в почти прямые хорды, и иерархия перестаёт быть видна.
 */
export const LooseBundle = () => (
  <EdgeBundling
    items={FLARE}
    size={560}
    innerPadding={130}
    tension={0.5}
    ariaLabel="Те же связи при слабом стягивании"
  />
)
