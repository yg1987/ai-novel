import { useState, useEffect, useCallback } from 'react'
import { listProjectFiles, readProjectFile, writeProjectFile, deleteProjectFile } from '../api/tauri'

interface Props {
  projectId: string
}

const CHARACTER_SUBDIR = 'characters'

export default function CharacterPanel({ projectId }: Props) {
  const [files, setFiles] = useState<string[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [newName, setNewName] = useState('')

  const refresh = useCallback(async () => {
    const entries = await listProjectFiles(projectId, CHARACTER_SUBDIR)
    setFiles(entries.map((e) => e.name.replace(/\.md$/i, '')))
  }, [projectId])

  useEffect(() => {
    refresh().catch((e: unknown) => { console.error(e) })
  }, [refresh])

  useEffect(() => {
    if (!activeFile) {
      setContent('')
      return
    }
    readProjectFile(projectId, CHARACTER_SUBDIR, `${activeFile}.md`)
      .then(setContent)
      .catch((e: unknown) => { console.error(e) })
  }, [projectId, activeFile])

  const handleSave = () => {
    if (!activeFile) return
    writeProjectFile(projectId, CHARACTER_SUBDIR, `${activeFile}.md`, content)
      .then(() => { setEditing(false) })
      .catch((e: unknown) => { console.error(e) })
  }

  const handleCreate = () => {
    if (!newName.trim()) return
    const name = newName.trim()
    writeProjectFile(projectId, CHARACTER_SUBDIR, `${name}.md`, '')
      .then(() => {
        setNewName('')
        return refresh()
      })
      .then(() => {
        setActiveFile(name)
        setContent('')
        setEditing(true)
      })
      .catch((e: unknown) => { console.error(e) })
  }

  const handleDelete = (name: string) => {
    deleteProjectFile(projectId, CHARACTER_SUBDIR, `${name}.md`)
      .then(() => {
        if (activeFile === name) { setActiveFile(null); setContent('') }
        return refresh()
      })
      .catch((e: unknown) => { console.error(e) })
  }

  return (
    <div className="panel-layout">
      <div className="panel-sidebar">
        <div className="panel-sidebar-header">
          <h3>角色</h3>
        </div>
        <div className="panel-new-item">
          <input
            value={newName}
            onChange={(e) => { setNewName(e.target.value) }}
            placeholder="新角色名"
            onKeyDown={(e) => { if (e.key === 'Enter') { handleCreate() } }}
          />
          <button className="btn-small" onClick={() => { handleCreate() }}>+</button>
        </div>
        <div className="panel-list">
          {files.map((f) => (
            <div key={f} className={`panel-item${f === activeFile ? ' active' : ''}`}>
              <span onClick={() => { setActiveFile(f); setEditing(false) }}>{f}</span>
              <button className="btn-text" onClick={() => { handleDelete(f) }} style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>✕</button>
            </div>
          ))}
          {files.length === 0 && <p className="panel-empty">暂无角色</p>}
        </div>
      </div>
      <div className="panel-editor">
        {activeFile ? (
          <>
            <div className="panel-editor-header">
              <h3>{activeFile}</h3>
              <div>
                {editing ? (
                  <button className="btn-primary" onClick={() => { handleSave() }}>保存</button>
                ) : (
                  <button className="btn-secondary" onClick={() => { setEditing(true) }}>编辑</button>
                )}
              </div>
            </div>
            {editing ? (
              <textarea
                className="panel-textarea"
                value={content}
                onChange={(e) => { setContent(e.target.value) }}
                placeholder={`## 角色卡\n\nname: ${activeFile}\nrole: \nappearance: \npersonality: \nbackground: \nmotivation: \nspeaking_style: \ntags: []`}
              />
            ) : (
              <div className="panel-preview">{content || '暂无内容'}</div>
            )}
          </>
        ) : (
          <div className="panel-placeholder">选择或创建角色</div>
        )}
      </div>
    </div>
  )
}
