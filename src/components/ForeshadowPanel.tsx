import { useState, useEffect, useCallback } from 'react'
import type { ForeshadowEntry, ForeshadowStatus, ForeshadowCategory, ForeshadowClue } from '../types/novel'
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
} from '../services/foreshadowStorage'
import { classifyForeshadows, type ForeshadowUrgency } from '../services/foreshadowContext'
import Pagination from './Pagination'
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
  active: '🔵 推进中',
  background: '⚪ 已埋设',
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
    if (statusFilter !== 'all' && e.status !== statusFilter) return false
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false
    return true
  })

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
      </div>

      {/* ─── Filters ───────────────────────── */}
      <div className="foreshadow-filters">
        <div className="notes-filter">
          <button className={`tab-btn${statusFilter === 'all' ? ' active' : ''}`} onClick={() => handleStatusFilter('all')}>全部</button>
          <button className={`tab-btn${statusFilter === 'planted' ? ' active' : ''}`} onClick={() => handleStatusFilter('planted')}>待处理</button>
          <button className={`tab-btn${statusFilter === 'advanced' ? ' active' : ''}`} onClick={() => handleStatusFilter('advanced')}>推进中</button>
          <button className={`tab-btn${statusFilter === 'resolved' ? ' active' : ''}`} onClick={() => handleStatusFilter('resolved')}>已回收</button>
          <button className={`tab-btn${statusFilter === 'abandoned' ? ' active' : ''}`} onClick={() => handleStatusFilter('abandoned')}>已废弃</button>
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
                <span className={`urgency-badge urgency-${urgency}`}>{URGENCY_LABELS[urgency]}</span>
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

      {/* ─── Add/Edit Modal ─────────────────── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content foreshadow-form" onClick={(e) => e.stopPropagation()}>
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
          </div>
        </div>
      )}

      {/* ─── Advance prompt modal ──────────── */}
      {advancePrompt && (
        <div className="modal-overlay" onClick={() => setAdvancePrompt(null)}>
          <div className="modal-content foreshadow-advance-modal" onClick={(e) => e.stopPropagation()}>
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
          </div>
        </div>
      )}

      {/* ─── Delete confirm modal ──────────── */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-content foreshadow-delete-modal" onClick={(e) => e.stopPropagation()}>
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
          </div>
        </div>
      )}
    </div>
  )
}
