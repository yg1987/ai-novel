import { RELATION_LABELS, TYPE_LABELS } from '../../lib/graph-readable'
import type { GraphNode, RelationshipLink } from '../../types/novel'

export default function NodeDetail({ node, links, allNodes }: { node: GraphNode | null; links: RelationshipLink[]; allNodes: GraphNode[] }) {
  return (
    <div className="graph-node-detail">
      <h3>节点详情</h3>
      {node ? <>
        <h4>{node.label}</h4>
        <div className="graph-detail-row"><span>类型</span><span>{TYPE_LABELS[node.type]}</span></div>
        <div className="graph-detail-row"><span>分组</span><span>{node.group}</span></div>
        <div className="graph-detail-row"><span>首次出场</span><span>{node.firstAppearance ? `第${node.firstAppearance}章` : '未记录'}</span></div>
        <div className="graph-detail-row"><span>最近出场</span><span>{node.lastAppearance ? `第${node.lastAppearance}章` : '未记录'}</span></div>
        <div className="graph-detail-row"><span>关联数</span><span>{node.linkCount}</span></div>
        <div className="graph-detail-section"><h5>关联关系</h5>{links.length === 0 ? <p className="review-empty">暂无关联</p> : links.map((edge) => {
          const otherId = edge.source === node.id ? edge.target : edge.source
          const other = allNodes.find((candidate) => candidate.id === otherId)
          return <div key={`${edge.source}-${edge.target}`} className="graph-related-link"><span>{RELATION_LABELS[edge.type]}</span><span> → {other?.label ?? otherId}</span></div>
        })}</div>
      </> : <p className="review-empty">点击节点查看详情</p>}
    </div>
  )
}
