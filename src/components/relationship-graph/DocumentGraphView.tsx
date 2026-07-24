import { NODE_TYPE_COLORS } from '../../lib/graph-layout'
import { groupGraphDocumentNodes, relationshipDirectionLabel, relationshipLabel, relationshipSourceLabel } from '../../lib/graph-readable'
import type { GraphNode, RelationshipLink } from '../../types/novel'

interface Props {
  nodes: GraphNode[]
  edges: RelationshipLink[]
  onNodeClick: (node: GraphNode) => void
}

export default function DocumentGraphView({ nodes, edges, onNodeClick }: Props) {
  return (
    <div className="graph-document-view">
      {groupGraphDocumentNodes(nodes).map((group) => (
        <section key={group.type} className="graph-document-group">
          <h4>{group.label}</h4>
          {group.nodes.map((node) => {
            const related = edges.filter((edge) => edge.source === node.id || edge.target === node.id)
            return (
              <button key={node.id} className="graph-document-node" onClick={() => onNodeClick(node)}>
                <span className="graph-node-type-dot" style={{ background: NODE_TYPE_COLORS[node.type] }} />
                <span className="graph-document-node-content">
                  <span className="graph-document-node-heading"><span>{node.label}</span><small>{related.length} 个关联</small></span>
                  {related.slice(0, 3).map((edge) => {
                    const otherId = edge.source === node.id ? edge.target : edge.source
                    const other = nodes.find((candidate) => candidate.id === otherId)
                    const sourceLabel = relationshipSourceLabel(edge)
                    return <small key={`${edge.kind}-${otherId}-${edge.recordId ?? ''}-${edge.periodId ?? ''}`}>{relationshipLabel(edge)} · {relationshipDirectionLabel(edge, node.id)} {other?.label ?? otherId}{sourceLabel ? ` · ${sourceLabel}` : ''}</small>
                  })}
                </span>
              </button>
            )
          })}
        </section>
      ))}
    </div>
  )
}
