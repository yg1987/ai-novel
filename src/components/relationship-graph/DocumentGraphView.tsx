import { NODE_TYPE_COLORS } from '../../lib/graph-layout'
import { groupGraphDocumentNodes } from '../../lib/graph-readable'
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
            const count = edges.filter((edge) => edge.source === node.id || edge.target === node.id).length
            return (
              <button key={node.id} className="graph-document-node" onClick={() => onNodeClick(node)}>
                <span className="graph-node-type-dot" style={{ background: NODE_TYPE_COLORS[node.type] }} />
                <span>{node.label}</span>
                <small>{count} 个关联</small>
              </button>
            )
          })}
        </section>
      ))}
    </div>
  )
}
