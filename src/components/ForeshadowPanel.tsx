import { useState, useEffect, useCallback } from 'react'
import type { ForeshadowEntry, ForeshadowStatus, ForeshadowCategory, ForeshadowClue, ForeshadowInspiration, ForeshadowSuggestion } from '../types/novel'
import { DEFAULT_FORESHADOW_CONFIG } from '../types/novel'
import type { ChapterMeta } from '../types/chapter'
import { listChapters, listProjectFiles } from '../api/tauri'
import {
  loadForeshadows,
  addForeshadow,
  updateForeshadow,
  changeStatus,
  deleteForeshadow,
  createForeshadowId,
  loadForeshadowConfig,
  saveForeshadowConfig,
  saveInspiration,
  loadInspiration,
} from '../services/foreshadowStorage'
import { classifyForeshadows, type ForeshadowUrgency } from '../services/foreshadowContext'
import { calcForeshadowHealth, getHealthLabel, calcForeshadowDensity } from '../services/foreshadowHealth'
import { runForeshadowInspire } from '../services/foreshadowInspire'
import Pagination from './Pagination'
import Modal from './Modal'
import { usePagination } from '../hooks/usePagination'

interface Props {
  projectId: string
  currentChapterId: string | null
  onNavigateToCharacter?: (name: string) => void
  highlightId?: string | null
  onHighlightComplete?: () => void
}

const CATEGORY_LABELS: Record<ForeshadowCategory, string> = {
  identity: '身份', mystery: '谜团', item: '物品',
  relationship: '关系', event: '事件', ability: '能力', power: '力量',
}

const STATUS_LABELS: Record<ForeshadowStatus, string> = {
  planted: '待处理', advanced: '推进中', resolved: '已回收', abandoned: '已废弃',
}

const DEFAULT_PAGE_SIZE = 15

const IMPORTANCE_OPTIONS = [
  { value: 0.2, label: '★☆☆☆☆' },
  { value: 0.4, label: '★★☆☆☆' },
  { value: 0.6, label: '★★★☆☆' },
  { value: 0.8, label: '★★★★☆' },
  { value: 1.0, label: '★★★★★' },
]

const URGENCY_LABELS: Record<ForeshadowUrgency, string> = {
  critical: '🔴 必须回收',
  upcoming: '🟡 即将到期',
  active: '🔵 近期活跃',
  background: '⚪ 已埋设',
}

const URGENCY_TIPS: Record<ForeshadowUrgency, string> = {
  critical: '已超期，需尽快回收。编辑 → 展开高级选项 → 修改「计划回收章节」可调整',
  upcoming: '即将到期，应提前铺垫。编辑 → 展开高级选项 → 修改「计划回收章节」可调整',
  active: '近期有推进记录，保持活跃。超过20章无推进将自动变为「已埋设」',
  background: '暂无计划回收章节或长期未推进。编辑 → 展开高级选项 → 设置「计划回收章节」，或点击「推进」按钮记录一次推进',
}

function getForeshadowUrgency(
  entry: ForeshadowEntry,
  classified: Record<ForeshadowUrgency, ForeshadowEntry[]>,
): ForeshadowUrgency {
  for (const level of ['critical', 'upcoming', 'active', 'background'] as ForeshadowUrgency[]) {
    if (classified[level].some((e) => e.id === entry.id)) return level
  }
  return 'background'
}

function getChapterLabel(chapterId: string, chapters: ChapterMeta[]): string {
  const meta = chapters.find((c) => c.id === chapterId)
  if (!meta) return chapterId
  const title = meta.title || `第${meta.order}章`
  return title
}

interface FormData {
  name: string
  description: string
  category: ForeshadowCategory
  importance: number
  plantedChapterId: string
  targetChapterId: string
  relatedCharacters: string[]
  clues: ForeshadowClue[]
  notes: string
  resolutionPlan: string
}

function emptyForm(currentChapterId: string | null): FormData {
  return {
    name: '',
    description: '',
    category: 'mystery',
    importance: 0.6,
    plantedChapterId: currentChapterId ?? '',
    targetChapterId: '',
    relatedCharacters: [],
    clues: [],
    notes: '',
    resolutionPlan: '',
  }
}

