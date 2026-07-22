import type { ForeshadowConfig, ForeshadowEntry } from '../../types/novel'
import type { ChapterMeta, ChapterRef } from '../../types/chapter'
import { classifyForeshadows } from '../../services/foreshadowContext'
import { calcForeshadowDensity, calcForeshadowHealth, getHealthLabel } from '../../services/foreshadowHealth'
import type { ForeshadowCounts } from './foreshadowPanelUtils'

interface Props {
  entries: ForeshadowEntry[]
  filteredEntries: ForeshadowEntry[]
  currentChapterRef: ChapterRef | null
  chapters: ChapterMeta[]
  config: ForeshadowConfig
  counts: ForeshadowCounts
}

export default function ForeshadowHealthCard({ entries, filteredEntries, currentChapterRef, chapters, config, counts }: Props) {
  if (entries.length === 0) return null

  const healthScore = calcForeshadowHealth(filteredEntries, currentChapterRef, chapters, config)
  const healthLabel = getHealthLabel(healthScore)
  const activeCount = counts.planted + counts.advanced
  const recoveryRate = Math.round((counts.resolved / entries.length) * 100)
  const classified = classifyForeshadows(filteredEntries, currentChapterRef, chapters, config)
  const densityInfo = calcForeshadowDensity(filteredEntries, currentChapterRef, chapters)
  const densityStatus = densityInfo.density > config.densityWarningThreshold
    ? '⚠️ 偏高'
    : densityInfo.totalChapters > 20 && densityInfo.density < config.densityLowThreshold
      ? '📉 偏低'
      : '✅ 正常'

  return (
    <div className="foreshadow-health-card">
      <div className="foreshadow-health-score">
        📊 伏笔健康度 {healthScore}/100 {healthLabel}
      </div>
      <div>
        总数 {entries.length} | 已回收 {counts.resolved} | 活跃 {activeCount}
      </div>
      <div className="foreshadow-health-bar">
        <div className="foreshadow-health-bar-fill" style={{ width: `${recoveryRate}%` }} />
      </div>
      <div>{recoveryRate}% 回收率</div>
      <div className="foreshadow-health-row">
        <span>🔴 必须处理 {classified.critical.length}</span>
        <span>🟡 即将到期 {classified.upcoming.length}</span>
        <span>🔵 近期活跃 {classified.active.length}</span>
        <span>⚪ 已埋设 {classified.background.length}</span>
      </div>
      <div>
        密度：{densityInfo.unresolved}条活跃 / {densityInfo.totalChapters}章 = {densityInfo.density}/章 {densityStatus}
      </div>
    </div>
  )
}
