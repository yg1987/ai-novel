import { useState, useEffect, useCallback } from 'react'
import type { ForeshadowEntry, ForeshadowInspiration, ForeshadowStatus } from '../types/novel'
import type { CharacterRecord } from '../types/character'
import { DEFAULT_FORESHADOW_CONFIG } from '../types/novel'
import type { ChapterMeta, ChapterRef } from '../types/chapter'
import { chapterRefKey } from '../services/chapterDisplay'
import { buildChapterSequence, formatChapterId } from '../services/chapterCatalog'
import type { BrainstormForeshadowDraft } from '../types/brainstorm'
import { listChapters } from '../api/tauri'
import { loadCharacterCatalog, resolveCharacterName } from '../services/characterCatalog'
import { loadCharacterModuleConfig } from '../services/characterConfig'
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
  initializeNewForeshadows,
} from '../services/foreshadowStorage'
import { runForeshadowInspire } from '../services/foreshadowInspire'
import { usePagination } from '../hooks/usePagination'
import ForeshadowStatsBar from './foreshadow-panel/ForeshadowStatsBar'
import ForeshadowHealthCard from './foreshadow-panel/ForeshadowHealthCard'
import ForeshadowConfigPanel from './foreshadow-panel/ForeshadowConfigPanel'
import ForeshadowFilters from './foreshadow-panel/ForeshadowFilters'
import ForeshadowList from './foreshadow-panel/ForeshadowList'
import ForeshadowDialogs from './foreshadow-panel/ForeshadowDialogs'
import Modal from './Modal'
import Button from './Button'
import {
  DEFAULT_PAGE_SIZE,
  emptyForeshadowForm,
  entryToForeshadowForm,
  type ForeshadowFormData,
  type ForeshadowSuggestionPrefill,
} from './foreshadow-panel/foreshadowPanelUtils'
import './foreshadow-panel/ForeshadowPanel.css'

interface Props {
  projectId: string
  currentChapter: ChapterRef | null
  onNavigateToCharacter?: (characterId: string) => void
  highlightId?: string | null
  onHighlightComplete?: () => void
  initialDraft?: BrainstormForeshadowDraft | null
  onInitialDraftConsumed?: () => void
}