function entryToForm(entry: ForeshadowEntry): FormData {
  return {
    name: entry.name,
    description: entry.description,
    category: entry.category,
    importance: entry.importance,
    plantedChapterId: entry.plantedChapterId,
    targetChapterId: entry.targetChapterId ?? '',
    relatedCharacters: entry.relatedCharacters,
    clues: entry.clues,
    notes: entry.notes,
    resolutionPlan: entry.resolutionPlan ?? '',
  }
}

// ─── Suggestion card ──────────────────────────

const SUGGESTION_COLORS: Record<string, { bg: string; tag: string }> = {
  gap: { bg: '#fff3e0', tag: '🔴 缺口' },
  callback: { bg: '#e8f5e9', tag: '🟡 呼应' },
  density: { bg: '#e3f2fd', tag: '🟢 密度' },
}

function SuggestionCard({ suggestion, onAdopt }: {
  suggestion: ForeshadowSuggestion
  onAdopt: (prefill: { name?: string; description?: string; plantedChapterId?: string; relatedCharacters?: string[] }) => void
}) {
  const colors = SUGGESTION_COLORS[suggestion.type] ?? SUGGESTION_COLORS.gap
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
        <button onClick={() => {
          if (suggestion.type === 'gap') {
            onAdopt({ name: suggestion.suggestion.slice(0, 40), description: `${suggestion.chapterRef}: ${suggestion.reason}\n\n建议: ${suggestion.suggestion}`, relatedCharacters: suggestion.relatedCharacters })
          } else {
            onAdopt({ name: suggestion.element.slice(0, 40), description: `来源: ${suggestion.sourceChapter}\n\n${suggestion.element}\n\n建议: ${suggestion.suggestion}` })
          }
        }} style={{ marginTop: 6, fontSize: '0.78rem', padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', cursor: 'pointer', color: 'var(--text)', whiteSpace: 'nowrap' }}>📝 采纳</button>
      )}
    </div>
  )
}

