import { useState, useEffect, useCallback, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import { readProjectFile, writeProjectFile, loadProviderConfig } from '../api/tauri'
import { buildAIContext } from '../services/aiContext'
import { loadPrompt, savePrompt, resetPrompt } from '../services/aiPrompts'
import type { TextareaSelection } from '../services/rewriteUtils'
import { getTextareaSelection, applyTextareaRewrite } from '../services/rewriteUtils'
import { type RewriteMode } from '../services/rewriteService'
import type { ContextMenuAction } from './SelectionContextMenu'
import {
  type SectionDef,
  type SubField,
  loadSections,
  loadSectionsGenre,
  saveSections,
  getDefaultSections,
} from '../services/worldviewConfig'
import WorldviewBanner from './worldview-panel/WorldviewBanner'
import WorldviewSidebar from './worldview-panel/WorldviewSidebar'
import WorldviewEditor from './worldview-panel/WorldviewEditor'
import WorldviewDialogs from './worldview-panel/WorldviewDialogs'
import {
  buildWorldviewContent,
  getWorldviewDefaultPrompt,
  parseWorldviewSubs,
} from './worldview-panel/worldviewMarkdown'

interface Props {
  projectId: string
}

export default function WorldviewPanel({ projectId }: Props) {
  const [sections, setSections] = useState<SectionDef[]>([])
  const [activeSection, setActiveSection] = useState<SectionDef | null>(null)
  const [content, setContent] = useState('')
  const [subValues, setSubValues] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [showExample, setShowExample] = useState<string | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [rewriteState, setRewriteState] = useState<(TextareaSelection & { mode: RewriteMode; subKey?: string }) | null>(null)
  const [hasSelection, setHasSelection] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [editingSectionLabel, setEditingSectionLabel] = useState('')
  const [showAddSection, setShowAddSection] = useState(false)
  const [newSectionName, setNewSectionName] = useState('')

  const [editingSubKey, setEditingSubKey] = useState<string | null>(null)
  const [editingSubLabel, setEditingSubLabel] = useState('')
  const [newSubFieldName, setNewSubFieldName] = useState('')
  const [addingSubToKey, setAddingSubToKey] = useState<string | null>(null)

  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [deletingSectionId, setDeletingSectionId] = useState<string | null>(null)
  const [genre, setGenre] = useState<string>('玄幻')
  const [savedGenre, setSavedGenre] = useState<string | null>(null)
  const [genreMismatchDismissed, setGenreMismatchDismissed] = useState(false)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [generatingAi, setGeneratingAi] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const rewriteTextareaRef = useRef<HTMLTextAreaElement>(null)
  const subFieldEndRef = useRef<HTMLDivElement>(null)
  const sectionsRef = useRef(sections)

  useEffect(() => {
    sectionsRef.current = sections
  }, [sections])

  const genreMismatch = savedGenre !== null && savedGenre !== genre && !genreMismatchDismissed
  const promptKey = activeSection ? `worldview_${activeSection.key}` : ''
  const hasSubs = activeSection ? activeSection.subs.length > 0 : false
  const isFreeform = !hasSubs

  const checkSelection = useCallback((event: MouseEvent<HTMLTextAreaElement> | KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = event.currentTarget
    setHasSelection(ta.selectionStart !== ta.selectionEnd)
  }, [])

  const handleSelectionContextMenu = useCallback((event: MouseEvent<HTMLTextAreaElement>) => {
    const ta = event.currentTarget
    if (ta.selectionStart !== ta.selectionEnd) {
      event.preventDefault()
      setContextMenu({ x: event.clientX, y: event.clientY })
    }
  }, [])

  const scrollToNewSubField = useCallback(() => {
    requestAnimationFrame(() => {
      subFieldEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }, [])

  useEffect(() => {
    const init = async () => {
      let projectGenre = '玄幻'
      try {
        const metaRaw = await readProjectFile(projectId, '', 'project.json')
        const meta = JSON.parse(metaRaw) as { genre?: string }
        if (meta.genre) projectGenre = meta.genre
      } catch {
        // Project metadata is optional for older projects.
      }
      setGenre(projectGenre)

      let loadedSections = await loadSections(projectId)
      if (!loadedSections || loadedSections.length === 0) {
        loadedSections = getDefaultSections(projectGenre)
        await saveSections(projectId, loadedSections, projectGenre)
      }
      setSections(loadedSections)
      setSavedGenre(await loadSectionsGenre(projectId))

      if (loadedSections.length > 0) {
        setActiveSection(loadedSections[0]!)
      }
      setConfigLoaded(true)
    }
    void init()
  }, [projectId])

  useEffect(() => {
    if (!configLoaded) return
    saveSections(projectId, sectionsRef.current).catch(console.error)
  }, [sections, configLoaded, projectId])

  useEffect(() => {
    if (!activeSection) return
    loadPrompt(projectId, promptKey).then((saved) => {
      setEditingPrompt(saved ?? '')
      setShowPrompt(false)
    }).catch(() => {})
  }, [projectId, promptKey, activeSection])

  useEffect(() => {
    if (!activeSection) return
    readProjectFile(projectId, 'worldview', activeSection.file)
      .then((nextContent) => {
        setContent(nextContent)
        setSubValues(parseWorldviewSubs(nextContent, activeSection.subs.map((s) => s.key)))
        setDirty(false)
      })
      .catch(console.error)
  }, [projectId, activeSection])

  const handleSave = async () => {
    if (!activeSection) return
    if (hasSubs) {
      await writeProjectFile(projectId, 'worldview', activeSection.file, buildWorldviewContent(activeSection.label, subValues))
    } else {
      await writeProjectFile(projectId, 'worldview', activeSection.file, content)
    }
    setEditing(false)
    setDirty(false)
  }

  const handleStartEdit = () => {
    if (!activeSection) return
    setSubValues(parseWorldviewSubs(content, activeSection.subs.map((s) => s.key)))
    setEditing(true)
  }

  const updateSubField = (key: string, value: string) => {
    setSubValues((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const handleSelectSection = (section: SectionDef) => {
    setActiveSection(section)
    setEditing(false)
  }

  const handleStartRenameSection = (section: SectionDef) => {
    setEditingSectionId(section.key)
    setEditingSectionLabel(section.label)
  }

  const handleRenameSection = (sectionId: string) => {
    const newLabel = editingSectionLabel.trim()
    if (!newLabel) return
    setSections((prev) => prev.map((section) => (
      section.key === sectionId ? { ...section, label: newLabel } : section
    )))
    setActiveSection((prev) => (
      prev?.key === sectionId ? { ...prev, label: newLabel } : prev
    ))
    setEditingSectionId(null)
  }

  const handleDeleteSection = (sectionId: string) => {
    const section = sections.find((item) => item.key === sectionId)
    if (!section) return
    writeProjectFile(projectId, 'worldview', section.file, '')
      .then(() => {
        setSections((prev) => {
          const next = prev.filter((item) => item.key !== sectionId)
          if (next.length === 0) return prev
          if (activeSection?.key === sectionId) setActiveSection(next[0]!)
          return next
        })
      })
      .catch(console.error)
    setDeletingSectionId(null)
  }

  const handleToggleAddSection = (show: boolean) => {
    setShowAddSection(show)
    if (!show) setNewSectionName('')
  }

  const handleAddSection = () => {
    const name = newSectionName.trim()
    if (!name) return
    const id = `custom_${Date.now()}`
    const newSection: SectionDef = {
      key: id,
      label: name,
      file: `${id}.md`,
      hint: `填写${name}的相关设定`,
      subs: [],
    }
    setSections((prev) => [...prev, newSection])
    setActiveSection(newSection)
    setEditing(false)
    setShowAddSection(false)
    setNewSectionName('')
  }

  const handleRenameSubField = (sectionKey: string, oldSubKey: string) => {
    const newLabel = editingSubLabel.trim()
    if (!newLabel) return
    const newKey = newLabel
    const updatedSections = sections.map((section) => {
      if (section.key !== sectionKey) return section
      return {
        ...section,
        subs: section.subs.map((sub) => (
          sub.key === oldSubKey ? { ...sub, key: newKey, label: newLabel } : sub
        )),
      }
    })
    setSections(updatedSections)
    if (activeSection?.key === sectionKey) {
      const updated = updatedSections.find((section) => section.key === sectionKey)
      if (updated) setActiveSection(updated)
    }
    if (oldSubKey !== newKey) {
      setSubValues((prev) => {
        const next = { ...prev }
        if (oldSubKey in next) {
          next[newKey] = next[oldSubKey]!
          delete next[oldSubKey]
        }
        return next
      })
    }
    setEditingSubKey(null)
  }

  const handleDeleteSubField = (sectionKey: string, subKey: string) => {
    const updatedSections = sections.map((section) => {
      if (section.key !== sectionKey) return section
      return { ...section, subs: section.subs.filter((sub) => sub.key !== subKey) }
    })
    setSections(updatedSections)
    if (activeSection?.key === sectionKey) {
      const updated = updatedSections.find((section) => section.key === sectionKey)
      if (updated) setActiveSection(updated)
    }
    setSubValues((prev) => {
      const next = { ...prev }
      delete next[subKey]
      return next
    })
  }

  const handleAddSubField = (sectionKey: string) => {
    const name = newSubFieldName.trim()
    if (!name) return
    const newSub: SubField = {
      key: name,
      label: name,
      hint: `填写${name}的相关内容`,
    }
    const wasFreeform = sections.find((section) => section.key === sectionKey)?.subs.length === 0
    const updatedSections = sections.map((section) => {
      if (section.key !== sectionKey) return section
      return { ...section, subs: [...section.subs, newSub] }
    })
    setSections(updatedSections)
    if (activeSection?.key === sectionKey) {
      const updated = updatedSections.find((section) => section.key === sectionKey)
      if (updated) setActiveSection(updated)
    }
    if (wasFreeform && content.trim()) {
      setSubValues((prev) => ({ ...prev, [name]: content }))
      setContent('')
    } else {
      setSubValues((prev) => ({ ...prev, [name]: '' }))
    }
    setNewSubFieldName('')
    setAddingSubToKey(null)
    scrollToNewSubField()
  }

  const handleCancelAddSubField = () => {
    setAddingSubToKey(null)
    setNewSubFieldName('')
  }

  const handleResetToDefaults = () => {
    const defaults = getDefaultSections(genre)
    setSections(defaults)
    setSavedGenre(genre)
    setGenreMismatchDismissed(false)
    saveSections(projectId, defaults, genre).catch(console.error)
    if (defaults.length > 0) setActiveSection(defaults[0]!)
    setEditing(false)
    setDirty(false)
    setShowResetConfirm(false)
  }

  const generateWithAI = async () => {
    if (!activeSection) return
    setGeneratingAi(true)
    setAiError(null)
    try {
      const config = await loadProviderConfig()
      const provider = config.providers.find((item) => item.name === config.active_profile)
      if (!provider) throw new Error('未配置 AI Provider')
      if (!provider.models.analysis) throw new Error('未配置分析模型，请在 AI 配置中设置')

      const context = await buildAIContext(projectId)
      const base = provider.base_url.replace(/\/+$/, '')
      const systemPrompt = editingPrompt.trim() || getWorldviewDefaultPrompt(activeSection, hasSubs)
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.api_key}`,
        },
        body: JSON.stringify({
          model: provider.models.analysis,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: context || `请为${activeSection.label}生成内容` },
          ],
          temperature: 0.8,
          max_tokens: 2048,
        }),
      })
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
      const raw = data.choices?.[0]?.message?.content ?? ''

      if (hasSubs) {
        const parsed = parseWorldviewSubs(raw, activeSection.subs.map((s) => s.key))
        setSubValues((prev) => {
          const merged = { ...prev }
          let changed = false
          for (const [key, val] of Object.entries(parsed)) {
            if (val.trim() && !prev[key]?.trim()) {
              merged[key] = val.trim()
              changed = true
            }
          }
          if (!changed) {
            for (const [key, val] of Object.entries(parsed)) {
              if (val.trim()) merged[key] = val.trim()
            }
          }
          return merged
        })
        setDirty(true)
      } else if (raw.trim()) {
        setContent(raw.trim())
        setDirty(true)
      }
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error))
    } finally {
      setGeneratingAi(false)
    }
  }

  const handleTogglePrompt = () => {
    if (!activeSection) return
    if (!showPrompt && !editingPrompt.trim()) {
      setEditingPrompt(getWorldviewDefaultPrompt(activeSection, hasSubs))
    }
    setShowPrompt(!showPrompt)
  }

  const handleResetPrompt = async () => {
    setSavingPrompt(true)
    await resetPrompt(projectId, promptKey)
    setEditingPrompt('')
    setShowPrompt(false)
    setSavingPrompt(false)
  }

  const handleSavePrompt = async () => {
    setSavingPrompt(true)
    await savePrompt(projectId, promptKey, editingPrompt)
    setSavingPrompt(false)
  }

  const handleRewriteMode = (mode: RewriteMode) => {
    if (!activeSection) return
    if (isFreeform) {
      const selection = getTextareaSelection(rewriteTextareaRef.current, content)
      if (!selection) return
      setRewriteState({ ...selection, mode })
      return
    }
    const textarea = document.activeElement as HTMLTextAreaElement | null
    const key = textarea?.dataset?.subkey
    if (!key || !textarea) return
    const fullContent = subValues[key] ?? ''
    const selection = getTextareaSelection(textarea, fullContent)
    if (!selection) return
    setRewriteState({ ...selection, mode, subKey: key })
  }

  const handleRewriteAccept = (newText: string) => {
    if (!rewriteState) return
    if (isFreeform || !rewriteState.subKey) {
      setContent((prev) => applyTextareaRewrite(prev, rewriteState.start, rewriteState.end, newText))
    } else {
      setSubValues((prev) => ({
        ...prev,
        [rewriteState.subKey!]: applyTextareaRewrite(prev[rewriteState.subKey!] ?? '', rewriteState.start, rewriteState.end, newText),
      }))
    }
    setDirty(true)
    setRewriteState(null)
  }

  const previewContent = activeSection && hasSubs
    ? buildWorldviewContent(activeSection.label, subValues)
    : content

  const menuItems: ContextMenuAction[] = contextMenu ? [
    { label: '✏️ AI 改写', onClick: () => handleRewriteMode('rewrite') },
    { label: '📝 AI 扩写', onClick: () => handleRewriteMode('expand') },
    { label: '✨ AI 润色', onClick: () => handleRewriteMode('polish') },
  ] : []

  if (!configLoaded || !activeSection) {
    return <div className="panel-layout"><div className="panel-placeholder" style={{ height: 300 }}>加载中…</div></div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <WorldviewBanner
        genreMismatch={genreMismatch}
        genre={genre}
        savedGenre={savedGenre}
        onReset={() => setShowResetConfirm(true)}
        onDismiss={() => setGenreMismatchDismissed(true)}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <WorldviewSidebar
          sections={sections}
          activeSectionKey={activeSection.key}
          editingSectionId={editingSectionId}
          editingSectionLabel={editingSectionLabel}
          showAddSection={showAddSection}
          newSectionName={newSectionName}
          onSelectSection={handleSelectSection}
          onStartRenameSection={handleStartRenameSection}
          onRenameLabelChange={setEditingSectionLabel}
          onCommitRenameSection={handleRenameSection}
          onCancelRenameSection={() => setEditingSectionId(null)}
          onDeleteSection={setDeletingSectionId}
          onNewSectionNameChange={setNewSectionName}
          onAddSection={handleAddSection}
          onToggleAddSection={handleToggleAddSection}
          onOpenResetConfirm={() => setShowResetConfirm(true)}
        />
        <WorldviewEditor
          activeSection={activeSection}
          previewContent={previewContent}
          content={content}
          subValues={subValues}
          editing={editing}
          dirty={dirty}
          showExample={showExample}
          showPrompt={showPrompt}
          editingPrompt={editingPrompt}
          savingPrompt={savingPrompt}
          aiError={aiError}
          generatingAi={generatingAi}
          hasSelection={hasSelection}
          rewriteState={rewriteState}
          isFreeform={isFreeform}
          contextMenu={contextMenu}
          menuItems={menuItems}
          genre={genre}
          activeSectionHint={activeSection.hint}
          rewriteTextareaRef={rewriteTextareaRef}
          subFieldEndRef={subFieldEndRef}
          addingSubToKey={addingSubToKey}
          newSubFieldName={newSubFieldName}
          editingSubKey={editingSubKey}
          editingSubLabel={editingSubLabel}
          onStartEdit={handleStartEdit}
          onSave={() => { void handleSave() }}
          onGenerateAi={() => { void generateWithAI() }}
          onTogglePrompt={handleTogglePrompt}
          onPromptChange={setEditingPrompt}
          onResetPrompt={() => { void handleResetPrompt() }}
          onSavePrompt={() => { void handleSavePrompt() }}
          onToggleExample={(key) => setShowExample((prev) => (prev === key ? null : key))}
          onContentChange={(value) => {
            setContent(value)
            setDirty(true)
          }}
          onUpdateSubField={updateSubField}
          onSelectionCheck={checkSelection}
          onSelectionContextMenu={handleSelectionContextMenu}
          onStartAddSubField={setAddingSubToKey}
          onNewSubFieldNameChange={setNewSubFieldName}
          onAddSubField={handleAddSubField}
          onCancelAddSubField={handleCancelAddSubField}
          onStartRenameSubField={(subKey, label) => {
            setEditingSubKey(subKey)
            setEditingSubLabel(label)
          }}
          onRenameSubFieldLabelChange={setEditingSubLabel}
          onCommitRenameSubField={handleRenameSubField}
          onCancelRenameSubField={() => setEditingSubKey(null)}
          onDeleteSubField={handleDeleteSubField}
          onRewriteMode={handleRewriteMode}
          onRewriteAccept={handleRewriteAccept}
          onRewriteReject={() => setRewriteState(null)}
          onContextMenuClose={() => setContextMenu(null)}
        />
      </div>
      <WorldviewDialogs
        showResetConfirm={showResetConfirm}
        genre={genre}
        deletingSection={sections.find((section) => section.key === deletingSectionId) ?? null}
        onConfirmReset={handleResetToDefaults}
        onCancelReset={() => setShowResetConfirm(false)}
        onConfirmDelete={handleDeleteSection}
        onCancelDelete={() => setDeletingSectionId(null)}
      />
    </div>
  )
}
