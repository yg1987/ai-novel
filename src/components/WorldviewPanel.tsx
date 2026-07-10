import { useState, useEffect, useCallback, useRef } from 'react'
import { readProjectFile, writeProjectFile, loadProviderConfig } from '../api/tauri'
import { buildAIContext } from '../services/aiContext'
import { loadPrompt, savePrompt, resetPrompt } from '../services/aiPrompts'
import type { TextareaSelection } from '../services/rewriteUtils'
import { getTextareaSelection, applyTextareaRewrite } from '../services/rewriteUtils'
import { type RewriteMode } from '../services/rewriteService'
import RewriteButtons from './RewriteButtons'
import RewritePreview from './RewritePreview'
import SelectionContextMenu, { type ContextMenuAction } from './SelectionContextMenu'
import ConfirmDialog from './ConfirmDialog'
import {
  type SectionDef,
  type SubField,
  loadSections,
  loadSectionsGenre,
  saveSections,
  getDefaultSections,
  getExample,
} from '../services/worldviewConfig'

interface Props {
  projectId: string
}

// ─── Markdown helpers ───────────────────────────────────

/** Parse ## 小节 heading + content from Markdown */
function parseSubs(content: string, definedKeys: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  let currentKey = ''
  const lines: string[] = []

  for (const line of content.split('\n')) {
    const m = line.match(/^##\s+(.+)/)
    if (m) {
      if (currentKey) result[currentKey] = lines.join('\n').trim()
      currentKey = m[1]!.trim()
      lines.length = 0
    } else if (!line.startsWith('# ')) {
      lines.push(line)
    }
  }
  if (currentKey) result[currentKey] = lines.join('\n').trim()

  // Ensure all defined keys exist (even if empty)
  for (const k of definedKeys) {
    if (!(k in result)) result[k] = ''
  }

  return result
}

/** Build Markdown from section title and sub-field values */
function buildContent(title: string, subs: Record<string, string>): string {
  const parts = [`# ${title}`]
  for (const [key, text] of Object.entries(subs)) {
    parts.push('', `## ${key}`, '')
    if (text.trim()) {
      parts.push(text.trim())
    }
  }
  return parts.join('\n')
}

// ─── Default prompt builder ────────────────────────────

function getDefaultPrompt(section: SectionDef, hasSubs: boolean): string {
  if (hasSubs) {
    return `你是一个网文世界观设定助手。根据以下项目信息，为这部小说生成「${section.label}」的设定。

请严格按以下各部分输出，使用 ## 作为小标题：

${section.subs.map(s => `## ${s.label}\n（要求：${s.hint}）`).join('\n\n')}

要求：
- 每部分控制在 200 字以内
- 内容要符合小说类型
- 直接输出小标题+内容，不要加额外说明`
  }
  return `你是一个网文世界观设定助手。根据以下项目信息，为这部小说生成「${section.label}」的内容。直接输出内容，控制在 300 字以内，不要加额外说明。`
}

// ─── Component ──────────────────────────────────────────

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

  // Section editor state
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [editingSectionLabel, setEditingSectionLabel] = useState('')
  const [showAddSection, setShowAddSection] = useState(false)
  const [newSectionName, setNewSectionName] = useState('')

  // Sub-field editor state
  const [editingSubKey, setEditingSubKey] = useState<string | null>(null)
  const [editingSubLabel, setEditingSubLabel] = useState('')
  const [newSubFieldName, setNewSubFieldName] = useState('')
  const [addingSubToKey, setAddingSubToKey] = useState<string | null>(null)

  // Reset confirm
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // Delete confirm
  const [deletingSectionId, setDeletingSectionId] = useState<string | null>(null)
  const [genre, setGenre] = useState<string>('玄幻')

  // Genre mismatch detection — project genre changed after worldview was initialized
  const [savedGenre, setSavedGenre] = useState<string | null>(null)
  const [genreMismatchDismissed, setGenreMismatchDismissed] = useState(false)
  const genreMismatch = savedGenre !== null && savedGenre !== genre && !genreMismatchDismissed

  const [configLoaded, setConfigLoaded] = useState(false)
  const rewriteTextareaRef = useRef<HTMLTextAreaElement>(null)
  const checkSelection = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    const ta = e.currentTarget as HTMLTextAreaElement
    setHasSelection(ta.selectionStart !== ta.selectionEnd)
  }, [])

  const editorInnerRef = useRef<HTMLDivElement>(null)
  const subFieldEndRef = useRef<HTMLDivElement>(null)

  const scrollToNewSubField = useCallback(() => {
    // Wait for DOM update then scroll the new field into view
    requestAnimationFrame(() => {
      subFieldEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }, [])

  // ─── Load sections on mount ─────────────────────────

  useEffect(() => {
    const init = async () => {
      // Read project genre
      let g = '玄幻'
      try {
        const metaRaw = await readProjectFile(projectId, '', 'project.json')
        const meta = JSON.parse(metaRaw) as { genre?: string }
        if (meta.genre) g = meta.genre
      } catch { /* ignore */ }
      setGenre(g)

      // Load sections from config, or init with genre defaults
      let secs = await loadSections(projectId)
      if (!secs || secs.length === 0) {
        secs = getDefaultSections(g)
        await saveSections(projectId, secs, g)
      }
      setSections(secs)

      // Detect genre mismatch
      const storedGenre = await loadSectionsGenre(projectId)
      setSavedGenre(storedGenre)

      if (secs.length > 0) {
        setActiveSection(secs[0]!)
      }
      setConfigLoaded(true)
    }
    void init()
  }, [projectId])

  // ─── Autosave sections when they change ─────────────

  const sectionsRef = useRef(sections)
  sectionsRef.current = sections

  useEffect(() => {
    if (!configLoaded) return
    // Debounce: only save if sections actually changed from last save
    saveSections(projectId, sectionsRef.current).catch(console.error)
  }, [sections, configLoaded, projectId])

  const promptKey = activeSection ? `worldview_${activeSection.key}` : ''
  const hasSubs = activeSection ? activeSection.subs.length > 0 : false
  const isFreeform = !hasSubs

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
      .then((c) => {
        setContent(c)
        setSubValues(parseSubs(c, activeSection.subs.map(s => s.key)))
        setDirty(false)
      })
      .catch(console.error)
  }, [projectId, activeSection])

  // ─── Save / edit ────────────────────────────────────

  const handleSave = async () => {
    if (!activeSection) return
    if (hasSubs) {
      const md = buildContent(activeSection.label, subValues)
      await writeProjectFile(projectId, 'worldview', activeSection.file, md)
    } else {
      await writeProjectFile(projectId, 'worldview', activeSection.file, content)
    }
    setEditing(false)
    setDirty(false)
  }

  const handleStartEdit = () => {
    if (!activeSection) return
    setSubValues(parseSubs(content, activeSection.subs.map(s => s.key)))
    setEditing(true)
  }

  const updateSubField = (key: string, value: string) => {
    setSubValues(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  // ─── Section management ─────────────────────────────

  const handleRenameSection = (sectionId: string, newLabel: string) => {
    if (!newLabel.trim()) return
    setSections(prev => prev.map(s =>
      s.key === sectionId ? { ...s, label: newLabel.trim() } : s
    ))
    setEditingSectionId(null)
  }

  const handleDeleteSection = (sectionId: string) => {
    const section = sections.find(s => s.key === sectionId)
    if (!section) return
    // Delete the .md file as well
    writeProjectFile(projectId, 'worldview', section.file, '')
      .then(() => {
        setSections(prev => {
          const next = prev.filter(s => s.key !== sectionId)
          if (next.length === 0) return prev // don't allow empty
          if (activeSection?.key === sectionId) setActiveSection(next[0]!)
          return next
        })
      })
      .catch(console.error)
    setDeletingSectionId(null)
  }

  const handleAddSection = () => {
    const name = newSectionName.trim()
    if (!name) return
    const id = `custom_${Date.now()}`
    const file = `${id}.md`
    const newSec: SectionDef = {
      key: id,
      label: name,
      file,
      hint: `填写${name}的相关设定`,
      subs: [],
    }
    setSections(prev => [...prev, newSec])
    setActiveSection(newSec)
    setEditing(false)
    setShowAddSection(false)
    setNewSectionName('')
  }

  // ─── Sub-field management ───────────────────────────

  const handleRenameSubField = (sectionKey: string, oldSubKey: string, newLabel: string) => {
    if (!newLabel.trim()) return
    const newKey = newLabel.trim()
    const updatedSections = sections.map(s => {
      if (s.key !== sectionKey) return s
      return {
        ...s,
        subs: s.subs.map(sub =>
          sub.key === oldSubKey
            ? { ...sub, key: newKey, label: newLabel.trim() }
            : sub
        ),
      }
    })
    setSections(updatedSections)
    if (activeSection?.key === sectionKey) {
      const updated = updatedSections.find(s => s.key === sectionKey)
      if (updated) setActiveSection(updated)
    }
    if (oldSubKey !== newKey) {
      setSubValues(prev => {
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
    const updatedSections = sections.map(s => {
      if (s.key !== sectionKey) return s
      return { ...s, subs: s.subs.filter(sub => sub.key !== subKey) }
    })
    setSections(updatedSections)
    if (activeSection?.key === sectionKey) {
      const updated = updatedSections.find(s => s.key === sectionKey)
      if (updated) setActiveSection(updated)
    }
    setSubValues(prev => {
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
    const wasFreeform = sections.find(s => s.key === sectionKey)?.subs.length === 0
    const updatedSections = sections.map(s => {
      if (s.key !== sectionKey) return s
      return { ...s, subs: [...s.subs, newSub] }
    })
    setSections(updatedSections)
    if (activeSection?.key === sectionKey) {
      const updated = updatedSections.find(s => s.key === sectionKey)
      if (updated) setActiveSection(updated)
    }
    // If converting from freeform, move current content into the new sub-field
    if (wasFreeform && content.trim()) {
      setSubValues(prev => ({ ...prev, [name]: content }))
      setContent('')
    } else {
      setSubValues(prev => ({ ...prev, [name]: '' }))
    }
    setNewSubFieldName('')
    setAddingSubToKey(null)
    scrollToNewSubField()
  }

  // ─── Reset to genre defaults ────────────────────────

  const handleResetToDefaults = () => {
    const defaults = getDefaultSections(genre)
    setSections(defaults)
    setSavedGenre(genre) // dismiss mismatch after reset
    setGenreMismatchDismissed(false)
    if (defaults.length > 0) setActiveSection(defaults[0]!)
    setEditing(false)
    setDirty(false)
    setShowResetConfirm(false)
  }

  // ─── AI generation ───────────────────────────────────

  const [generatingAi, setGeneratingAi] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const generateWithAI = async () => {
    if (!activeSection) return
    setGeneratingAi(true)
    setAiError(null)
    try {
      const config = await loadProviderConfig()
      const provider = config.providers.find(p => p.name === config.active_profile)
      if (!provider) { throw new Error('未配置 AI Provider') }
      if (!provider.models.analysis) { throw new Error('未配置分析模型，请在 AI 配置中设置') }

      // Read project info for context
      let context = await buildAIContext(projectId)

      const base = provider.base_url.replace(/\/+$/, '')
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.api_key}`,
      }

      const systemPrompt = editingPrompt.trim() || getDefaultPrompt(activeSection, hasSubs)

      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers,
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
        const parsed = parseSubs(raw, activeSection.subs.map(s => s.key))
        setSubValues(prev => {
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
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      setGeneratingAi(false)
    }
  }

  const previewContent = activeSection && hasSubs
    ? buildContent(activeSection.label, subValues)
    : content

  // ─── Rewrite handlers ──────────────────────────

  const handleRewriteMode = (mode: RewriteMode) => {
    if (!activeSection) return
    if (isFreeform) {
      const sel = getTextareaSelection(rewriteTextareaRef.current, content)
      if (!sel) return
      setRewriteState({ ...sel, mode })
      return
    }
    const textarea = document.activeElement as HTMLTextAreaElement | null
    const key = textarea?.dataset?.subkey
    if (!key || !textarea) return
    const fullContent = subValues[key] ?? ''
    const sel = getTextareaSelection(textarea, fullContent)
    if (!sel) return
    setRewriteState({ ...sel, mode, subKey: key })
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

  const menuItems: ContextMenuAction[] = contextMenu ? [
    { label: '✏️ AI 改写', onClick: () => handleRewriteMode('rewrite') },
    { label: '📝 AI 扩写', onClick: () => handleRewriteMode('expand') },
    { label: '✨ AI 润色', onClick: () => handleRewriteMode('polish') },
  ] : []

  // ─── Render ──────────────────────────────────────────

  if (!configLoaded || !activeSection) {
    return <div className="panel-layout"><div className="panel-placeholder" style={{ height: 300 }}>加载中…</div></div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 110px)' }}>
      {/* Genre mismatch banner — top of worldview tab */}
      {genreMismatch && (
        <div style={{
          padding: '8px 16px',
          background: 'var(--bg-sidebar)',
          borderBottom: '1px solid var(--border)',
          fontSize: '0.82rem',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}>
          <span style={{ flex: 1 }}>
            项目类型已改为「{genre}」，世界观栏目还是「{savedGenre}」的默认预设。重置将替换栏目配置为新品类的预设（不影响已填内容）。
          </span>
          <button
            className="btn-text"
            style={{ fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap' }}
            onClick={() => { setShowResetConfirm(true) }}
          >
            重置
          </button>
          <button
            className="btn-text"
            style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
            onClick={() => { setGenreMismatchDismissed(true) }}
          >
            忽略
          </button>
        </div>
      )}

      {/* Inner layout: sidebar + editor */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left sidebar: sections */}
        <div className="panel-sidebar">
        <div className="panel-sidebar-header">
          <h3>世界观</h3>
        </div>
        <div className="panel-list">
          {sections.map((s) => (
            <div key={s.key}>
              {editingSectionId === s.key ? (
                <div className="panel-item">
                  <input
                    className="notes-input"
                    style={{ flex: 1, fontSize: '0.82rem' }}
                    value={editingSectionLabel}
                    onChange={(e) => setEditingSectionLabel(e.target.value)}
                    onBlur={() => handleRenameSection(s.key, editingSectionLabel)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSection(s.key, editingSectionLabel)
                      if (e.key === 'Escape') setEditingSectionId(null)
                    }}
                    autoFocus
                  />
                </div>
              ) : (
                <div
                  className={`panel-item${s.key === activeSection.key ? ' active' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => { setActiveSection(s); setEditing(false) }}
                  onDoubleClick={() => { setEditingSectionId(s.key); setEditingSectionLabel(s.label) }}
                >
                  <span style={{ flex: 1 }}>{s.label}</span>
                  <button
                    className="btn-text"
                    style={{ fontSize: '0.75rem', padding: '0 6px', opacity: 0.5 }}
                    title="删除栏目"
                    onClick={(e) => { e.stopPropagation(); setDeletingSectionId(s.key) }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ padding: '8px', borderTop: '1px solid var(--border)' }}>
          {showAddSection ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                className="notes-input"
                style={{ flex: 1, fontSize: '0.8rem' }}
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddSection(); if (e.key === 'Escape') { setShowAddSection(false); setNewSectionName('') } }}
                placeholder="栏目名称…"
                autoFocus
              />
              <button className="btn-text" onClick={handleAddSection} disabled={!newSectionName.trim()}>✓</button>
              <button className="btn-text" onClick={() => { setShowAddSection(false); setNewSectionName('') }}>✕</button>
            </div>
          ) : (
            <button className="btn-text" style={{ fontSize: '0.82rem', width: '100%' }} onClick={() => setShowAddSection(true)}>
              + 添加栏目
            </button>
          )}
          <button
            className="btn-text"
            style={{ fontSize: '0.82rem', width: '100%', marginTop: 8, padding: '4px 0', borderTop: '1px solid var(--border)' }}
            onClick={() => setShowResetConfirm(true)}
          >
            重置为品类默认
          </button>
        </div>
      </div>

      {/* Right: editor */}
      <div className="panel-editor">
        <div className="panel-editor-header">
          <h3>{activeSection.label}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {dirty && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>未保存</span>}
            {editing && (
              <>
                <button
                  className="btn-text"
                  onClick={() => { void generateWithAI() }}
                  disabled={generatingAi}
                  style={{ fontSize: '0.85rem' }}
                >
                  {generatingAi ? '⏳ 生成中…' : '✨ AI 辅助'}
                </button>
                <RewriteButtons
                  enabled={hasSelection}
                  loading={rewriteState !== null}
                    onRewrite={() => handleRewriteMode('rewrite')}
                    onExpand={() => handleRewriteMode('expand')}
                    onPolish={() => handleRewriteMode('polish')}
                  />
                  <button
                  className="btn-text"
                  onClick={() => {
                    if (!showPrompt && !editingPrompt.trim()) {
                      setEditingPrompt(getDefaultPrompt(activeSection, hasSubs))
                    }
                    setShowPrompt(!showPrompt)
                  }}
                  style={{ fontSize: '0.85rem' }}
                >
                  {showPrompt ? '关闭提示词' : '✎ 提示词'}
                </button>
              </>
            )}
            {editing ? (
              <button className="btn-primary" onClick={() => { void handleSave() }}>保存</button>
            ) : (
              <button className="btn-secondary" onClick={handleStartEdit}>编辑</button>
            )}
          </div>
        </div>

        {showPrompt && editing && (
          <div className="prompt-editor">
            <div className="prompt-editor-header">
              <span>提示词（AI 辅助使用，修改后自动保存到本项目的提示词库，换项目不影响）</span>
              <button
                className="btn-text"
                style={{ fontSize: '0.8rem' }}
                onClick={async () => {
                  setSavingPrompt(true)
                  await resetPrompt(projectId, promptKey)
                  setEditingPrompt('')
                  setShowPrompt(false)
                  setSavingPrompt(false)
                }}
              >恢复默认</button>
            </div>
            <textarea
              className="prompt-editor-textarea"
              value={editingPrompt}
              onChange={(e) => { setEditingPrompt(e.target.value) }}
              placeholder="在此编写自定义提示词…"
            />
            <div className="prompt-editor-footer">
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {editingPrompt.trim() ? '已保存自定义提示词' : '修改后点保存，AI 将使用你的提示词'}
              </span>
              <button
                className="btn-primary"
                style={{ fontSize: '0.82rem', padding: '4px 12px' }}
                disabled={savingPrompt}
                onClick={async () => {
                  setSavingPrompt(true)
                  await savePrompt(projectId, promptKey, editingPrompt)
                  setSavingPrompt(false)
                }}
              >{savingPrompt ? '保存中…' : '保存提示词'}</button>
            </div>
          </div>
        )}

        {aiError && (
          <div style={{ padding: '8px 24px', fontSize: '0.85rem', color: 'var(--danger)', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
            AI 生成失败：{aiError}
          </div>
        )}

          {editing ? (
          isFreeform ? (
            <div className="panel-editor-inner">
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                💡 {activeSection.hint}
                <button
                  className="btn-text"
                  style={{ fontSize: '0.78rem', marginLeft: 8 }}
                  onClick={() => setAddingSubToKey(activeSection.key)}
                >
                  + 添加子字段
                </button>
              </p>
              <div className="sub-field">
                <div className="sub-field-label-row">
                  <label className="sub-field-label">{activeSection.label}</label>
                  {(() => {
                    const ex = getExample(genre, activeSection.key, '_default')
                    const showThis = showExample === '__freeform__'
                    return ex ? (
                      <button
                        className="btn-text"
                        style={{ fontSize: '0.78rem' }}
                        onClick={() => { setShowExample(showThis ? null : '__freeform__') }}
                      >
                        {showThis ? '收起示例' : '📖 看示例'}
                      </button>
                    ) : null
                  })()}
                </div>
                {showExample === '__freeform__' && (() => {
                  const ex = getExample(genre, activeSection.key, '_default')
                  return ex ? (
                    <div className="sub-field-example">
                      <pre>{ex}</pre>
                    </div>
                  ) : null
                })()}
                <textarea
                  ref={rewriteTextareaRef}
                  className="sub-field-textarea"
                  style={{ minHeight: 300 }}
                  value={content}
                  onChange={(e) => { setContent(e.target.value); setDirty(true) }}
                  onMouseUp={checkSelection}
                  onKeyUp={checkSelection}
                  onContextMenu={(e) => {
                    const ta = e.currentTarget as HTMLTextAreaElement
                    if (ta.selectionStart !== ta.selectionEnd) {
                      e.preventDefault()
                      setContextMenu({ x: e.clientX, y: e.clientY })
                    }
                  }}
                  placeholder={activeSection.hint + '…'}
                />
              </div>
              {addingSubToKey === activeSection.key && (
                <div style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    className="notes-input"
                    style={{ flex: 1 }}
                    value={newSubFieldName}
                    onChange={(e) => setNewSubFieldName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddSubField(activeSection.key); if (e.key === 'Escape') { setAddingSubToKey(null); setNewSubFieldName('') } }}
                    placeholder="子字段名称…"
                    autoFocus
                  />
                  <button className="btn-text" onClick={() => handleAddSubField(activeSection.key)} disabled={!newSubFieldName.trim()}>✓</button>
                  <button className="btn-text" onClick={() => { setAddingSubToKey(null); setNewSubFieldName('') }}>✕</button>
                </div>
              )}
            </div>
          ) : (
            <div className="panel-editor-inner">
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                💡 {activeSection.hint}
                <button
                  className="btn-text"
                  style={{ fontSize: '0.78rem', marginLeft: 8 }}
                  onClick={() => setAddingSubToKey(activeSection.key)}
                >
                  + 添加子字段
                </button>
              </p>
              {activeSection.subs.map((sub) => {
                const example = getExample(genre, activeSection.key, sub.key)
                const showThis = showExample === sub.key
                return (
                  <div key={sub.key} className="sub-field">
                    <div className="sub-field-label-row">
                      {editingSubKey === sub.key ? (
                        <input
                          className="notes-input"
                          style={{ flex: 1, fontSize: '0.85rem' }}
                          value={editingSubLabel}
                          onChange={(e) => setEditingSubLabel(e.target.value)}
                          onBlur={() => handleRenameSubField(activeSection.key, sub.key, editingSubLabel)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameSubField(activeSection.key, sub.key, editingSubLabel)
                            if (e.key === 'Escape') setEditingSubKey(null)
                          }}
                          autoFocus
                        />
                      ) : (
                        <label
                          className="sub-field-label"
                          onDoubleClick={() => { setEditingSubKey(sub.key); setEditingSubLabel(sub.label) }}
                          title="双击重命名"
                        >
                          {sub.label}
                        </label>
                      )}
                      {!editingSubKey && (
                        <button
                          className="btn-text"
                          style={{ fontSize: '0.7rem', opacity: 0.4, padding: '0 4px' }}
                          title="删除此子字段"
                          onClick={() => handleDeleteSubField(activeSection.key, sub.key)}
                        >
                          ✕
                        </button>
                      )}
                      <div style={{ flex: 1 }} />
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {example && (
                          <button
                            className="btn-text"
                            style={{ fontSize: '0.78rem' }}
                            onClick={() => { setShowExample(showThis ? null : sub.key) }}
                          >
                            {showThis ? '收起示例' : '📖 看示例'}
                          </button>
                        )}
                      </div>
                    </div>
                    <span className="sub-field-hint">{sub.hint}</span>
                    {showThis && example && (
                      <div className="sub-field-example">
                        <pre>{example}</pre>
                      </div>
                    )}
                    <textarea
                      className="sub-field-textarea"
                      data-subkey={sub.key}
                      value={subValues[sub.key] ?? ''}
                      onChange={(e) => { updateSubField(sub.key, e.target.value) }}
                      onMouseUp={checkSelection}
                      onKeyUp={checkSelection}
                      onContextMenu={(e) => {
                        const ta = e.currentTarget as HTMLTextAreaElement
                        if (ta.selectionStart !== ta.selectionEnd) {
                          e.preventDefault()
                          setContextMenu({ x: e.clientX, y: e.clientY })
                        }
                      }}
                      placeholder="在这里填写…"
                    />
                  </div>
                )
              })}

              {addingSubToKey === activeSection.key && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: -8, marginBottom: 16 }}>
                  <input
                    className="notes-input"
                    style={{ flex: 1 }}
                    value={newSubFieldName}
                    onChange={(e) => setNewSubFieldName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddSubField(activeSection.key); if (e.key === 'Escape') { setAddingSubToKey(null); setNewSubFieldName('') } }}
                    placeholder="子字段名称…"
                    autoFocus
                  />
                  <button className="btn-text" onClick={() => handleAddSubField(activeSection.key)} disabled={!newSubFieldName.trim()}>✓</button>
                  <button className="btn-text" onClick={() => { setAddingSubToKey(null); setNewSubFieldName('') }}>✕</button>
                </div>
              )}
              <div ref={subFieldEndRef} />
            </div>
          )
        ) : (
          <div className="panel-preview">
            {previewContent.trim() || (
              <span style={{ color: 'var(--text-muted)' }}>
                暂无内容，点击编辑添加
                {activeSection.subs.length > 0 && '（可填写 ' + activeSection.subs.map(s => s.label).join('、') + '）'}
              </span>
            )}
          </div>
        )}
      </div>

      {rewriteState && (
        <RewritePreview
          selectedText={rewriteState.selectedText}
          beforeText={rewriteState.beforeText}
          afterText={rewriteState.afterText}
          defaultMode={rewriteState.mode}
          onAccept={handleRewriteAccept}
          onReject={() => setRewriteState(null)}
        />
      )}

      {contextMenu && (
        <SelectionContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {showResetConfirm && (
        <ConfirmDialog
          title="重置为品类默认"
          message={`确定恢复为「${genre}」品类的默认栏目配置？所有自定义栏目和子字段将被清除，已有内容不受影响。`}
          confirmText="确定重置"
          danger
          onConfirm={() => handleResetToDefaults()}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}

      {deletingSectionId && (() => {
        const sec = sections.find(s => s.key === deletingSectionId)
        return sec ? (
          <ConfirmDialog
            title="删除栏目"
            message={`确定删除「${sec.label}」栏目？该栏目的所有内容将被删除。`}
            confirmText="删除"
            danger
            onConfirm={() => handleDeleteSection(deletingSectionId)}
            onCancel={() => setDeletingSectionId(null)}
          />
        ) : null
      })()}
      </div>{/* end inner flex: sidebar + editor */}
    </div>{/* end outer column wrapper */}
  )
}
