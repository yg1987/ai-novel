import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import { SigmaContainer, useRegisterEvents } from '@react-sigma/core'
import { listChapters } from '../api/tauri'
import { loadRelationshipGraph } from '../services/relationshipStore'
import {
  loadSnapshotRegenerationReport,
  regenerateSnapshots,
  type SnapshotRegenerationRecord,
  type SnapshotRegenerationProgress,
  type SnapshotRegenerationReport,
  type SnapshotRegenerationScope,
} from '../services/snapshotRegeneration'
import { applyGraphFilters } from '../lib/graph-filters'
import { GRAPH_MODE_LABELS, GRAPH_MODE_PRESETS, type GraphDisplayMode, type GraphLabelVisibility, type GraphMode } from '../lib/graph-mode'
import { COMMUNITY_COLORS, NODE_TYPE_COLORS, initialGraphPosition, nodeSize } from '../lib/graph-layout'
import { RELATION_LABELS, TYPE_LABELS, buildGraphDocument, buildGraphMindMap, groupGraphDocumentNodes, type MindMapNode } from '../lib/graph-readable'
import { parseGraphNodeId } from '../lib/graph-id'
import Modal from './Modal'
import Button from './Button'
import Pagination from './Pagination'
import { usePagination } from '../hooks/usePagination'
import type { ChapterMeta } from '../types/chapter'
import type { GraphNode, GraphNodeType, InsightItem, RelationshipGraph as RelationshipGraphData, RelationshipLink } from '../types/novel'

interface Props {
  projectId: string
  onNavigateToCharacter?: (name: string) => void
  onNavigateToChapter?: (chapterRef: string) => void
  onNavigateToForeshadow?: (id: string) => void
}

interface ContextMenuState { nodeId: string; x: number; y: number }

type SnapshotStatusFilter = 'attention' | 'failed' | 'stale' | 'success' | 'all'
type GraphSidebarTab = 'detail' | 'insights'

function nodeColor(node: GraphNode): string {
  if (node.community >= 0) return COMMUNITY_COLORS[node.community % COMMUNITY_COLORS.length] ?? NODE_TYPE_COLORS[node.type]
  return NODE_TYPE_COLORS[node.type]
}

function edgeColor(edge: RelationshipLink): string {
  if (edge.structural) return '#cbd5e1'
  const colors: Record<string, string> = { ally: '#2ecc71', rival: '#e67e22', family: '#1abc9c', mentor: '#f39c12', enemy: '#e74c3c', friend: '#3498db', love: '#e91e63', ambiguous: '#94a3b8' }
  return colors[edge.type] ?? '#94a3b8'
}

function graphDataKey(nodes: GraphNode[], edges: RelationshipLink[]): string {
  const nodeKey = nodes.map((node) => `${node.id}:${node.type}:${node.community}:${node.linkCount}:${node.label}`).sort().join('|')
  const edgeKey = edges.map((edge) => `${[edge.source, edge.target].sort().join('::')}:${edge.type}:${edge.weight}:${edge.structural ? 1 : 0}`).sort().join('|')
  return `${nodeKey}///${edgeKey}`
}

function createSigmaGraph(nodes: GraphNode[], edges: RelationshipLink[], positionCache: Map<string, { x: number; y: number }>): Graph {
  const graph = new Graph({ type: 'undirected', multi: false })
  const maxLinks = Math.max(0, ...nodes.map((node) => node.linkCount))
  nodes.forEach((node, index) => {
    const position = positionCache.get(node.id) ?? initialGraphPosition(node, index, nodes.length)
    graph.addNode(node.id, { ...node, graphNodeType: node.type, type: 'circle', x: position.x, y: position.y, size: nodeSize(node.linkCount, maxLinks), color: nodeColor(node), label: node.label })
  })
  edges.forEach((edge, index) => {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target) || edge.source === edge.target) return
    graph.addEdgeWithKey(`${edge.source}::${edge.target}::${index}`, edge.source, edge.target, { ...edge, relationType: edge.type, type: 'line', size: Math.max(1, Math.min(6, edge.weight)), color: edgeColor(edge), label: RELATION_LABELS[edge.type] })
  })
  try {
    forceAtlas2.assign(graph, { iterations: Math.min(120, Math.max(30, nodes.length * 2)), settings: { gravity: 1, scalingRatio: 8, slowDown: 2, barnesHutOptimize: nodes.length > 80 }, getEdgeWeight: 'weight' })
  } catch { /* keep golden-angle positions */ }
  graph.forEachNode((node, attributes) => {
    if (typeof attributes.x === 'number' && typeof attributes.y === 'number') {
      positionCache.set(node, { x: attributes.x, y: attributes.y })
    }
  })
  return graph
}

