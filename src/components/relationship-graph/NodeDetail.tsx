import { relationshipDirectionLabel, relationshipLabel, relationshipSourceLabel, TYPE_LABELS } from '../../lib/graph-readable'
import type { GraphNode, RelationshipLink } from '../../types/novel'
import Button from '../Button'

interface Props {
  node: GraphNode | null
  links: RelationshipLink[]
  allNodes: GraphNode[]
  onAddRelationship?: () => void
  onEditRelationship?: (recordId: string) => void
  onConfirmRelationship?: (edge: RelationshipLink, otherNodeId: string) => void
}

function chapterRangeLabel(edge: RelationshipLink): string | null {
  const start = edge.startChapter ? `${edge.startChapter.volume} / ${edge.startChapter.chapterId}` : null
  const end = edge.endChapter ? `${edge.endChapter.volume} / ${edge.endChapter.chapterId}` : null
  if (!start && !end) return null
  return `${start ?? '未注明'} - ${end ?? '至今'}`
}

export default function NodeDetail({ node, links, allNodes, onAddRelationship, onEditRelationship, onConfirmRelationship }: Props) {
  return (
    <div className="graph-node-detail">
      <h3>节点详情</h3>
      {node ? <>
        <div className="graph-sidebar-title"><h4>{node.label}</h4>{node.type === 'character' && onAddRelationship && <Button variant="secondary" size="xs" onClick={onAddRelationship}>+ 关系</Button>}</div>
        <div className="graph-detail-row"><span>类型</span><span>{TYPE_LABELS[node.type]}</span></div>
        <div className="graph-detail-row"><span>分组</span><span>{node.group}</span></div>
        <div className="graph-detail-row"><span>首次出场</span><span>{node.firstAppearance ? `第${node.firstAppearance}章` : '未记录'}</span></div>
        <div className="graph-detail-row"><span>最近出场</span><span>{node.lastAppearance ? `第${node.lastAppearance}章` : '未记录'}</span></div>
        <div className="graph-detail-row"><span>关联数</span><span>{node.linkCount}</span></div>
        <div className="graph-detail-section"><h5>关联关系</h5>{links.length === 0 ? <p className="review-empty">暂无关联</p> : links.map((edge) => {
          const otherId = edge.source === node.id ? edge.target : edge.source
          const other = allNodes.find((candidate) => candidate.id === otherId)
          const sourceLabel = relationshipSourceLabel(edge)
          const chapterRange = chapterRangeLabel(edge)
          return (
            <div className="graph-related-item" key={`${edge.kind ?? 'relationship'}-${edge.source}-${edge.target}-${edge.recordId ?? ''}-${edge.periodId ?? ''}`}>
              <div className="graph-related-link">
                <span className="graph-related-main">{relationshipLabel(edge)}{sourceLabel ? ` · ${sourceLabel}` : ''} · {relationshipDirectionLabel(edge, node.id)}</span>
                <span>{other?.label ?? otherId}</span>
                {(edge.kind === 'relationship' || edge.kind === 'appearance') && (
                  <div className="graph-related-link-actions">
                    {edge.sourceKind === 'manual' && edge.recordId && onEditRelationship && <Button variant="text" size="xs" onClick={() => onEditRelationship(edge.recordId!)}>编辑</Button>}
                    {edge.sourceKind !== 'manual' && onConfirmRelationship && <Button variant="text" size="xs" onClick={() => onConfirmRelationship(edge, otherId)}>确认</Button>}
                  </div>
                )}
              </div>
              {chapterRange && <div className="graph-related-meta">{chapterRange}</div>}
              {edge.description && <p className="graph-related-description">{edge.description}</p>}
              {edge.evidence && edge.evidence.length > 0 && <details><summary className="graph-detail-row">查看证据（{edge.evidence.length}）</summary><ul className="graph-evidence-list">{edge.evidence.map((item, index) => <li key={`${edge.source}-${edge.target}-${index}`}>{item}</li>)}</ul></details>}
            </div>
          )
        })}</div>
      </> : <p className="review-empty">点击节点查看详情</p>}
    </div>
  )
}
