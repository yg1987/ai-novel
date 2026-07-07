import { useState, useEffect, useCallback } from 'react'
import { listProjectFiles, readProjectFile, writeProjectFile } from '../api/tauri'

interface Props {
  projectId: string
}

const OUTLINE_DIR = 'outline'

export default function OutlinePanel({ projectId }: Props) {
  const [volumes, setVolumes] = useState<string[]>([])
  const [activeFile, setActiveFile] = useState<string | null>('outline.md')
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)

  const refresh = useCallback(async () => {
    const files = await listProjectFiles(projectId, OUTLINE_DIR)
    const names = files
      .map((f) => f.name)
      .filter((n) => n.endsWith('.md'))
      .filter((n) => !n.includes('/'))
    setVolumes(names.sort())
  }, [projectId])

  useEffect(() => {
    refresh().catch((e: unknown) => { console.error(e) })
  }, [refresh])

  useEffect(() => {
    if (!activeFile) return
    readProjectFile(projectId, OUTLINE_DIR, activeFile)
      .then(setContent)
      .catch((e: unknown) => { console.error(e) })
  }, [projectId, activeFile])

  const handleSave = () => {
    if (!activeFile) return
    writeProjectFile(projectId, OUTLINE_DIR, activeFile, content)
      .then(() => { setEditing(false) })
      .catch((e: unknown) => { console.error(e) })
  }

  const handleCreateVolume = () => {
    const num = volumes.length
    const name = `卷${String(num + 1)}.md`
    writeProjectFile(projectId, OUTLINE_DIR, name, `# 第${String(num + 1)}卷\n\n## 概要\n\n## 章节列表\n\n`)
      .then(() => refresh())
      .then(() => { setActiveFile(name); setEditing(true) })
      .catch((e: unknown) => { console.error(e) })
  }

  const label = (name: string) => {
    if (name === 'outline.md') return '📋 总纲'
    return `📖 ${name.replace(/\.md$/, '')}`
  }

  return (
    <div className="panel-layout">
      <div className="panel-sidebar">
        <div className="panel-sidebar-header">
          <h3>大纲</h3>
          <button className="btn-small" onClick={() => { handleCreateVolume() }} title="添加分卷">+</button>
        </div>
        <div className="panel-list">
          {volumes.map((v) => (
            <div
              key={v}
              className={`panel-item${v === activeFile ? ' active' : ''}`}
              onClick={() => { setActiveFile(v); setEditing(false) }}
            >
              {label(v)}
            </div>
          ))}
        </div>
      </div>
      <div className="panel-editor">
        {activeFile ? (
          <>
            <div className="panel-editor-header">
              <h3>{label(activeFile)}</h3>
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
                placeholder="# 大纲内容"
              />
            ) : (
              <div className="panel-preview">{content || '暂无内容'}</div>
            )}
          </>
        ) : (
          <div className="panel-placeholder">选择或创建大纲</div>
        )}
      </div>
    </div>
  )
}
