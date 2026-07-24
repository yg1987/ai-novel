import Button from '../Button'
import Pagination from '../Pagination'
import type { ForeshadowConfig, ForeshadowEntry, ForeshadowInspiration, ForeshadowStatus, ForeshadowSuggestion } from '../../types/novel'
import type { ChapterMeta, ChapterRef } from '../../types/chapter'
import { classifyForeshadows } from '../../services/foreshadowContext'
import {
  CATEGORY_LABELS,
  IMPORTANCE_OPTIONS,
  STATUS_LABELS,
  URGENCY_LABELS,
  URGENCY_TIPS,
  getChapterLabel,
  getForeshadowUrgency,
  type ForeshadowSuggestionPrefill,
} from './foreshadowPanelUtils'

const SUGGESTION_COLORS: Record<string, { bg: string; tag: string }> = {
  gap: { bg: '#fff3e0', tag: '🔴 缺口' },
  callback: { bg: '#e8f5e9', tag: '🟡 呼应' },
  density: { bg: '#e3f2fd', tag: '🟢 密度' },
}

const DEFAULT_SUGGESTION_COLORS = SUGGESTION_COLORS.gap!

function SuggestionCard({
  suggestion,
  onAdopt,
}: {
  suggestion: ForeshadowSuggestion
  onAdopt: (prefill: ForeshadowSuggestionPrefill) => void
}) {
  const colors = SUGGESTION_COLORS[suggestion.type] ?? DEFAULT_SUGGESTION_COLORS

  return (
    <div style={{ padding: '10px', background: colors.bg, borderRadius: 6, fontSize: '0.84rem', lineHeight: 1.5 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{colors.tag}</div>
      {suggestion.type === 'gap' && (
        <>
          <div>📍 {suggestion.chapterRef}</div>
          <div style={{ color: 'var(--text-secondary)', margin: '4px 0' }}>{suggestion.reason}</div>
          <div>💡 {suggestion.suggestion}</div>
          {suggestion.relatedCharacters.length > 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>👤 {suggestion.relatedCharacters.join('、')}</div>
          )}
        </>
      )}
      {suggestion.type === 'callback' && (
        <>
          <div>📍 源头: {suggestion.sourceChapter}</div>
          <div style={{ color: 'var(--text-secondary)', margin: '4px 0' }}>📝 {suggestion.element}</div>
          <div>💡 {suggestion.suggestion}</div>
        </>
      )}
      {suggestion.type === 'density' && (
        <>
          {suggestion.hotChapters.length > 0 && <div>🔥 过多: {suggestion.hotChapters.join('、')}</div>}
          {suggestion.coldChapters.length > 0 && <div>❄️ 空白: {suggestion.coldChapters.join('、')}</div>}
          <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>{suggestion.overallAssessment}</div>
        </>
      )}
      {suggestion.type !== 'density' && (
        <button
          onClick={() => {
            if (suggestion.type === 'gap') {
              onAdopt({
                name: suggestion.suggestion.slice(0, 40),
                description: `${suggestion.chapterRef}: ${suggestion.reason}\n\n建议: ${suggestion.suggestion}`,
                relatedCharacters: suggestion.relatedCharacters,
              })
            } else {
              onAdopt({
                name: suggestion.element.slice(0, 40),
                description: `来源: ${suggestion.sourceChapter}\n\n${suggestion.element}\n\n建议: ${suggestion.suggestion}`,
              })
            }
          }}
          style={{ marginTop: 6, fontSize: '0.78rem', padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', cursor: 'pointer', color: 'var(--text)', whiteSpace: 'nowrap' }}
        >
          📝 采纳
        </button>
      )}
    </div>
  )
}

interface Props {
  statusFilter: string
  inspireResult: ForeshadowInspiration | null
  currentChapterRef: ChapterRef | null
  chapters: ChapterMeta[]
  config: ForeshadowConfig
  filteredEntries: ForeshadowEntry[]
  pagedEntries: ForeshadowEntry[]
  page: number
  totalPages: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  onAdoptSuggestion: (index: number, prefill: ForeshadowSuggestionPrefill) => void
  onNavigateToCharacter?: (characterId: string) => void
  resolveCharacterId: (name: string) => string | undefined
  onStatusChange: (entry: ForeshadowEntry, status: ForeshadowStatus) => void | Promise<void>
  onEdit: (entry: ForeshadowEntry) => void
  onDelete: (entry: ForeshadowEntry) => void
}

export default function ForeshadowList({
  statusFilter,
  inspireResult,
  currentChapterRef,
  chapters,
  config,
  filteredEntries,
  pagedEntries,
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onAdoptSuggestion,
  onNavigateToCharacter,
  resolveCharacterId,
  onStatusChange,
  onEdit,
  onDelete,
}: Props) {
  if (statusFilter === 'inspire') {
    return (
      <div className="foreshadow-list">
        {!inspireResult || inspireResult.suggestions.length === 0 ? (
          <div className="foreshadow-empty">
            <p>暂无灵感建议</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>点击上方 🔍 灵感分析 按钮获取建议</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0 4px' }}>
              <span>🔴 缺口</span><span>🟡 呼应</span><span>🟢 密度</span>
            </div>
            {inspireResult.summary && (
              <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: 10, padding: '8px', background: 'var(--bg-sidebar)', borderRadius: 4 }}>{inspireResult.summary}</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {inspireResult.suggestions.map((suggestion, index) => (
                <SuggestionCard key={index} suggestion={suggestion} onAdopt={(prefill) => onAdoptSuggestion(index, prefill)} />
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  const classified = classifyForeshadows(filteredEntries, currentChapterRef, chapters, config)

  return (
    <>
      <div className="foreshadow-list">
        {pagedEntries.map((entry) => {
          const urgency = getForeshadowUrgency(entry, classified)
          const plantedLabel = getChapterLabel(entry.plantedChapter, chapters)
          const targetLabel = entry.plannedResolutionChapter ? getChapterLabel(entry.plannedResolutionChapter, chapters) : null

          return (
            <div key={entry.id} id={`foreshadow-${entry.id}`} className={`foreshadow-item urgency-${urgency}`}>
              <div className="foreshadow-item-header">
                <span className={`foreshadow-status status-${entry.status}`}>
                  {STATUS_LABELS[entry.status]}
                </span>
                <span className={`foreshadow-category-chip cat-${entry.category}`}>
                  {CATEGORY_LABELS[entry.category]}
                </span>
                <span className="foreshadow-name">{entry.name}</span>
                <span className="foreshadow-importance">
                  {IMPORTANCE_OPTIONS.find((option) => option.value === entry.importance)?.label ?? '★★★☆☆'}
                </span>
                <span className={`urgency-badge urgency-${urgency}`} title={URGENCY_TIPS[urgency]}>{URGENCY_LABELS[urgency]}</span>
              </div>
              <div className="foreshadow-desc">{entry.description}</div>
              <div className="foreshadow-meta">
                <span>埋入: {plantedLabel}</span>
                {entry.recordedResolutionChapter && <span>回收: {getChapterLabel(entry.recordedResolutionChapter, chapters)}</span>}
                {targetLabel && <span>计划回收: {targetLabel}</span>}
                {entry.resolutionPlan && <span>方式: {entry.resolutionPlan}</span>}
              </div>
              {entry.relatedCharacters.length > 0 && (
                <div className="foreshadow-chars">
                  {entry.relatedCharacters.map((name) => (
                    <span
                      key={name}
                      className="foreshadow-char-chip"
                      onClick={() => { const characterId = resolveCharacterId(name); if (characterId) onNavigateToCharacter?.(characterId) }}
                      title={`查看角色「${name}」`}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              )}
              {entry.notes && <div className="foreshadow-notes">{entry.notes}</div>}
              {entry.progress.length > 0 && (
                <div className="foreshadow-clues">
                  <div className="foreshadow-clues-title">推进轨迹</div>
                  {entry.progress.map((progress, index) => (
                    <div key={index} className="foreshadow-clue-item">
                      <span className="foreshadow-clue-chapter">{getChapterLabel(progress.chapter, chapters)}</span>
                      <span className="foreshadow-clue-desc">{progress.description}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="foreshadow-actions">
                {entry.status === 'planted' && (
                  <>
                    <Button variant="text" size="sm" onClick={() => { void onStatusChange(entry, 'advanced') }}>推进</Button>
                    <Button variant="text" size="sm" onClick={() => { void onStatusChange(entry, 'resolved') }}>回收</Button>
                    <Button variant="text" size="sm" onClick={() => { void onStatusChange(entry, 'abandoned') }}>废弃</Button>
                  </>
                )}
                {entry.status === 'advanced' && (
                  <>
                    <Button variant="text" size="sm" onClick={() => { void onStatusChange(entry, 'advanced') }}>再推</Button>
                    <Button variant="text" size="sm" onClick={() => { void onStatusChange(entry, 'resolved') }}>回收</Button>
                    <Button variant="text" size="sm" onClick={() => { void onStatusChange(entry, 'abandoned') }}>废弃</Button>
                  </>
                )}
                {(entry.status === 'resolved' || entry.status === 'abandoned') && (
                  <Button variant="text" size="sm" onClick={() => { void onStatusChange(entry, 'planted') }}>重开</Button>
                )}
                <Button variant="text" size="sm" onClick={() => onEdit(entry)}>编辑</Button>
                <Button variant="text" size="sm" style={{ color: 'var(--danger)' }} onClick={() => onDelete(entry)}>删除</Button>
              </div>
            </div>
          )
        })}
        {filteredEntries.length === 0 && <p className="foreshadow-empty">暂无伏笔</p>}
      </div>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={filteredEntries.length}
        pageSize={pageSize}
        pageSizeOptions={[15, 30, 50]}
        onPageChange={(nextPage) => {
          onPageChange(nextPage)
          document.querySelector('.foreshadow-list')?.scrollTo(0, 0)
        }}
        onPageSizeChange={onPageSizeChange}
      />
    </>
  )
}
