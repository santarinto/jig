/** Урезанный flare-imports для демо EdgeBundling (~20 классов). */
export const FLARE_SAMPLE = [
  {
    id: 'flare.analytics.cluster.AgglomerativeCluster',
    links: ['flare.animate.Transitioner', 'flare.analytics.cluster.MergeEdge', 'flare.analytics.cluster.HierarchicalCluster'],
  },
  {
    id: 'flare.analytics.cluster.CommunityStructure',
    links: ['flare.analytics.cluster.HierarchicalCluster', 'flare.animate.Transitioner', 'flare.analytics.cluster.MergeEdge'],
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
  {
    id: 'flare.analytics.graph.ShortestPaths',
    links: ['flare.animate.Transitioner'],
  },
  {
    id: 'flare.analytics.graph.SpanningTree',
    links: ['flare.animate.Transitioner'],
  },
  {
    id: 'flare.animate.Transitioner',
    links: ['flare.animate.Transition', 'flare.animate.Easing', 'flare.animate.Parallel'],
  },
  { id: 'flare.animate.Transition', links: ['flare.animate.Tween'] },
  { id: 'flare.animate.Easing', links: ['flare.animate.Transition'] },
  { id: 'flare.animate.Parallel', links: ['flare.animate.Easing', 'flare.animate.Transition'] },
  { id: 'flare.animate.Tween', links: ['flare.animate.Transitioner'] },
  {
    id: 'flare.vis.data.Data',
    links: ['flare.vis.data.DataList', 'flare.vis.data.NodeSprite'],
  },
  { id: 'flare.vis.data.DataList', links: ['flare.vis.data.Data'] },
  { id: 'flare.vis.data.NodeSprite', links: ['flare.vis.data.Data'] },
  { id: 'flare.vis.operator.Operator', links: ['flare.vis.data.Data'] },
  {
    id: 'flare.vis.axis.CartesianAxes',
    links: ['flare.vis.operator.Operator', 'flare.vis.data.Data'],
  },
]
