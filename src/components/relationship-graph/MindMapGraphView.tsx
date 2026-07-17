import { buildGraphMindMap, type MindMapNode } from '../../lib/graph-readable'
import type { GraphNode, RelationshipLink } from '../../types/novel'

function MindMapBranch({ node, onClick }: { node: MindMapNode; onClick: (id: string) => void }) {
  return (
    <li className="graph-mindmap-node">
      <button onClick={() => onClick(node.id)}>{node.label}</button>
      {node.children.length > 0 && (
        <ul>{node.children.map((child) => <MindMapBranch key={child.id} node={child} onClick={onClick} />)}</ul>
      )}
    </li>
  )
}

export default function MindMapGraphView({ nodes, edges, onNodeIdClick }: { nodes: GraphNode[]; edges: RelationshipLink[]; onNodeIdClick: (id: string) => void }) {
  const roots = buildGraphMindMap(nodes, edges)
  return <div className="graph-mindmap-view"><ul>{roots.map((root) => <MindMapBranch key={root.id} node={root} onClick={onNodeIdClick} />)}</ul></div>
}