function GraphEvents({ onSelect, onContext }: { onSelect: (nodeId: string) => void; onContext: (menu: ContextMenuState | null) => void }) {
  const registerEvents = useRegisterEvents()
  useEffect(() => {
    registerEvents({
      clickNode: (event: any) => onSelect(event.node),
      rightClickNode: (event: any) => {
        event.event?.preventSigmaDefault?.()
        const original = event.event?.original ?? event.event
        original?.preventDefault?.()
        original?.stopPropagation?.()
        onContext({ nodeId: event.node, x: original?.clientX ?? 0, y: original?.clientY ?? 0 })
      },
      clickStage: () => onContext(null),
    } as any)
  }, [onContext, onSelect, registerEvents])
  return null
}

function GraphMiniMap({ graph, focusedNodeId }: { graph: Graph; focusedNodeId: string | null }) {
  const points = useMemo(() => {
    const next: { id: string; x: number; y: number; color: string }[] = []
    graph.forEachNode((id, attributes) => {
      if (typeof attributes.x === 'number' && typeof attributes.y === 'number') {
        next.push({ id, x: attributes.x, y: attributes.y, color: attributes.color ?? '#94a3b8' })
      }
    })
    return next
  }, [graph])
  if (points.length === 0) return null
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  const projectX = (x: number) => 8 + ((x - minX) / width) * 104
  const projectY = (y: number) => 8 + ((y - minY) / height) * 64
  return <svg className="graph-minimap" viewBox="0 0 120 80" aria-hidden="true">{points.map((point) => <circle key={point.id} cx={projectX(point.x)} cy={projectY(point.y)} r={point.id === focusedNodeId ? 3.5 : 2} fill={point.id === focusedNodeId ? '#111827' : point.color} opacity={point.id === focusedNodeId ? 1 : 0.75} />)}</svg>
}

function ForceGraphView({ nodes, edges, focusedNodeId, labelVisibility, onSelect, onContext }: { nodes: GraphNode[]; edges: RelationshipLink[]; focusedNodeId: string | null; labelVisibility: GraphLabelVisibility; onSelect: (nodeId: string) => void; onContext: (menu: ContextMenuState | null) => void }) {
  const positionCache = useRef(new Map<string, { x: number; y: number }>())
  const dataKey = useMemo(() => graphDataKey(nodes, edges), [nodes, edges])
  const sigmaGraph = useMemo(() => createSigmaGraph(nodes, edges, positionCache.current), [dataKey])
  const settings = useMemo(() => ({
    renderEdgeLabels: false,
    labelRenderedSizeThreshold: 12,
    allowInvalidContainer: true,
    nodeReducer: (node: string, data: any) => {
      const isFocused = node === focusedNodeId || edges.some((edge) => (edge.source === focusedNodeId && edge.target === node) || (edge.target === focusedNodeId && edge.source === node))
      if (focusedNodeId && !isFocused) return { ...data, color: '#d7dde5', label: '' }
      if (labelVisibility === 'minimal') return { ...data, label: '' }
      return data
    },
    edgeReducer: (_edge: string, data: any) => {
      if (!focusedNodeId) return data
      const keep = data.source === focusedNodeId || data.target === focusedNodeId
      return keep ? data : { ...data, hidden: true }
    },
  }), [edges, focusedNodeId, labelVisibility])
  return <div className="graph-sigma-container" onContextMenu={(event) => event.preventDefault()}><SigmaContainer graph={sigmaGraph} settings={settings as any} className="graph-sigma-canvas" style={{ width: '100%', height: '100%' }}><GraphEvents onSelect={onSelect} onContext={onContext} /></SigmaContainer><GraphMiniMap graph={sigmaGraph} focusedNodeId={focusedNodeId} /></div>
}