export default function ForeshadowPanel({ projectId, currentChapterId, onNavigateToCharacter, highlightId, onHighlightComplete }: Props) {
  const [entries, setEntries] = useState<ForeshadowEntry[]>([])
  const [chapters, setChapters] = useState<ChapterMeta[]>([])
  const [characterNames, setCharacterNames] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm(currentChapterId))
  const [advancePrompt, setAdvancePrompt] = useState<{ entryId: string; desc: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ForeshadowEntry | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [foreshadowConfig, setForeshadowConfig] = useState(DEFAULT_FORESHADOW_CONFIG)
  const [showCharDropdown, setShowCharDropdown] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [configForm, setConfigForm] = useState(foreshadowConfig)
  const [showInspireModal, setShowInspireModal] = useState(false)
  const [inspireVolume, setInspireVolume] = useState('all')
  const [inspireLoading, setInspireLoading] = useState(false)
  const [inspireResult, setInspireResult] = useState<ForeshadowInspiration | null>(null)
  const [inspireError, setInspireError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [store, chList, charFiles, cfg] = await Promise.all([
      loadForeshadows(projectId),
      listChapters(projectId),
      listProjectFiles(projectId, 'characters').catch(() => []),
      loadForeshadowConfig(projectId),
    ])
    setEntries(store.entries)
    setChapters(chList)
    setForeshadowConfig(cfg)
    setCharacterNames(
      charFiles
        .filter((f) => f.name.endsWith('.md'))
        .map((f) => f.name.replace(/\.md$/, '')),
    )
  }, [projectId])

  useEffect(() => { refresh().catch(console.error) }, [refresh])
  useEffect(() => { loadInspiration(projectId).then((s) => { if (s) setInspireResult(s) }).catch(() => {}) }, [projectId])

  // Update default plantedChapterId when currentChapterId changes
  useEffect(() => {
    if (!editingId) {
      setForm((f) => ({ ...f, plantedChapterId: currentChapterId ?? f.plantedChapterId }))
    }
  }, [currentChapterId, editingId])

  // Scroll to highlighted foreshadow when highlightId changes
  useEffect(() => {
    if (!highlightId) return
    const el = document.getElementById(`foreshadow-${highlightId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('foreshadow-highlight')
      const timer = setTimeout(() => {
        el.classList.remove('foreshadow-highlight')
        onHighlightComplete?.()
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [highlightId])

  const volumes = [...new Set(chapters.map((c) => c.volume))].sort()

  // ─── Filters ─────────────────────────────

  const filtered = entries.filter((e) => {
    if (statusFilter === 'inspire') return false
    if (statusFilter !== 'all' && e.status !== statusFilter) return false
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false
    return true
  })

  const inspireCount = inspireResult?.suggestions.length ?? 0

  const { paged, page, setPage, totalPages, reset } = usePagination(filtered, pageSize)

  const handleStatusFilter = (s: string) => { setStatusFilter(s); reset() }
  const handleCategoryFilter = (c: string) => { setCategoryFilter(c); reset() }
  const handlePageSizeChange = (ps: number) => { setPageSize(ps); reset() }

  const counts = {
    all: entries.length,
    planted: entries.filter((e) => e.status === 'planted').length,
    advanced: entries.filter((e) => e.status === 'advanced').length,
    resolved: entries.filter((e) => e.status === 'resolved').length,
    abandoned: entries.filter((e) => e.status === 'abandoned').length,
  }

  // ─── Form handlers ──────────────────────

  const openAdd = () => {
    setEditingId(null)
    setForm(emptyForm(currentChapterId))
    setShowAdvanced(false)
    setShowForm(true)
  }

  const openEdit = (entry: ForeshadowEntry) => {
    setEditingId(entry.id)
    setForm(entryToForm(entry))
    setShowAdvanced(!!entry.targetChapterId || !!entry.resolutionPlan || !!entry.notes)
    setShowForm(true)
  }

  const handleInspire = async () => {
    setInspireLoading(true)
    setInspireError(null)
    try {
      const result = await runForeshadowInspire({ projectId, volume: inspireVolume })
      setInspireResult(result)
      saveInspiration(projectId, result).catch(() => {})
    } catch (e) {
      setInspireError(e instanceof Error ? e.message : String(e))
    } finally {
      setInspireLoading(false)
      setShowInspireModal(false)
    }
  }

  const handleSave = async () => {
    const now = new Date().toISOString().slice(0, 16)
    if (editingId) {
      await updateForeshadow(projectId, editingId, {
        name: form.name,
        description: form.description,
        category: form.category,
        importance: form.importance,
        plantedChapterId: form.plantedChapterId,
        targetChapterId: form.targetChapterId || undefined,
        clues: form.clues,
        relatedCharacters: form.relatedCharacters,
        notes: form.notes,
        resolutionPlan: form.resolutionPlan || undefined,
        updatedAt: now,
      })
    } else {
      await addForeshadow(projectId, {
        id: createForeshadowId(),
        name: form.name,
        description: form.description,
        status: 'planted',
        category: form.category,
        importance: form.importance,
        plantedChapterId: form.plantedChapterId,
        targetChapterId: form.targetChapterId || undefined,
        clues: form.clues,
        relatedCharacters: form.relatedCharacters,
        notes: form.notes,
        resolutionPlan: form.resolutionPlan || undefined,
        createdAt: now,
        updatedAt: now,
      })
    }
    setShowForm(false)
    await refresh()
  }

  const handleStatusChange = async (entry: ForeshadowEntry, newStatus: ForeshadowStatus) => {
    if (newStatus === 'advanced') {
      setAdvancePrompt({ entryId: entry.id, desc: '' })
      return
    }
    await changeStatus(projectId, entry.id, newStatus)
    await refresh()
  }

  const handleAdvanceConfirm = async () => {
    if (!advancePrompt) return
    await changeStatus(projectId, advancePrompt.entryId, 'advanced', {
      chapterId: currentChapterId ?? '',
      description: advancePrompt.desc || '（手动推进）',
    })
    setAdvancePrompt(null)
    await refresh()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await deleteForeshadow(projectId, deleteTarget.id)
    setDeleteTarget(null)
    await refresh()
  }

  const handleSaveConfig = async () => {
    await saveForeshadowConfig(projectId, configForm)
    setForeshadowConfig(configForm)
    setShowConfig(false)
    await refresh()
  }

  // ─── Character multi-select ────────────

  const toggleCharacter = (name: string) => {
    setForm((f) => ({
      ...f,
      relatedCharacters: f.relatedCharacters.includes(name)
        ? f.relatedCharacters.filter((c) => c !== name)
        : [...f.relatedCharacters, name],
    }))
  }

  // ─── Chapter select helper ──────────────

  const renderChapterSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">（未选择）</option>
      {volumes.map((vol) => (
        <optgroup key={vol} label={vol}>
          {chapters
            .filter((c) => c.volume === vol)
            .sort((a, b) => a.order - b.order)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  )

  // ─── Render ─────────────────────────────
  return (
    <div className="foreshadow-panel">
      {/* ─── Stats bar ─────────────────────── */}
      <div className="foreshadow-stats">
        <span>总计 {counts.all}</span>
        <span className="stat-active">待处理 {counts.planted}</span>
        <span className="stat-advanced">推进中 {counts.advanced}</span>
        <span className="stat-done">已回收 {counts.resolved}</span>
        <span className="stat-abandoned">已废弃 {counts.abandoned}</span>
        <button className="btn-add" onClick={openAdd}>+ 新增伏笔</button>
        <button onClick={() => setShowInspireModal(true)} title="AI 分析伏笔机会" style={{ padding: '4px 12px', fontSize: '0.8rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', cursor: 'pointer', color: 'var(--text)', whiteSpace: 'nowrap' }}>🔍 灵感分析</button>
        <button className="btn-icon" onClick={() => { setConfigForm(foreshadowConfig); setShowConfig(!showConfig); }} title="伏笔配置">⚙</button>
      </div>

      {/* ─── Health Card ──────────────────────── */}
      {entries.length > 0 && (() => {
        const healthScore = calcForeshadowHealth(filtered, currentChapterId, chapters, foreshadowConfig)
        const healthLabel = getHealthLabel(healthScore)
        const resolvedCount = counts.resolved
        const activeCount = counts.planted + counts.advanced
        const recoveryRate = entries.length > 0 ? Math.round((resolvedCount / entries.length) * 100) : 0
        const classified = classifyForeshadows(filtered, currentChapterId, chapters, foreshadowConfig)
        const densityInfo = calcForeshadowDensity(filtered, currentChapterId, chapters)
        const densityStatus = densityInfo.density > foreshadowConfig.densityWarningThreshold
          ? '⚠️ 偏高'
          : densityInfo.totalChapters > 20 && densityInfo.density < foreshadowConfig.densityLowThreshold
            ? '📉 偏低'
            : '✅ 正常'
        return (
          <div className="foreshadow-health-card">
            <div className="foreshadow-health-score">
              📊 伏笔健康度 {healthScore}/100 {healthLabel}
            </div>
            <div>
              总数 {entries.length} | 已回收 {resolvedCount} | 活跃 {activeCount}
            </div>
            <div className="foreshadow-health-bar">
              <div className="foreshadow-health-bar-fill" style={{ width: `${recoveryRate}%` }} />
            </div>
            <div>
              {recoveryRate}% 回收率
            </div>
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
      })()}

      {/* ─── Config Panel ─────────────────────── */}
      {showConfig && (
        <div className="foreshadow-config-panel">
          <div className="form-group">
            <label>沉寂阈值（章）</label>
            <input type="number" min={5} max={50} step={1} value={configForm.dormantThreshold} onChange={(e) => setConfigForm({ ...configForm, dormantThreshold: Number(e.target.value) })} />
            <div className="config-hint">多少章无活动视为沉寂</div>
          </div>
          <div className="form-group">
            <label>近期预警窗口（章）</label>
            <input type="number" min={3} max={30} step={1} value={configForm.upcomingWindow} onChange={(e) => setConfigForm({ ...configForm, upcomingWindow: Number(e.target.value) })} />
            <div className="config-hint">未来多少章内视为即将到期</div>
          </div>
          <div className="form-group">
            <label>密度警告阈值</label>
            <input type="number" min={0.1} max={1.0} step={0.05} value={configForm.densityWarningThreshold} onChange={(e) => setConfigForm({ ...configForm, densityWarningThreshold: Number(e.target.value) })} />
            <div className="config-hint">活跃伏笔/总章节超过此值显示警告</div>
          </div>
          <div className="form-group">
            <label>密度偏低阈值</label>
            <input type="number" min={0.01} max={0.2} step={0.01} value={configForm.densityLowThreshold} onChange={(e) => setConfigForm({ ...configForm, densityLowThreshold: Number(e.target.value) })} />
            <div className="config-hint">低于此值建议增加伏笔（仅&gt;20章时）</div>
          </div>
          <div className="foreshadow-config-actions">
            <button className="btn-primary" onClick={handleSaveConfig}>保存</button>
            <button className="btn-text" onClick={() => { setConfigForm(foreshadowConfig); setShowConfig(false); }}>取消</button>
            <button className="btn-text" onClick={() => setConfigForm(DEFAULT_FORESHADOW_CONFIG)}>恢复默认</button>
          </div>
        </div>
      )}

      {/* ─── Filters ───────────────────────── */}
      <div className="foreshadow-filters">
        <div className="notes-filter">
          <button className={`tab-btn${statusFilter === 'all' ? ' active' : ''}`} onClick={() => handleStatusFilter('all')}>全部</button>
          <button className={`tab-btn${statusFilter === 'planted' ? ' active' : ''}`} onClick={() => handleStatusFilter('planted')}>待处理</button>
          <button className={`tab-btn${statusFilter === 'advanced' ? ' active' : ''}`} onClick={() => handleStatusFilter('advanced')}>推进中</button>
          <button className={`tab-btn${statusFilter === 'resolved' ? ' active' : ''}`} onClick={() => handleStatusFilter('resolved')}>已回收</button>
          <button className={`tab-btn${statusFilter === 'abandoned' ? ' active' : ''}`} onClick={() => handleStatusFilter('abandoned')}>已废弃</button>
          <button className={`tab-btn${statusFilter === 'inspire' ? ' active' : ''}`} onClick={() => handleStatusFilter('inspire')} style={statusFilter === 'inspire' ? {} : { color: inspireCount > 0 ? 'var(--accent)' : undefined }}>💡 灵感建议{inspireCount > 0 ? ` (${inspireCount})` : ''}</button>
        </div>
        <div className="notes-filter category-filter">
          <button className={`tab-btn${categoryFilter === 'all' ? ' active' : ''}`} onClick={() => handleCategoryFilter('all')}>全部分类</button>
          {(Object.entries(CATEGORY_LABELS) as [ForeshadowCategory, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`tab-btn${categoryFilter === key ? ' active' : ''}`}
              onClick={() => handleCategoryFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── List ──────────────────────────── */}
      {statusFilter === 'inspire' ? (
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
                {inspireResult.suggestions.map((s, i) => (
                  <SuggestionCard key={i} suggestion={s} onAdopt={(prefill) => {
                    setForm({ ...emptyForm(currentChapterId), name: prefill.name || '', description: prefill.description || '', plantedChapterId: prefill.plantedChapterId || currentChapterId || '', relatedCharacters: prefill.relatedCharacters || [] })
                    setEditingId(null)
                    setShowAdvanced(false)
                    setShowForm(true)
                    if (inspireResult) {
                      const updated = { ...inspireResult, suggestions: inspireResult.suggestions.filter((_, idx) => idx !== i) }
                      setInspireResult(updated)
                      saveInspiration(projectId, updated).catch(() => {})
                    }
                  }} />
                ))}
              </div>
             </>
           )}
         </div>
       ) : (
         <>
       <div className="foreshadow-list">
        {(() => {
          const classified = classifyForeshadows(filtered, currentChapterId, chapters, foreshadowConfig)
          return paged.map((entry) => {
            const urgency = getForeshadowUrgency(entry, classified)
            const plantedLabel = getChapterLabel(entry.plantedChapterId, chapters)
            const targetLabel = entry.targetChapterId
              ? getChapterLabel(entry.targetChapterId, chapters)
              : null
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
                  {IMPORTANCE_OPTIONS.find((o) => o.value === entry.importance)?.label ?? '★★★☆☆'}
                </span>
                <span className={`urgency-badge urgency-${urgency}`} title={URGENCY_TIPS[urgency]}>{URGENCY_LABELS[urgency]}</span>
              </div>
              <div className="foreshadow-desc">{entry.description}</div>
              <div className="foreshadow-meta">
                <span>埋入: {plantedLabel}</span>
                {entry.resolvedChapterId && (
                  <span>回收: {getChapterLabel(entry.resolvedChapterId, chapters)}</span>
                )}
                {targetLabel && (
                  <span>计划回收: {targetLabel}</span>
                )}
                {entry.resolutionPlan && (
                  <span>方式: {entry.resolutionPlan}</span>
                )}
              </div>
              {entry.relatedCharacters.length > 0 && (
                <div className="foreshadow-chars">
                  {entry.relatedCharacters.map((name) => (
                    <span
                      key={name}
                      className="foreshadow-char-chip"
                      onClick={() => onNavigateToCharacter?.(name)}
                      title={`查看角色「${name}」`}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              )}
              {entry.notes && (
                <div className="foreshadow-notes">{entry.notes}</div>
              )}
              {entry.clues.length > 0 && (
                <div className="foreshadow-clues">
                  <div className="foreshadow-clues-title">推进轨迹</div>
                  {entry.clues.map((clue, i) => (
                    <div key={i} className="foreshadow-clue-item">
                      <span className="foreshadow-clue-chapter">
                        {getChapterLabel(clue.chapterId, chapters)}
                      </span>
                      <span className="foreshadow-clue-desc">{clue.description}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="foreshadow-actions">
                {entry.status === 'planted' && (
                  <>
                    <button className="btn-text" onClick={() => handleStatusChange(entry, 'advanced')}>推进</button>
                    <button className="btn-text" onClick={() => handleStatusChange(entry, 'resolved')}>回收</button>
                    <button className="btn-text" onClick={() => handleStatusChange(entry, 'abandoned')}>废弃</button>
                  </>
                )}
                {entry.status === 'advanced' && (
                  <>
                    <button className="btn-text" onClick={() => handleStatusChange(entry, 'advanced')}>再推</button>
                    <button className="btn-text" onClick={() => handleStatusChange(entry, 'resolved')}>回收</button>
                    <button className="btn-text" onClick={() => handleStatusChange(entry, 'abandoned')}>废弃</button>
                  </>
                )}
                {(entry.status === 'resolved' || entry.status === 'abandoned') && (
                  <button className="btn-text" onClick={() => handleStatusChange(entry, 'planted')}>重开</button>
                )}
                <button className="btn-text" onClick={() => openEdit(entry)}>编辑</button>
                <button className="btn-text" style={{ color: 'var(--danger)' }} onClick={() => setDeleteTarget(entry)}>删除</button>
              </div>
            </div>
          )
          })
        })()}
        {filtered.length === 0 && <p className="foreshadow-empty">暂无伏笔</p>}
      </div>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={filtered.length}
        pageSize={pageSize}
        pageSizeOptions={[15, 30, 50]}
        onPageChange={(p) => {
          setPage(p)
          document.querySelector('.foreshadow-list')?.scrollTo(0, 0)
        }}
        onPageSizeChange={handlePageSizeChange}
      />
      </>
      )}
      {/* ─── Inspire modal ─────────────────── */}
      {showInspireModal && (
        <Modal>
          <div style={{ minWidth: 300 }}>
            <h3 style={{ marginBottom: 12 }}>AI 伏笔灵感分析</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 500 }}>分析范围</label>
              <select value={inspireVolume} onChange={(e) => setInspireVolume(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: '0.85rem' }}>
                <option value="all">全篇（所有章节）</option>
                {volumes.map((vol) => (<option key={vol} value={vol}>{vol}</option>))}
              </select>
            </div>
            {inspireError && <div style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: 8, padding: '6px', background: 'var(--bg-sidebar)', borderRadius: 4 }}>{inspireError}</div>}
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>AI 将通读所选范围章节，分析伏笔缺口、可呼应元素和密度分布。</div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => { void handleInspire() }} disabled={inspireLoading}>{inspireLoading ? '⏳ 分析中…' : '开始分析'}</button>
              <button className="btn-text" onClick={() => { setShowInspireModal(false); setInspireError(null) }}>取消</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Add/Edit Modal ─────────────────── */}
      {showForm && (
        <Modal className="foreshadow-form">
            <h3>{editingId ? '编辑伏笔' : '新增伏笔'}</h3>
            <div className="modal-scroll-body">
              {/* ── basic fields ─────────────────── */}
              <div className="form-group">
                <label>名称 *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="伏笔名称" maxLength={50} />
              </div>
              <div className="form-group">
                <label>描述 *</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="详细描述这个伏笔" rows={3} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>分类</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ForeshadowCategory })}>
                    {(Object.entries(CATEGORY_LABELS) as [ForeshadowCategory, string][]).map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
                  </select>
                </div>
                <div className="form-group">
                  <label>重要度</label>
                  <select value={form.importance} onChange={(e) => setForm({ ...form, importance: Number(e.target.value) })}>
                    {IMPORTANCE_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>埋设章节</label>
                {renderChapterSelect(form.plantedChapterId, (v) => setForm({ ...form, plantedChapterId: v }))}
              </div>

              {/* ── advanced toggle ──────────────── */}
              <div className="advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
                <span className={`arrow${showAdvanced ? ' open' : ''}`}>▶</span>
                高级设置
                {(form.targetChapterId || form.resolutionPlan || form.relatedCharacters.length > 0 || form.notes) && (
                  <span style={{ color: 'var(--accent)', marginLeft: 4 }}>（已填写）</span>
                )}
              </div>

              {showAdvanced && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label>计划回收章节</label>
                      {renderChapterSelect(form.targetChapterId, (v) => setForm({ ...form, targetChapterId: v }))}
                    </div>
                    <div className="form-group">
                      <label>回收方式</label>
                      <select value={form.resolutionPlan} onChange={(e) => setForm({ ...form, resolutionPlan: e.target.value })}>
                        <option value="">未设置</option>
                        <option value="揭示">揭示</option>
                        <option value="反转">反转</option>
                        <option value="呼应">呼应收束</option>
                        <option value="放弃">放弃</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>关联角色</label>
                    {characterNames.length === 0 ? (
                      <p className="form-hint">暂无角色记录，请在角色面板中创建</p>
                    ) : (
                      <>
                        <button type="button" className="character-dropdown-btn" onClick={() => setShowCharDropdown(!showCharDropdown)}>
                          已选 {form.relatedCharacters.length} 个角色 ▾
                        </button>
                        {showCharDropdown && (
                          <div className="character-dropdown-panel">
                            {characterNames.map((name) => (
                              <label key={name} className="character-dropdown-item">
                                <input type="checkbox" checked={form.relatedCharacters.includes(name)} onChange={() => toggleCharacter(name)} />
                                {name}
                              </label>
                            ))}
                          </div>
                        )}
                        <div className="character-chips">
                          {form.relatedCharacters.map((name) => (
                            <span key={name} className="character-chip">{name} <button type="button" onClick={() => toggleCharacter(name)}>×</button></span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="form-group">
                    <label>📋 推进轨迹</label>
                    <div className="clues-editor">
                      {form.clues.map((clue, idx) => (
                        <div key={idx} className="clue-row">
                          {renderChapterSelect(clue.chapterId, (v) => {
                            const next = [...form.clues]; next[idx] = { ...next[idx]!, chapterId: v }; setForm({ ...form, clues: next })
                          })}
                          <input value={clue.description} onChange={(e) => {
                            const next = [...form.clues]; next[idx] = { ...next[idx]!, description: e.target.value }; setForm({ ...form, clues: next })
                          }} placeholder="推进描述（如：在第5章通过对话暗示...）" />
                          <button type="button" className="btn-text btn-sm" onClick={() => {
                            setForm({ ...form, clues: form.clues.filter((_, i) => i !== idx) })
                          }}>删除</button>
                        </div>
                      ))}
                      <button type="button" className="btn-text" onClick={() => {
                        setForm({ ...form, clues: [...form.clues, { chapterId: '', description: '', timestamp: new Date().toISOString() }] })
                      }}>+ 添加推进记录</button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>备注</label>
                    <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="补充说明" rows={2} />
                  </div>
                </>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-primary" disabled={!form.name.trim() || !form.description.trim()} onClick={handleSave}>保存</button>
              <button className="btn-text" onClick={() => setShowForm(false)}>取消</button>
            </div>
        </Modal>
      )}

      {/* ─── Advance prompt modal ──────────── */}
      {advancePrompt && (
        <Modal className="foreshadow-advance-modal">
            <h3>推进伏笔</h3>
            <p>记录推进内容（可选）：</p>
            <textarea
              value={advancePrompt.desc}
              onChange={(e) => setAdvancePrompt({ ...advancePrompt, desc: e.target.value })}
              placeholder="如：在第N章通过角色对话暗示..."
              rows={3}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn-primary" onClick={handleAdvanceConfirm}>确认推进</button>
              <button className="btn-text" onClick={() => setAdvancePrompt(null)}>取消</button>
            </div>
        </Modal>
      )}

      {/* ─── Delete confirm modal ──────────── */}
      {deleteTarget && (
        <Modal className="foreshadow-delete-modal">
            <h3>删除伏笔</h3>
            <p>
              确定删除「{deleteTarget.name}」？
              <br />
              <small>埋设于 {getChapterLabel(deleteTarget.plantedChapterId, chapters)}</small>
            </p>
            <div className="modal-actions">
              <button className="btn-danger" onClick={handleDelete}>确定删除</button>
              <button className="btn-text" onClick={() => setDeleteTarget(null)}>取消</button>
            </div>
        </Modal>
      )}
    </div>
  )
}
