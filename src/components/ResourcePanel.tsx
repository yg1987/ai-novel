import { useState, useEffect, useCallback } from 'react'
import { listResourceCategories, listResourceFiles, readResourceFile, writeResourceFile, deleteResourceFile } from '../api/tauri'
import type { FileEntry } from '../api/tauri'

export default function ResourcePanel() {
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
        {selectedFile ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{
              padding: '8px 16px', borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <h4>{selectedFile}</h4>
              <div style={{ display: 'flex', gap: 8 }}>
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
                  style={{
                    width: '100%', height: '100%', border: 'none', resize: 'none',
                    padding: 16, fontSize: '0.9rem', lineHeight: 1.7,
                    fontFamily: 'var(--font-sans)', background: 'transparent',
                  }}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
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
    </div>
  )
}