function DocumentGraphView({ nodes, edges, onNodeClick }: { nodes: GraphNode[]; edges: RelationshipLink[]; onNodeClick: (node: GraphNode) => void }) {
  return <div className="graph-document-view">{groupGraphDocumentNodes(nodes).map((group) => <section key={group.type} className="graph-document-group"><h4>{group.label}</h4>{group.nodes.map((node) => {
    const count = edges.filter((edge) => edge.source === node.id || edge.target === node.id).length
    return <button key={node.id} className="graph-document-node" onClick={() => onNodeClick(node)}><span className="graph-node-type-dot" style={{ background: NODE_TYPE_COLORS[node.type] }} /><span>{node.label}</span><small>{count} 个关联</small></button>
  })}</section>)}</div>
}

function MindMapBranch({ node, onClick }: { node: MindMapNode; onClick: (id: string) => void }) {
  return <li className="graph-mindmap-node"><button onClick={() => onClick(node.id)}>{node.label}</button>{node.children.length > 0 && <ul>{node.children.map((child) => <MindMapBranch key={child.id} node={child} onClick={onClick} />)}</ul>}</li>
}

function MindMapGraphView({ nodes, edges, onNodeIdClick }: { nodes: GraphNode[]; edges: RelationshipLink[]; onNodeIdClick: (id: string) => void }) {
  const roots = buildGraphMindMap(nodes, edges)
  return <div className="graph-mindmap-view"><ul>{roots.map((root) => <MindMapBranch key={root.id} node={root} onClick={onNodeIdClick} />)}</ul></div>
}

function NodeContextMenu({
  menu,
  node,
  filteredNodes,
  filteredEdges,
  hiddenNodeIds,
  onClose,
  onFocus,
  onHideNodes,
  onNavigateOrSelect,
  canNavigateCharacter,
  canNavigateChapter,
  canNavigateForeshadow,
}: {
  menu: ContextMenuState
  node: GraphNode
  filteredNodes: GraphNode[]
  filteredEdges: RelationshipLink[]
  hiddenNodeIds: ReadonlySet<string>
  onClose: () => void
  onFocus: (nodeId: string) => void
  onHideNodes: (nodeIds: ReadonlySet<string>) => void
  onNavigateOrSelect: (node: GraphNode) => void
  canNavigateCharacter: boolean
  canNavigateChapter: boolean
  canNavigateForeshadow: boolean
}) {
  const showNeighbors = () => {
    const neighbors = new Set<string>([menu.nodeId])
    filteredEdges.forEach((edge) => {
      if (edge.source === menu.nodeId) neighbors.add(edge.target)
      if (edge.target === menu.nodeId) neighbors.add(edge.source)
    })
    onHideNodes(new Set(filteredNodes.filter((candidate) => !neighbors.has(candidate.id)).map((candidate) => candidate.id)))
    onClose()
  }

  return (
    <div className="graph-context-menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
      <button onClick={() => { onFocus(menu.nodeId); onClose() }}>聚焦此节点</button>
      <button onClick={() => { onHideNodes(new Set([...hiddenNodeIds, menu.nodeId])); onClose() }}>隐藏此节点</button>
      <button onClick={showNeighbors}>只显示邻居</button>
      <button onClick={() => { void navigator.clipboard?.writeText(node.label); onClose() }}>复制节点名称</button>
      {node.type === 'character' && canNavigateCharacter && <button onClick={() => onNavigateOrSelect(node)}>跳转角色卡</button>}
      {node.type === 'chapter' && canNavigateChapter && <button onClick={() => onNavigateOrSelect(node)}>跳转章节</button>}
      {node.type === 'foreshadowing' && canNavigateForeshadow && <button onClick={() => onNavigateOrSelect(node)}>跳转伏笔</button>}
    </div>
  )
}

