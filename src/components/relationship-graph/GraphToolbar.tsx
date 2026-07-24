import { GRAPH_MODE_LABELS, type GraphDisplayMode, type GraphMode } from '../../lib/graph-mode'
import type { SnapshotRegenerationReport } from '../../services/snapshotRegeneration'

interface Props {
  mode: GraphMode
  displayMode: GraphDisplayMode
  showResolvedForeshadows: boolean
  showHistoricalRelationships: boolean
  showInferredEvidence: boolean
  refreshing: boolean
  regenerating: boolean
  lastReport: SnapshotRegenerationReport | null
  onModeChange: (mode: GraphMode) => void
  onDisplayModeChange: (mode: GraphDisplayMode) => void
  onShowResolvedChange: (show: boolean) => void
  onShowHistoricalRelationshipsChange: (show: boolean) => void
  onShowInferredEvidenceChange: (show: boolean) => void
  onRefreshGraph: () => void
  onOpenRebuildDialog: () => void
  onCopyDocument: () => void
  onExportDocument: () => void
}

export default function GraphToolbar({
  mode,
  displayMode,
  showResolvedForeshadows,
  showHistoricalRelationships,
  showInferredEvidence,
  refreshing,
  regenerating,
  lastReport,
  onModeChange,
  onDisplayModeChange,
  onShowResolvedChange,
  onShowHistoricalRelationshipsChange,
  onShowInferredEvidenceChange,
  onRefreshGraph,
  onOpenRebuildDialog,
  onCopyDocument,
  onExportDocument,
}: Props) {
  const attentionCount = lastReport ? lastReport.failed + lastReport.stale : 0
  return (
    <div className="graph-toolbar">
      <label>分析模式<select className="graph-mode-select" value={mode} onChange={(event) => onModeChange(event.target.value as GraphMode)}>{Object.entries(GRAPH_MODE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <div className="graph-display-toggle">{(['graph', 'document', 'mindmap'] as GraphDisplayMode[]).map((value) => <button key={value} className={displayMode === value ? 'active' : ''} onClick={() => onDisplayModeChange(value)}>{value === 'graph' ? '图谱' : value === 'document' ? '文档' : '脑图'}</button>)}</div>
      <div className="graph-visibility-filters">
        <span>历史 / 证据</span>
        <label className="graph-checkbox-row"><input type="checkbox" checked={showHistoricalRelationships} onChange={(event) => onShowHistoricalRelationshipsChange(event.target.checked)} />历史关系</label>
        <label className="graph-checkbox-row"><input type="checkbox" checked={showInferredEvidence} onChange={(event) => onShowInferredEvidenceChange(event.target.checked)} />推测证据</label>
      </div>
      {mode === 'foreshadowing' && <label className="graph-checkbox-row"><input type="checkbox" checked={showResolvedForeshadows} onChange={(event) => onShowResolvedChange(event.target.checked)} />显示已回收伏笔</label>}
      {displayMode === 'document' && <div className="graph-toolbar-row"><button onClick={onCopyDocument}>复制文档</button><button onClick={onExportDocument}>导出 Markdown</button></div>}
      <button onClick={onRefreshGraph} disabled={refreshing || regenerating}>{refreshing ? '刷新中…' : '刷新图谱'}</button>
      <button onClick={onOpenRebuildDialog} disabled={refreshing}>AI 快照重建</button>
      {lastReport && <div className="graph-regeneration-status">快照状态：{attentionCount} 待处理，{lastReport.success}/{lastReport.total} 可用</div>}
    </div>
  )
}
