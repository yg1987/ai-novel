import { useState, useEffect, useCallback } from 'react'
import type { ForeshadowEntry, ForeshadowInspiration, ForeshadowStatus } from '../types/novel'
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
import { runForeshadowInspire } from '../services/foreshadowInspire'
import { usePagination } from '../hooks/usePagination'
import ForeshadowStatsBar from './foreshadow-panel/ForeshadowStatsBar'
import ForeshadowHealthCard from './foreshadow-panel/ForeshadowHealthCard'
import ForeshadowConfigPanel from './foreshadow-panel/ForeshadowConfigPanel'
import ForeshadowFilters from './foreshadow-panel/ForeshadowFilters'
import ForeshadowList from './foreshadow-panel/ForeshadowList'
import ForeshadowDialogs from './foreshadow-panel/ForeshadowDialogs'
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
  currentChapterId: string | null
  onNavigateToCharacter?: (name: string) => void
  highlightId?: string | null
  onHighlightComplete?: () => void
}

export default function ForeshadowPanel({ projectId, currentChapterId, onNavigateToCharacter, highlightId, onHighlightComplete }: Props) {
  const [entries, setEntries] = useState<ForeshadowEntry[]>([])
  const [chapters, setChapters] = useState<ChapterMeta[]>([])
  const [characterNames, setCharacterNames] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ForeshadowFormData>(emptyForeshadowForm(currentChapterId))
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
    const [store, chapterList, characterFiles, config] = await Promise.all([
      loadForeshadows(projectId),
      listChapters(projectId),
      listProjectFiles(projectId, 'characters').catch(() => []),
      loadForeshadowConfig(projectId),
    ])
    setEntries(store.entries)
    setChapters(chapterList)
    setForeshadowConfig(config)
    setCharacterNames(
      characterFiles
        .filter((file) => file.name.endsWith('.md'))
        .map((file) => file.name.replace(/\.md$/, '')),
    )
  }, [projectId])

  useEffect(() => { refresh().catch(console.error) }, [refresh])
  useEffect(() => {
    loadInspiration(projectId).then((saved) => {
      if (saved) setInspireResult(saved)
    }).catch(() => {})
  }, [projectId])

  useEffect(() => {
    if (!editingId) {
      setForm((prev) => ({ ...prev, plantedChapterId: currentChapterId ?? prev.plantedChapterId }))
    }
  }, [currentChapterId, editingId])

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
    setForm(emptyForeshadowForm(currentChapterId))
    setShowAdvanced(false)
    setShowCharDropdown(false)
    setShowForm(true)
  }

  const openEdit = (entry: ForeshadowEntry) => {
    setEditingId(entry.id)
    setForm(entryToForeshadowForm(entry))
    setShowAdvanced(!!entry.targetChapterId || !!entry.resolutionPlan || !!entry.notes)
    setShowCharDropdown(false)
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
      ...emptyForeshadowForm(currentChapterId),
      name: prefill.name || '',
      description: prefill.description || '',
      plantedChapterId: prefill.plantedChapterId || currentChapterId || '',
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

  const toggleCharacter = (name: string) => {
    setForm((prev) => ({
      ...prev,
      relatedCharacters: prev.relatedCharacters.includes(name)
        ? prev.relatedCharacters.filter((character) => character !== name)
        : [...prev.relatedCharacters, name],
    }))
  }

  const renderChapterSelect = (value: string, onChange: (value: string) => void) => (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">（未选择）</option>
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

  return (
    <div className="foreshadow-panel">
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
        currentChapterId={currentChapterId}
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
        currentChapterId={currentChapterId}
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
        showAdvanced={showAdvanced}
        showCharDropdown={showCharDropdown}
        characterNames={characterNames}
        renderChapterSelect={renderChapterSelect}
        onFormChange={setForm}
        onToggleAdvanced={() => setShowAdvanced((prev) => !prev)}
        onToggleCharacter={toggleCharacter}
        onToggleCharDropdown={() => setShowCharDropdown((prev) => !prev)}
        onCloseForm={() => setShowForm(false)}
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
