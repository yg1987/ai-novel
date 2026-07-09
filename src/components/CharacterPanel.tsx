import { useState, useEffect, useCallback } from 'react'
import { listProjectFiles, readProjectFile, writeProjectFile, deleteProjectFile } from '../api/tauri'

interface Props {
  projectId: string
}

const CHARACTER_SUBDIR = 'characters'

const CHAR_EXAMPLE = `角色：林烬
身份/职业：玄天宗外门弟子，后觉醒太古剑魂
外貌特征：黑发黑瞳，身形清瘦，左眉有一道细疤
性格特点：沉默寡言但重情义，遇强则强，不畏权势
背景经历：自幼父母双亡，被玄天宗收养。入门十二年仍在淬体境徘徊，遭同门轻视。意外获得太古剑魂传承后命运转折。
动机目标：寻找父母死因真相，最终成为剑道至尊
说话风格：话少，常用短句。愤怒时语气冰冷
标签：["剑修", "孤儿", "逆袭", "天选之子"]`

export default function CharacterPanel({ projectId }: Props) {
  const [files, setFiles] = useState<string[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [newName, setNewName] = useState('')
  const [showExample, setShowExample] = useState(false)

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
              <div className="panel-editor-inner">
                <div className="sub-field" style={{ marginBottom: 0 }}>
                  <div className="sub-field-label-row">
                    <label className="sub-field-label">角色信息</label>
                    <button
                      className="btn-text"
                      style={{ fontSize: '0.78rem' }}
                      onClick={() => { setShowExample(!showExample) }}
                    >
                      {showExample ? '收起示例' : '📖 看示例'}
                    </button>
                  </div>
                  {showExample && (
                    <div className="sub-field-example">
                      <pre>{CHAR_EXAMPLE}</pre>
                    </div>
                  )}
                  <textarea
                    className="sub-field-textarea"
                    style={{ minHeight: 350 }}
                    value={content}
                    onChange={(e) => { setContent(e.target.value) }}
                    placeholder={`角色：${activeFile}\n身份/职业：\n外貌特征：\n性格特点：\n背景经历：\n动机目标：\n说话风格：\n标签：[标签1, 标签2, ...]\n\n💡 每行填一项就行，不确定的可以空着，以后边写边补`}
                  />
                </div>
              </div>
            ) : (
              <div className="panel-preview">{content || <span style={{ color: 'var(--text-muted)' }}>暂无内容，点击编辑填写角色信息</span>}</div>
            )}
          </>
        ) : (
          <div className="panel-placeholder">选择或创建角色</div>
        )}
      </div>
    </div>
  )
}
