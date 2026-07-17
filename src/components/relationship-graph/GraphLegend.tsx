import { NODE_TYPE_COLORS } from '../../lib/graph-layout'
import { TYPE_LABELS } from '../../lib/graph-readable'
import type { GraphNode, GraphNodeType } from '../../types/novel'

interface Props {
  hiddenTypes: ReadonlySet<GraphNodeType>
  allNodes: GraphNode[]
  visibleNodes: GraphNode[]
  onReset: () => void
  onToggleType: (type: GraphNodeType) => void
}

export default function GraphLegend({ hiddenTypes, allNodes, visibleNodes, onReset, onToggleType }: Props) {
  const countByType = (nodes: GraphNode[], type: GraphNodeType) => nodes.filter((node) => node.type === type).length

  return (
    <div className="graph-legend">
      <div className="graph-sidebar-title"><h3>图例</h3><button onClick={onReset}>重置筛选</button></div>
      {(Object.keys(TYPE_LABELS) as GraphNodeType[]).map((type) => {
        const hidden = hiddenTypes.has(type)
        const totalCount = countByType(allNodes, type)
        const visibleCount = countByType(visibleNodes, type)
        return (
          <button key={type} className={`graph-legend-item${hidden ? ' muted' : ''}`} onClick={() => onToggleType(type)} title={hidden ? '单击恢复显示' : '单击隐藏此类型'}>
            <span className="graph-legend-dot" style={{ background: NODE_TYPE_COLORS[type] }} />
            <span className="graph-legend-label">{TYPE_LABELS[type]}</span>
            <span className="graph-legend-count">{visibleCount}/{totalCount}</span>
            {hidden && <span className="graph-legend-state">已隐藏</span>}
          </button>
        )
      })}
    </div>
  )
}
