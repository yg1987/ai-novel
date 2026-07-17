import Button from '../Button'
import type { ForeshadowCounts } from './foreshadowPanelUtils'

interface Props {
  counts: ForeshadowCounts
  onAdd: () => void
  onOpenInspire: () => void
  onToggleConfig: () => void
}

export default function ForeshadowStatsBar({ counts, onAdd, onOpenInspire, onToggleConfig }: Props) {
  return (
    <div className="foreshadow-stats">
      <span>总计 {counts.all}</span>
      <span className="stat-active">待处理 {counts.planted}</span>
      <span className="stat-advanced">推进中 {counts.advanced}</span>
      <span className="stat-done">已回收 {counts.resolved}</span>
      <span className="stat-abandoned">已废弃 {counts.abandoned}</span>
      <Button variant="primary" size="sm" onClick={onAdd}>+ 新增伏笔</Button>
      <Button variant="secondary" size="sm" onClick={onOpenInspire} title="AI 分析伏笔机会">🔍 灵感分析</Button>
      <Button variant="ghost" size="sm" onClick={onToggleConfig} title="伏笔配置">⚙</Button>
    </div>
  )
}