export default function ForeshadowPanel({ projectId, currentChapter, onNavigateToCharacter, highlightId, onHighlightComplete, initialDraft, onInitialDraftConsumed }: Props) {
  const [entries, setEntries] = useState<ForeshadowEntry[]>([])
  const [chapters, setChapters] = useState<ChapterMeta[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [characterNames, setCharacterNames] = useState<string[]>([])
  const [characterRecords, setCharacterRecords] = useState<CharacterRecord[]>([])
  const [migrationPreview, setMigrationPreview] = useState<{ unresolvedNames: string[] } | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [showForm, setShowForm] = useState(() => Boolean(initialDraft))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ForeshadowFormData>(() => initialDraft ? {
    ...emptyForeshadowForm(currentChapter),
    name: initialDraft.name,
    description: initialDraft.description,
    plantedChapter: initialDraft.plantedChapter ?? currentChapter,
    relatedCharacters: initialDraft.relatedCharacters,
    notes: initialDraft.notes,
  } : emptyForeshadowForm(currentChapter))
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
  const [storageError, setStorageError] = useState<string | null>(null)
  const [showInitialize, setShowInitialize] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const moduleConfig = await loadCharacterModuleConfig(projectId)
      const [store, chapterList, catalogResult, config] = await Promise.all([
        loadForeshadows(projectId),
        listChapters(projectId),
        loadCharacterCatalog(projectId, moduleConfig),
        loadForeshadowConfig(projectId),
      ])
      setEntries(store.entries)
      setChapters(chapterList)
      setForeshadowConfig(config)
      setCharacterRecords(catalogResult.catalog.records)
      setCharacterNames(catalogResult.catalog.records.map((record) => record.name))
      setMigrationPreview(store.migration ? { unresolvedNames: store.migration.unresolvedNames } : null)
      setStorageError(null)
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : String(error))
    }
  }, [projectId])

  useEffect(() => { refresh().catch(console.error) }, [refresh])
  useEffect(() => {
    loadInspiration(projectId).then((saved) => {
      if (saved) setInspireResult(saved)
    }).catch(() => {})
  }, [projectId])

  useEffect(() => {
    if (!highlightId) return
    const el = document.getElementById(`foreshadow-${highlightId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('foreshadow-highlight')
    const timer = window.setTimeout(() => {
      el.classList.remove('foreshadow-highlight')
      onHighlightComplete?.()
    }, 3000)
    return () => window.clearTimeout(timer)
  }, [highlightId, onHighlightComplete])

  useEffect(() => {
    if (!initialDraft || !onInitialDraftConsumed) return
    const timer = window.setTimeout(onInitialDraftConsumed, 0)
    return () => window.clearTimeout(timer)
  }, [initialDraft, onInitialDraftConsumed])

  const volumes = [...new Set(chapters.map((chapter) => chapter.volume))].sort()
  const filtered = entries.filter((entry) => {
    if (statusFilter === 'inspire') return false
    if (statusFilter !== 'all' && entry.status !== statusFilter) return false
    if (categoryFilter !== 'all' && entry.category !== categoryFilter) return false
    return true
  })
  const inspireCount = inspireResult?.suggestions.length ?? 0
  const { paged, page, setPage, totalPages, reset } = usePagination(filtered, pageSize)
  const counts = {
    all: entries.length,
    planted: entries.filter((entry) => entry.status === 'planted').length,
    advanced: entries.filter((entry) => entry.status === 'advanced').length,
    resolved: entries.filter((entry) => entry.status === 'resolved').length,
    abandoned: entries.filter((entry) => entry.status === 'abandoned').length,
  }

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status)
    reset()
  }

  const handleCategoryFilter = (category: string) => {
    setCategoryFilter(category)
    reset()
  }

  const handlePageSizeChange = (nextPageSize: number) => {
    setPageSize(nextPageSize)
    reset()
  }

  const openAdd = () => {
    setEditingId(null)
    setForm(emptyForeshadowForm(currentChapter))
    setShowAdvanced(false)
    setShowCharDropdown(false)
    setFormError(null)
    setShowForm(true)
  }

  const openEdit = (entry: ForeshadowEntry) => {
    setEditingId(entry.id)
    const next = entryToForeshadowForm(entry)
    if (entry.plannedResolutionChapter && !chapters.some((chapter) => (
      chapter.volume === entry.plannedResolutionChapter?.volume
      && chapter.id === entry.plannedResolutionChapter.chapterId
    ))) next.plannedResolutionMode = 'future'
    setForm(next)
    setShowAdvanced(!!entry.plannedResolutionChapter || !!entry.resolutionPlan || !!entry.notes)
    setShowCharDropdown(false)
    setFormError(null)
    setShowForm(true)
  }

  const handleInspire = async () => {
    setInspireLoading(true)
    setInspireError(null)
    try {
      const result = await runForeshadowInspire({ projectId, volume: inspireVolume })
      setInspireResult(result)
      saveInspiration(projectId, result).catch(() => {})
    } catch (error) {
      setInspireError(error instanceof Error ? error.message : String(error))
    } finally {
      setInspireLoading(false)
      setShowInspireModal(false)
    }
  }

  const handleAdoptSuggestion = (index: number, prefill: ForeshadowSuggestionPrefill) => {
    setForm({
      ...emptyForeshadowForm(currentChapter),
      name: prefill.name || '',
      description: prefill.description || '',
      plantedChapter: prefill.plantedChapter ?? currentChapter,
      relatedCharacters: prefill.relatedCharacters || [],
    })
    setEditingId(null)
    setShowAdvanced(false)
    setShowCharDropdown(false)
    setShowForm(true)
    if (inspireResult) {
      const updated = {
        ...inspireResult,
        suggestions: inspireResult.suggestions.filter((_, suggestionIndex) => suggestionIndex !== index),
      }
      setInspireResult(updated)
      saveInspiration(projectId, updated).catch(() => {})
    }
  }

  const handleSave = async () => {
    if (!form.plantedChapter) return
    setFormError(null)
    const futureOrder = Number(form.futureResolutionOrder)
    const plannedResolutionChapter = form.plannedResolutionMode === 'future'
      ? (form.futureResolutionVolume && Number.isInteger(futureOrder) && futureOrder > 0
        ? { volume: form.futureResolutionVolume, chapterId: formatChapterId(futureOrder) }
        : undefined)
      : form.plannedResolutionChapter ?? undefined
    if (form.plannedResolutionMode === 'future' && plannedResolutionChapter) {
      const sequence = buildChapterSequence(chapters)
      const alreadyWritten = chapters.some((chapter) => (
        chapter.volume === plannedResolutionChapter.volume && chapter.id === plannedResolutionChapter.chapterId
      ))
      const futureSequence = buildChapterSequence([...chapters, {
        volume: plannedResolutionChapter.volume,
        id: plannedResolutionChapter.chapterId,
        order: futureOrder,
        title: '',
      }])
      const plannedPosition = futureSequence.positionByKey.get(chapterRefKey(plannedResolutionChapter))
      if (alreadyWritten || plannedPosition !== sequence.lastWrittenPosition + 1) {
        setFormError('未来章节必须位于当前最后一章之后，且尚未创建正文。')
        return
      }
    }
    const now = new Date().toISOString().slice(0, 16)
    const relatedCharacterIds = form.relatedCharacters.flatMap((name) => resolveCharacterName(characterRecords, name).characterId ?? [])
    if (editingId) {
      await updateForeshadow(projectId, editingId, {
        name: form.name,
        description: form.description,
        category: form.category,
        importance: form.importance,
        plantedChapter: form.plantedChapter,
        plannedResolutionChapter,
        progress: form.progress,
        relatedCharacters: form.relatedCharacters,
        relatedCharacterIds,
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
        plantedChapter: form.plantedChapter,
        plannedResolutionChapter,
        progress: form.progress,
        relatedCharacters: form.relatedCharacters,
        relatedCharacterIds,
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
    if (!currentChapter) return
    await changeStatus(projectId, advancePrompt.entryId, 'advanced', {
      chapter: currentChapter,
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

  const handleInitialize = async () => {
    await initializeNewForeshadows(projectId)
    setShowInitialize(false)
    await refresh()
  }

  const toggleCharacter = (name: string) => {
    setForm((prev) => ({
      ...prev,
      relatedCharacters: prev.relatedCharacters.includes(name)
        ? prev.relatedCharacters.filter((character) => character !== name)
        : [...prev.relatedCharacters, name],
    }))
  }

  const renderChapterSelect = (value: ChapterRef | null | undefined, onChange: (value: ChapterRef | null) => void) => (
    <select
      value={value ? chapterRefKey(value) : ''}
      onChange={(event) => {
        const next = chapters.find((chapter) => chapterRefKey(chapter) === event.target.value)
        onChange(next ? { volume: next.volume, chapterId: next.id } : null)
      }}
    >
      <option value="">（未选择）</option>
      {volumes.map((volume) => (
        <optgroup key={volume} label={volume}>
          {chapters
            .filter((chapter) => chapter.volume === volume)
            .sort((a, b) => a.order - b.order)
            .map((chapter) => (
              <option key={chapterRefKey(chapter)} value={chapterRefKey(chapter)}>
                {chapter.title}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  )

  if (storageError) {
    return (
      <div className="foreshadow-panel">
        <div className="foreshadow-empty">
          <p>{storageError}</p>
          <Button variant="danger" size="sm" onClick={() => setShowInitialize(true)}>初始化新伏笔数据</Button>
        </div>
        {showInitialize && (
          <Modal>
            <h3>初始化新伏笔数据</h3>
            <p>确认后会先备份并校验 `memory/foreshadows.json` 和旧伏笔灵感缓存，再创建新的空伏笔数据。章节正文、细纲和其他项目数据不会被删除。</p>
            <div className="dialog-footer">
              <Button variant="text" size="sm" onClick={() => setShowInitialize(false)}>取消</Button>
              <Button variant="danger" size="md" onClick={() => { void handleInitialize() }}>确认初始化</Button>
            </div>
          </Modal>
        )}
      </div>
    )
  }

  return (
    <div className="foreshadow-panel">
      {migrationPreview && (
        <div className="foreshadow-migration-banner">
          <strong>旧版伏笔数据待迁移</strong>
          <span>当前仅在内存中预览稳定角色引用；下次保存时会先备份并校验原文件，再写入 v2。</span>
          {migrationPreview.unresolvedNames.length > 0 && <span>未解析角色：{migrationPreview.unresolvedNames.join('、')}</span>}
        </div>
      )}
      <ForeshadowStatsBar
        counts={counts}
        onAdd={openAdd}
        onOpenInspire={() => setShowInspireModal(true)}
        onToggleConfig={() => {
          setConfigForm(foreshadowConfig)
          setShowConfig((prev) => !prev)
        }}
      />
      <ForeshadowHealthCard
        entries={entries}
        filteredEntries={filtered}
        currentChapterRef={currentChapter}
        chapters={chapters}
        config={foreshadowConfig}
        counts={counts}
      />
      {showConfig && (
        <ForeshadowConfigPanel
          configForm={configForm}
          savedConfig={foreshadowConfig}
          onChange={setConfigForm}
          onCancel={() => setShowConfig(false)}
          onSave={() => { void handleSaveConfig() }}
        />
      )}
      <ForeshadowFilters
        statusFilter={statusFilter}
        categoryFilter={categoryFilter}
        inspireCount={inspireCount}
        onStatusFilter={handleStatusFilter}
        onCategoryFilter={handleCategoryFilter}
      />
      <ForeshadowList
        statusFilter={statusFilter}
        inspireResult={inspireResult}
        currentChapterRef={currentChapter}
        chapters={chapters}
        config={foreshadowConfig}
        filteredEntries={filtered}
        pagedEntries={paged}
        page={page}
        totalPages={totalPages}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
        onAdoptSuggestion={handleAdoptSuggestion}
        onNavigateToCharacter={onNavigateToCharacter}
        resolveCharacterId={(name) => resolveCharacterName(characterRecords, name).characterId}
        onStatusChange={handleStatusChange}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
      />
      <ForeshadowDialogs
        showInspireModal={showInspireModal}
        inspireVolume={inspireVolume}
        volumes={volumes}
        inspireError={inspireError}
        inspireLoading={inspireLoading}
        onInspireVolumeChange={setInspireVolume}
        onCloseInspire={() => {
          setShowInspireModal(false)
          setInspireError(null)
        }}
        onConfirmInspire={handleInspire}
        showForm={showForm}
        editingId={editingId}
        form={form}
        formError={formError}
        showAdvanced={showAdvanced}
        showCharDropdown={showCharDropdown}
        characterNames={characterNames}
        renderChapterSelect={renderChapterSelect}
        onFormChange={(next) => {
          setFormError(null)
          setForm(next)
        }}
        onToggleAdvanced={() => setShowAdvanced((prev) => !prev)}
        onToggleCharacter={toggleCharacter}
        onToggleCharDropdown={() => setShowCharDropdown((prev) => !prev)}
        onCloseForm={() => { setFormError(null); setShowForm(false) }}
        onSaveForm={handleSave}
        advancePrompt={advancePrompt}
        onAdvancePromptChange={setAdvancePrompt}
        onCloseAdvance={() => setAdvancePrompt(null)}
        onConfirmAdvance={handleAdvanceConfirm}
        deleteTarget={deleteTarget}
        chapters={chapters}
        onCloseDelete={() => setDeleteTarget(null)}
        onConfirmDelete={handleDelete}
      />
    </div>
  )
}