function GraphToolbar({
  mode,
  displayMode,
  showResolvedForeshadows,
  refreshing,
  regenerating,
  lastReport,
  onModeChange,
  onDisplayModeChange,
  onShowResolvedChange,
  onRefreshGraph,
  onOpenRebuildDialog,
  onCopyDocument,
  onExportDocument,
}: {
  mode: GraphMode
  displayMode: GraphDisplayMode
  showResolvedForeshadows: boolean
  refreshing: boolean
  regenerating: boolean
  lastReport: SnapshotRegenerationReport | null
  onModeChange: (mode: GraphMode) => void
  onDisplayModeChange: (mode: GraphDisplayMode) => void
  onShowResolvedChange: (show: boolean) => void
  onRefreshGraph: () => void
  onOpenRebuildDialog: () => void
  onCopyDocument: () => void
  onExportDocument: () => void
}) {
  const attentionCount = lastReport ? lastReport.failed + lastReport.stale : 0
  return (
    <div className="graph-toolbar">
      <label>分析模式<select className="graph-mode-select" value={mode} onChange={(event) => onModeChange(event.target.value as GraphMode)}>{Object.entries(GRAPH_MODE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <div className="graph-display-toggle">{(['graph', 'document', 'mindmap'] as GraphDisplayMode[]).map((value) => <button key={value} className={displayMode === value ? 'active' : ''} onClick={() => onDisplayModeChange(value)}>{value === 'graph' ? '图谱' : value === 'document' ? '文档' : '脑图'}</button>)}</div>
      {mode === 'foreshadowing' && <label className="graph-checkbox-row"><input type="checkbox" checked={showResolvedForeshadows} onChange={(event) => onShowResolvedChange(event.target.checked)} />显示已回收伏笔</label>}
      {displayMode === 'document' && <div className="graph-toolbar-row"><button onClick={onCopyDocument}>复制文档</button><button onClick={onExportDocument}>导出 Markdown</button></div>}
      <button onClick={onRefreshGraph} disabled={refreshing || regenerating}>{refreshing ? '刷新中…' : '刷新图谱'}</button>
      <button onClick={onOpenRebuildDialog} disabled={refreshing}>AI 快照重建</button>
      {lastReport && <div className="graph-regeneration-status">快照状态：{attentionCount} 待处理，{lastReport.success}/{lastReport.total} 可用</div>}
    </div>
  )
}

function formatRebuildTime(value: string): string {
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return value
  return time.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function snapshotRecordState(item: SnapshotRegenerationRecord): { label: string; className: string } {
  if (item.status === 'failed') return { label: '失败', className: 'failed' }
  if (item.stale) return { label: '已过期', className: 'stale' }
  return { label: '可用', className: 'success' }
}

function SnapshotReportView({ report }: { report: SnapshotRegenerationReport | null }) {
  const [statusFilter, setStatusFilter] = useState<SnapshotStatusFilter>('attention')
  const [pageSize, setPageSize] = useState(15)
  const attentionCount = report ? report.items.filter((item) => item.status === 'failed' || item.stale).length : 0
  const filteredItems = useMemo(() => {
    if (!report) return []
    if (statusFilter === 'attention') return report.items.filter((item) => item.status === 'failed' || item.stale)
    if (statusFilter === 'stale') return report.items.filter((item) => item.stale)
    if (statusFilter === 'success') return report.items.filter((item) => item.status === 'success' && !item.stale)
    if (statusFilter === 'all') return report.items
    return report.items.filter((item) => item.status === statusFilter)
  }, [report, statusFilter])
  const { paged, page, setPage, totalPages, reset } = usePagination(filteredItems, pageSize)
  const changeFilter = (next: SnapshotStatusFilter) => {
    setStatusFilter(next)
    reset()
  }
  const changePageSize = (next: number) => {
    setPageSize(next)
    reset()
  }

  if (!report) return <p className="review-empty">暂无快照重建记录</p>
  return (
    <div className="graph-rebuild-report">
      <div className="graph-rebuild-summary">
        <span>{report.lastScopeLabel ?? '快照重建状态'}</span>
        <span>{attentionCount} 待处理</span>
        <span>{report.failed} 失败</span>
        <span>{report.stale} 已过期</span>
        <span>{report.success}/{report.total} 可用</span>
      </div>
      <div className="graph-rebuild-report-filters">
        <button className={statusFilter === 'attention' ? 'active' : ''} onClick={() => changeFilter('attention')}>待处理 {attentionCount}</button>
        <button className={statusFilter === 'failed' ? 'active' : ''} onClick={() => changeFilter('failed')}>失败 {report.failed}</button>
        <button className={statusFilter === 'stale' ? 'active' : ''} onClick={() => changeFilter('stale')}>已过期 {report.stale}</button>
        <button className={statusFilter === 'success' ? 'active' : ''} onClick={() => changeFilter('success')}>可用 {report.success}</button>
        <button className={statusFilter === 'all' ? 'active' : ''} onClick={() => changeFilter('all')}>全部 {report.total}</button>
      </div>
      <div className="graph-rebuild-report-list">
        {paged.length === 0 ? <p className="review-empty">当前筛选无记录</p> : paged.map((item) => {
          const state = snapshotRecordState(item)
          return (
            <div key={item.chapterId} className={`graph-rebuild-report-item ${state.className}`}>
              <span>{state.label}：第{item.chapterOrder}章 {item.chapterTitle}</span>
              <small>最近重建：{formatRebuildTime(item.rebuiltAt)} · {item.scopeLabel}</small>
              {item.error && <small>{item.error}</small>}
            </div>
          )
        })}
      </div>
      <Pagination currentPage={page} totalPages={totalPages} totalItems={filteredItems.length} pageSize={pageSize} pageSizeOptions={[15, 30, 50]} onPageChange={setPage} onPageSizeChange={changePageSize} />
    </div>
  )
}

function SnapshotRebuildDialog({
  chapters,
  loadingChapters,
  regenerating,
  progress,
  lastReport,
  onClose,
  onStart,
}: {
  chapters: ChapterMeta[]
  loadingChapters: boolean
  regenerating: boolean
  progress: SnapshotRegenerationProgress | null
  lastReport: SnapshotRegenerationReport | null
  onClose: () => void
  onStart: (scope: SnapshotRegenerationScope) => void
}) {
  const [scopeKind, setScopeKind] = useState<SnapshotRegenerationScope['kind']>('from')
  const [startChapterId, setStartChapterId] = useState('')
  const [endChapterId, setEndChapterId] = useState('')

  useEffect(() => {
    if (chapters.length === 0) return
    setStartChapterId((current) => current || chapters[0]!.id)
    setEndChapterId((current) => current || chapters[chapters.length - 1]!.id)
  }, [chapters])

  const volumes = useMemo(() => [...new Set(chapters.map((chapter) => chapter.volume))].sort(), [chapters])

  const renderChapterSelect = (value: string, onChange: (value: string) => void) => (
    <select value={value} onChange={(event) => onChange(event.target.value)} disabled={regenerating || loadingChapters}>
      {volumes.map((volume) => (
        <optgroup key={volume} label={volume}>
          {chapters
            .filter((chapter) => chapter.volume === volume)
            .sort((a, b) => a.order - b.order)
            .map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.title}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  )

  const buildScope = (): SnapshotRegenerationScope => {
    if (scopeKind === 'all') return { kind: 'all' }
    if (scopeKind === 'single') return { kind: 'single', chapterId: startChapterId }
    if (scopeKind === 'from') return { kind: 'from', chapterId: startChapterId }
    return { kind: 'range', startChapterId, endChapterId }
  }

  return (
    <Modal className="graph-rebuild-dialog">
      <div className="graph-rebuild-header">
        <h3>AI 快照重建</h3>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={regenerating}>✕</Button>
      </div>
      <div className="modal-scroll-body graph-rebuild-body">
        <p className="graph-rebuild-note">这会调用 AI 重新分析章节并覆盖对应快照。关系图普通刷新不需要执行这个操作。</p>
        <div className="graph-rebuild-options">
          <label>范围</label>
          <select value={scopeKind} onChange={(event) => setScopeKind(event.target.value as SnapshotRegenerationScope['kind'])} disabled={regenerating || loadingChapters}>
            <option value="from">从指定章节开始</option>
            <option value="single">仅单章</option>
            <option value="range">章节范围</option>
            <option value="all">全部章节</option>
          </select>
          {scopeKind !== 'all' && (
            renderChapterSelect(startChapterId, setStartChapterId)
          )}
          {scopeKind === 'range' && (
            renderChapterSelect(endChapterId, setEndChapterId)
          )}
        </div>
        {progress && <div className="graph-rebuild-progress">{progress.status === 'running' ? '正在分析' : progress.status === 'success' ? '完成' : '失败'}：{progress.current}/{progress.total} {progress.chapterTitle}{progress.error ? `（${progress.error}）` : ''}</div>}
        <h4>快照重建状态</h4>
        <SnapshotReportView report={lastReport} />
      </div>
      <div className="dialog-footer">
        <Button variant="text" size="sm" onClick={onClose} disabled={regenerating}>关闭</Button>
        <Button variant="primary" size="sm" onClick={() => onStart(buildScope())} disabled={regenerating || loadingChapters || chapters.length === 0}>
          {regenerating ? '重建中…' : '开始重建'}
        </Button>
      </div>
    </Modal>
  )
}

function GraphLegend({
  hiddenTypes,
  allNodes,
  visibleNodes,
  onReset,
  onToggleType,
}: {
  hiddenTypes: ReadonlySet<GraphNodeType>
  allNodes: GraphNode[]
  visibleNodes: GraphNode[]
  onReset: () => void
  onToggleType: (type: GraphNodeType) => void
}) {
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

function NodeDetail({ node, links, allNodes }: { node: GraphNode | null; links: RelationshipLink[]; allNodes: GraphNode[] }) {
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

function InsightsPanel({ insights, onFocusInsight }: { insights: InsightItem[]; onFocusInsight: (insight: InsightItem) => void }) {
  const [pageSize, setPageSize] = useState(6)
  const { paged, page, setPage, totalPages, reset } = usePagination(insights, pageSize)
  const changePageSize = (next: number) => {
    setPageSize(next)
    reset()
  }

  return (
    <div className="graph-insights-panel">
      <div className="graph-sidebar-title"><h3>洞察</h3><span>{insights.length} 条</span></div>
      <div className="graph-insight-list">
        {insights.length === 0 ? <p className="review-empty">暂无洞察</p> : paged.map((insight, index) => (
          <button key={`${insight.type}-${page}-${index}`} className="graph-insight-card" onClick={() => onFocusInsight(insight)}>
            <strong>{insight.title}</strong>
            <p>{insight.description}</p>
            <small>{insight.suggestion}</small>
          </button>
        ))}
      </div>
      <Pagination currentPage={page} totalPages={totalPages} totalItems={insights.length} pageSize={pageSize} pageSizeOptions={[6, 10, 15]} onPageChange={setPage} onPageSizeChange={changePageSize} />
    </div>
  )
}

export default function RelationshipGraph({ projectId, onNavigateToCharacter, onNavigateToChapter, onNavigateToForeshadow }: Props) {
  const [graph, setGraph] = useState<RelationshipGraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<GraphMode>('overview')
  const [displayMode, setDisplayMode] = useState<GraphDisplayMode>('graph')
  const [showResolvedForeshadows, setShowResolvedForeshadows] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [hiddenTypes, setHiddenTypes] = useState<ReadonlySet<GraphNodeType>>(new Set())
  const [hiddenNodeIds, setHiddenNodeIds] = useState<ReadonlySet<string>>(new Set())
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [regenerationProgress, setRegenerationProgress] = useState<SnapshotRegenerationProgress | null>(null)
  const [lastRegenerationReport, setLastRegenerationReport] = useState<SnapshotRegenerationReport | null>(null)
  const [showRebuildDialog, setShowRebuildDialog] = useState(false)
  const [chapters, setChapters] = useState<ChapterMeta[]>([])
  const [chaptersLoading, setChaptersLoading] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<GraphSidebarTab>('detail')

  const reloadGraph = useCallback(async (preserveOnError = false) => {
    setLoading(true); setError(null)
    try {
      const next = await loadRelationshipGraph(projectId)
      setGraph(next); setSelectedNodeId(null); setFocusedNodeId(null)
    } catch (e) {
      setError(String(e)); if (!preserveOnError) setGraph(null)
    } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { void reloadGraph(false) }, [reloadGraph])
  useEffect(() => {
    loadSnapshotRegenerationReport(projectId).then(setLastRegenerationReport).catch(console.error)
  }, [projectId])

  const preset = GRAPH_MODE_PRESETS[mode]
  const filtered = useMemo(() => graph ? applyGraphFilters(graph.nodes, graph.links, {
    hiddenTypes: new Set([...hiddenTypes, ...preset.hiddenNodeTypes]),
    hiddenNodeIds,
    hideStructural: preset.hideStructural,
    hideIsolated: preset.hideIsolated,
    hideResolvedForeshadowing: mode === 'foreshadowing' && !showResolvedForeshadows,
    minimumEdgeWeight: preset.minimumEdgeWeight,
    allowedNodeTypes: preset.allowedNodeTypes,
  }) : { nodes: [], edges: [] }, [graph, hiddenNodeIds, hiddenTypes, mode, preset, showResolvedForeshadows])
  const selectedNode = filtered.nodes.find((node) => node.id === selectedNodeId) ?? graph?.nodes.find((node) => node.id === selectedNodeId) ?? null
  const selectedLinks = selectedNode ? filtered.edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id) : []

  const navigateOrSelect = (node: GraphNode) => {
    setSelectedNodeId(node.id); setFocusedNodeId(node.id)
    const parsed = parseGraphNodeId(node.id)
    if (!parsed) return
    if (parsed.type === 'character') onNavigateToCharacter?.(parsed.raw)
    else if (parsed.type === 'chapter') onNavigateToChapter?.(parsed.raw)
    else if (parsed.type === 'foreshadowing') onNavigateToForeshadow?.(parsed.raw)
  }
  const toggleHiddenType = (type: GraphNodeType) => {
    const next = new Set(hiddenTypes)
    if (next.has(type)) next.delete(type)
    else next.add(type)
    setHiddenTypes(next)
  }
  const focusInsight = (insight: InsightItem) => {
    const nodeId = insight.nodeIds[0]
    if (!nodeId) return
    setSelectedNodeId(nodeId)
    setFocusedNodeId(nodeId)
    setDisplayMode('graph')
  }
  const resetFilters = () => { setHiddenTypes(new Set()); setHiddenNodeIds(new Set()); setFocusedNodeId(null) }
  const graphDocument = useMemo(() => buildGraphDocument(filtered.nodes, filtered.edges), [filtered.edges, filtered.nodes])
  const handleCopyDocument = () => { void navigator.clipboard?.writeText(graphDocument) }
  const handleExportDocument = () => {
    const blob = new Blob([graphDocument], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'relationship-graph.md'
    link.click()
    URL.revokeObjectURL(url)
  }
  const handleRefreshGraph = () => { void reloadGraph(true) }
  const openRebuildDialog = () => {
    setShowRebuildDialog(true)
    setChaptersLoading(true)
    Promise.all([
      listChapters(projectId),
      loadSnapshotRegenerationReport(projectId),
    ])
      .then(([nextChapters, report]) => {
        setChapters(nextChapters.slice().sort((a, b) => a.order - b.order))
        setLastRegenerationReport(report)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setChaptersLoading(false))
  }
  const handleRebuildSnapshots = async (scope: SnapshotRegenerationScope) => {
    setRegenerating(true); setRegenerationProgress(null)
    try {
      const report = await regenerateSnapshots(projectId, scope, setRegenerationProgress)
      setLastRegenerationReport(report)
      await reloadGraph(true)
    } catch (e) { setError(String(e)) } finally { setRegenerating(false) }
  }

  if (loading && !graph) return <div className="review-empty">加载关系图谱…</div>
  if (error && !graph) return <div className="review-empty">加载失败：{error}</div>
  if (!graph || graph.nodes.length === 0) return <div className="review-empty">暂无关系图数据</div>

  return <div className="relationship-graph graph-panel panel-layout" onClick={() => setContextMenu(null)} onContextMenu={(event) => event.preventDefault()}>
    <div className="panel-editor graph-canvas-area">
      {error && <div className="graph-error-banner">加载失败：{error}</div>}
      {filtered.nodes.length === 0 ? <div className="graph-empty-state"><p>当前筛选无节点</p><button onClick={resetFilters}>一键重置筛选</button></div> : displayMode === 'graph' ? <ForceGraphView nodes={filtered.nodes} edges={filtered.edges} focusedNodeId={focusedNodeId} labelVisibility={preset.labelVisibility} onSelect={(id) => { setSelectedNodeId(id); setFocusedNodeId(id) }} onContext={setContextMenu} /> : displayMode === 'document' ? <DocumentGraphView nodes={filtered.nodes} edges={filtered.edges} onNodeClick={navigateOrSelect} /> : <MindMapGraphView nodes={filtered.nodes} edges={filtered.edges} onNodeIdClick={(id) => { const rawId = id.includes('->') ? id.split('->')[1]! : id; const node = filtered.nodes.find((candidate) => candidate.id === rawId); if (node) navigateOrSelect(node) }} />}
      {contextMenu && (() => {
        const menuNode = graph.nodes.find((node) => node.id === contextMenu.nodeId)
        return menuNode ? <NodeContextMenu menu={contextMenu} node={menuNode} filteredNodes={filtered.nodes} filteredEdges={filtered.edges} hiddenNodeIds={hiddenNodeIds} onClose={() => setContextMenu(null)} onFocus={setFocusedNodeId} onHideNodes={setHiddenNodeIds} onNavigateOrSelect={navigateOrSelect} canNavigateCharacter={Boolean(onNavigateToCharacter)} canNavigateChapter={Boolean(onNavigateToChapter)} canNavigateForeshadow={Boolean(onNavigateToForeshadow)} /> : null
      })()}
    </div>
    <aside className="graph-sidebar panel-sidebar">
      <GraphToolbar mode={mode} displayMode={displayMode} showResolvedForeshadows={showResolvedForeshadows} refreshing={loading && Boolean(graph)} regenerating={regenerating} lastReport={lastRegenerationReport} onModeChange={setMode} onDisplayModeChange={setDisplayMode} onShowResolvedChange={setShowResolvedForeshadows} onRefreshGraph={handleRefreshGraph} onOpenRebuildDialog={openRebuildDialog} onCopyDocument={handleCopyDocument} onExportDocument={handleExportDocument} />
      <div className="graph-sidebar-tabs">
        <button className={sidebarTab === 'detail' ? 'active' : ''} onClick={() => setSidebarTab('detail')}>详情</button>
        <button className={sidebarTab === 'insights' ? 'active' : ''} onClick={() => setSidebarTab('insights')}>洞察 {graph.insights.length}</button>
      </div>
      {sidebarTab === 'detail' ? <>
        <GraphLegend hiddenTypes={hiddenTypes} allNodes={graph.nodes} visibleNodes={filtered.nodes} onReset={resetFilters} onToggleType={toggleHiddenType} />
        <NodeDetail node={selectedNode} links={selectedLinks} allNodes={graph.nodes} />
      </> : <InsightsPanel insights={graph.insights} onFocusInsight={focusInsight} />}
    </aside>
    {showRebuildDialog && <SnapshotRebuildDialog chapters={chapters} loadingChapters={chaptersLoading} regenerating={regenerating} progress={regenerationProgress} lastReport={lastRegenerationReport} onClose={() => setShowRebuildDialog(false)} onStart={handleRebuildSnapshots} />}
  </div>
}
