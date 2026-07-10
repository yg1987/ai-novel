import { useState, useEffect, useCallback, useRef } from 'react'
import { listResourceCategories, listResourceFiles, readResourceFile, writeResourceFile, deleteResourceFile } from '../api/tauri'
import type { FileEntry } from '../api/tauri'
import { indexResourceFile } from '../services/resourceIndexer'
import { suggestCategory } from '../services/resourceAI'
import type { TextareaSelection } from '../services/rewriteUtils'
import { getTextareaSelection, applyTextareaRewrite } from '../services/rewriteUtils'
import { type RewriteMode } from '../services/rewriteService'
import RewriteButtons from './RewriteButtons'
import RewritePreview from './RewritePreview'
import SelectionContextMenu, { type ContextMenuAction } from './SelectionContextMenu'

interface Props {
  projectId?: string
}

export default function ResourcePanel({ projectId }: Props) {
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newFilename, setNewFilename] = useState('')
  const [showNewFile, setShowNewFile] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [aiSuggesting, setAiSuggesting] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<import('../services/resourceAI').ClassificationResult | null>(null)
  const [rewriteState, setRewriteState] = useState<(TextareaSelection & { mode: RewriteMode }) | null>(null)
  const [hasSelection, setHasSelection] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const rewriteTextareaRef = useRef<HTMLTextAreaElement>(null)
  const checkSelection = useCallback(() => {
    const ta = rewriteTextareaRef.current
    if (ta) setHasSelection(ta.selectionStart !== ta.selectionEnd)
  }, [])

  const refreshCategories = useCallback(async () => {
    try {
      const cats = await listResourceCategories()
      setCategories(cats)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  useEffect(() => { refreshCategories().catch(console.error) }, [refreshCategories])

  const refreshFiles = useCallback(async (category: string) => {
    try {
      const fs = await listResourceFiles(category)
      setFiles(fs)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  useEffect(() => {
    if (selectedCategory) {
      refreshFiles(selectedCategory).catch(console.error)
      setSelectedFile(null)
      setFileContent('')
    }
  }, [selectedCategory, refreshFiles])

  const handleSelectFile = async (filename: string) => {
    if (!selectedCategory) return
    setSelectedFile(filename)
    setEditing(false)
    try {
      const content = await readResourceFile(selectedCategory, filename)
      setFileContent(content)
      setEditContent(content)
    } catch (e) {
      setError(String(e))
    }
  }

  const handleSave = async () => {
    if (!selectedCategory || !selectedFile) return
    setSaving(true)
    try {
      await writeResourceFile(selectedCategory, selectedFile, editContent)
      setFileContent(editContent)
      setEditing(false)
      // Index for search
      if (projectId) {
        indexResourceFile(projectId, selectedCategory, selectedFile).catch(console.error)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (filename: string) => {
    if (!selectedCategory) return
    try {
      await deleteResourceFile(selectedCategory, filename)
      if (selectedFile === filename) {
        setSelectedFile(null)
        setFileContent('')
      }
      await refreshFiles(selectedCategory)
      await refreshCategories()
    } catch (e) {
      setError(String(e))
    }
  }

  const handleCreateFile = async () => {
    if (!selectedCategory || !newFilename.trim()) return
    await writeResourceFile(selectedCategory, newFilename.trim(), `# ${newFilename.trim().replace(/\.md$/i, '')}\n\n`)
    const createdFile = newFilename.trim()
    setNewFilename('')
    setShowNewFile(false)
    await refreshFiles(selectedCategory)
    setSelectedFile(createdFile)
    setFileContent(`# ${createdFile.replace(/\.md$/i, '')}\n\n`)
    setEditContent(`# ${createdFile.replace(/\.md$/i, '')}\n\n`)
    setEditing(true)
  }

  const handleCreateCategory = async () => {
    if (!newCategory.trim()) return
    await writeResourceFile(newCategory.trim(), '.gitkeep', '')
    setNewCategory('')
    await refreshCategories()
    setSelectedCategory(newCategory.trim())
  }

  // ─── Rewrite handlers ──────────────────────────

  const handleRewriteMode = (mode: RewriteMode) => {
    const sel = getTextareaSelection(rewriteTextareaRef.current, editContent)
    if (!sel) return
    setRewriteState({ ...sel, mode })
  }

  const handleRewriteAccept = (newText: string) => {
    if (!rewriteState) return
    setEditContent((prev) => applyTextareaRewrite(prev, rewriteState.start, rewriteState.end, newText))
    setRewriteState(null)
  }

  const menuItems: ContextMenuAction[] = contextMenu ? [
    { label: '✏️ AI 改写', onClick: () => handleRewriteMode('rewrite') },
    { label: '📝 AI 扩写', onClick: () => handleRewriteMode('expand') },
    { label: '✨ AI 润色', onClick: () => handleRewriteMode('polish') },
  ] : []

  return (
    <div className="panel-layout">
      {/* Left sidebar: categories */}
      <div className="panel-sidebar" style={{ width: 220 }}>
        <div className="panel-sidebar-header">
          <h3>素材分类</h3>
        </div>
        <div className="panel-list">
          {categories.length === 0 && (
            <p className="panel-placeholder" style={{ padding: 12, fontSize: '0.85rem' }}>暂无分类，新建一个</p>
          )}
          {categories.map((cat) => (
            <div
              key={cat}
              className={`panel-item${selectedCategory === cat ? ' active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </div>
          ))}
        </div>
        <div style={{ padding: '8px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              className="notes-input"
              style={{ flex: 1, fontSize: '0.8rem' }}
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCategory() }}
              placeholder="新建分类…"
            />
            <button className="btn-text" onClick={handleCreateCategory} disabled={!newCategory.trim()}>+</button>
          </div>
        </div>
      </div>

      {/* Middle: file list */}
      <div className="panel-sidebar" style={{ width: 200, borderRight: '1px solid var(--border)' }}>
        <div className="panel-sidebar-header">
          <h3>素材文件</h3>
          {selectedCategory && (
            <button className="btn-text" onClick={() => setShowNewFile(true)} title="新建素材">+</button>
          )}
        </div>
        <div className="panel-list">
          {!selectedCategory && (
            <p className="panel-placeholder" style={{ padding: 12, fontSize: '0.85rem' }}>先选择一个分类</p>
          )}
          {selectedCategory && files.length === 0 && (
            <p className="panel-placeholder" style={{ padding: 12, fontSize: '0.85rem' }}>暂无素材</p>
          )}
          {files.filter((f) => f.name !== '.gitkeep').map((f) => (
            <div
              key={f.name}
              className={`panel-item${selectedFile === f.name ? ' active' : ''}`}
              onClick={() => handleSelectFile(f.name)}
            >
              <span style={{ flex: 1 }}>{f.name.replace(/\.md$/i, '')}</span>
              <button
                className="btn-text"
                style={{ fontSize: '0.75rem', color: 'var(--danger)', padding: '0 4px' }}
                onClick={(e) => { e.stopPropagation(); handleDelete(f.name) }}
                title="删除"
              >✕</button>
            </div>
          ))}
        </div>
        {showNewFile && (
          <div style={{ padding: '8px', borderTop: '1px solid var(--border)', display: 'flex', gap: 4 }}>
            <input
              className="notes-input"
              style={{ flex: 1, fontSize: '0.8rem' }}
              value={newFilename}
              onChange={(e) => setNewFilename(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFile() }}
              placeholder="文件名.md…"
              autoFocus
            />
            <button className="btn-text" onClick={() => { handleCreateFile() }}>✓</button>
            <button className="btn-text" onClick={() => { setShowNewFile(false); setNewFilename('') }}>✕</button>
          </div>
        )}
      </div>

      {/* Right: content editor */}
      <div className="panel-editor">
        {error && (
          <div className="error-bar" style={{ margin: 8 }}>
            {error}
            <button className="btn-text" onClick={() => setError(null)}>✕</button>
          </div>
        )}
        {aiSuggestion && (
          <div style={{ margin: '8px', padding: '8px 12px', background: '#f0f8ff', border: '1px solid #b8d4fe', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
            建议分类：<strong>{aiSuggestion.suggested_category}</strong>
            ，标签：{aiSuggestion.tags.map((t, i) => <code key={i} style={{ margin: '0 2px' }}>{t}</code>)}
            <button className="btn-text" style={{ float: 'right' }} onClick={() => setAiSuggestion(null)}>✕</button>
          </div>
        )}
        {selectedFile ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{
              padding: '8px 16px', borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <h4>{selectedFile}</h4>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {!editing && fileContent && (
                  <button
                    className="btn-text"
                    style={{ fontSize: '0.78rem' }}
                    onClick={async () => {
                      setAiSuggesting(true)
                      setAiSuggestion(null)
                      const result = await suggestCategory(fileContent)
                      if (result) setAiSuggestion(result)
                      setAiSuggesting(false)
                    }}
                    disabled={aiSuggesting}
                  >
                    {aiSuggesting ? '分析中…' : '🏷 AI 分类'}
                  </button>
                )}
                {editing && editContent && (
                  <RewriteButtons
                    enabled={hasSelection}
                    loading={rewriteState !== null}
                    onRewrite={() => handleRewriteMode('rewrite')}
                    onExpand={() => handleRewriteMode('expand')}
                    onPolish={() => handleRewriteMode('polish')}
                  />
                )}
                {editing ? (
                  <>
                    <button className="btn-primary" onClick={handleSave} disabled={saving}>
                      {saving ? '保存中…' : '保存'}
                    </button>
                    <button className="btn-text" onClick={() => { setEditing(false); setEditContent(fileContent) }}>取消</button>
                  </>
                ) : (
                  <button className="btn-primary" onClick={() => setEditing(true)}>编辑</button>
                )}
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {editing ? (
                <textarea
                  ref={rewriteTextareaRef}
                  style={{
                    width: '100%', height: '100%', border: 'none', resize: 'none',
                    padding: 16, fontSize: '0.9rem', lineHeight: 1.7,
                    fontFamily: 'var(--font-sans)', background: 'transparent',
                  }}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onMouseUp={checkSelection}
                  onKeyUp={checkSelection}
                  onContextMenu={(e) => {
                    const ta = e.currentTarget as HTMLTextAreaElement
                    if (ta.selectionStart !== ta.selectionEnd) {
                      e.preventDefault()
                      setContextMenu({ x: e.clientX, y: e.clientY })
                    }
                  }}
                />
              ) : (
                <pre style={{
                  padding: 16, whiteSpace: 'pre-wrap', fontSize: '0.9rem',
                  lineHeight: 1.7, fontFamily: 'var(--font-sans)',
                }}>
                  {fileContent || '(空)'}
                </pre>
              )}
            </div>
          </div>
        ) : (
          <div className="panel-placeholder" style={{ height: 300 }}>
            选择一个素材查看或编辑
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
    </div>
  )
}
