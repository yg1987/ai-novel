import { useCallback, useEffect, useMemo, useState } from 'react'
import { listChapters } from '../../api/tauri'
import { loadRelationshipGraph } from '../../services/relationshipStore'
import {
  loadSnapshotRegenerationReport,
  regenerateSnapshots,
  type SnapshotRegenerationProgress,
  type SnapshotRegenerationReport,
  type SnapshotRegenerationScope,
} from '../../services/snapshotRegeneration'
import { applyGraphFilters } from '../../lib/graph-filters'
import { GRAPH_MODE_PRESETS, type GraphDisplayMode, type GraphMode } from '../../lib/graph-mode'
import { buildGraphDocument } from '../../lib/graph-readable'
import { parseGraphNodeId } from '../../lib/graph-id'
import type { ChapterMeta } from '../../types/chapter'
import type { GraphNode, GraphNodeType, InsightItem, RelationshipGraph as RelationshipGraphData, RelationshipLink } from '../../types/novel'
import ForceGraphView, { type ContextMenuState } from './ForceGraphView'
import DocumentGraphView from './DocumentGraphView'
import MindMapGraphView from './MindMapGraphView'
import SnapshotRebuildDialog from './SnapshotRebuildDialog'
import '../GraphShared.css'
import './RelationshipGraph.css'
import GraphToolbar from './GraphToolbar'
import GraphLegend from './GraphLegend'
import NodeDetail from './NodeDetail'
import InsightsPanel from './InsightsPanel'

interface Props {
  projectId: string
  onNavigateToCharacter?: (name: string) => void
  onNavigateToChapter?: (chapterRef: string) => void
  onNavigateToForeshadow?: (id: string) => void
}

type GraphSidebarTab = 'detail' | 'insights'

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
    setLoading(true)
    setError(null)
    try {
      const next = await loadRelationshipGraph(projectId)
      setGraph(next)
      setSelectedNodeId(null)
      setFocusedNodeId(null)
    } catch (e) {
      setError(String(e))
      if (!preserveOnError) setGraph(null)
    } finally {
      setLoading(false)
    }
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
    setSelectedNodeId(node.id)
    setFocusedNodeId(node.id)
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

  const resetFilters = () => {
    setHiddenTypes(new Set())
    setHiddenNodeIds(new Set())
    setFocusedNodeId(null)
  }

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
    setRegenerating(true)
    setRegenerationProgress(null)
    try {
      const report = await regenerateSnapshots(projectId, scope, setRegenerationProgress)
      setLastRegenerationReport(report)
      await reloadGraph(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setRegenerating(false)
    }
  }

  if (loading && !graph) return <div className="review-empty">加载关系图谱…</div>
  if (error && !graph) return <div className="review-empty">加载失败：{error}</div>
  if (!graph || graph.nodes.length === 0) return <div className="review-empty">暂无关系图数据</div>

  return (
    <div className="relationship-graph graph-panel panel-layout" onClick={() => setContextMenu(null)} onContextMenu={(event) => event.preventDefault()}>
      <div className="panel-editor graph-canvas-area">
        {error && <div className="graph-error-banner">加载失败：{error}</div>}
        {filtered.nodes.length === 0 ? (
          <div className="graph-empty-state"><p>当前筛选无节点</p><button onClick={resetFilters}>一键重置筛选</button></div>
        ) : displayMode === 'graph' ? (
          <ForceGraphView nodes={filtered.nodes} edges={filtered.edges} focusedNodeId={focusedNodeId} labelVisibility={preset.labelVisibility} onSelect={(id) => { setSelectedNodeId(id); setFocusedNodeId(id) }} onContext={setContextMenu} />
        ) : displayMode === 'document' ? (
          <DocumentGraphView nodes={filtered.nodes} edges={filtered.edges} onNodeClick={navigateOrSelect} />
        ) : (
          <MindMapGraphView nodes={filtered.nodes} edges={filtered.edges} onNodeIdClick={(id) => {
            const rawId = id.includes('->') ? id.split('->')[1]! : id
            const node = filtered.nodes.find((candidate) => candidate.id === rawId)
            if (node) navigateOrSelect(node)
          }} />
        )}
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
        {sidebarTab === 'detail' ? (
          <>
            <GraphLegend hiddenTypes={hiddenTypes} allNodes={graph.nodes} visibleNodes={filtered.nodes} onReset={resetFilters} onToggleType={toggleHiddenType} />
            <NodeDetail node={selectedNode} links={selectedLinks} allNodes={graph.nodes} />
          </>
        ) : (
          <InsightsPanel insights={graph.insights} onFocusInsight={focusInsight} />
        )}
      </aside>
      {showRebuildDialog && <SnapshotRebuildDialog chapters={chapters} loadingChapters={chaptersLoading} regenerating={regenerating} progress={regenerationProgress} lastReport={lastRegenerationReport} onClose={() => setShowRebuildDialog(false)} onStart={handleRebuildSnapshots} />}
    </div>
  )
}
