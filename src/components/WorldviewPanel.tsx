import { useState, useEffect } from 'react'
import { readProjectFile, writeProjectFile } from '../api/tauri'

interface Props {
  projectId: string
}

const SECTIONS = [
  { key: 'world', label: '世界背景', file: 'world.md', placeholder: '# 世界背景\n\n## 世界概况\n\n## 历史事件\n\n## 特殊规则\n' },
  { key: 'forces', label: '势力组织', file: 'forces.md', placeholder: '# 势力/组织\n\n## 势力列表\n\n' },
  { key: 'locations', label: '重要地点', file: 'locations.md', placeholder: '# 重要地点\n\n' },
  { key: 'power-system', label: '力量体系', file: 'power-system.md', placeholder: '# 力量体系\n\n## 境界划分\n\n' },
  { key: 'timeline', label: '全局时间线', file: 'timeline.md', placeholder: '# 全局时间线\n\n' },
]

export default function WorldviewPanel({ projectId }: Props) {
  const [activeSection, setActiveSection] = useState(SECTIONS[0]!)
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    readProjectFile(projectId, 'worldview', activeSection.file)
      .then((c) => { setContent(c); setDirty(false) })
      .catch(console.error)
  }, [projectId, activeSection])

  const handleSave = async () => {
    await writeProjectFile(projectId, 'worldview', activeSection.file, content)
    setEditing(false)
    setDirty(false)
  }

  return (
    <div className="panel-layout">
      <div className="panel-sidebar">
        <div className="panel-sidebar-header">
          <h3>世界观</h3>
        </div>
        <div className="panel-list">
          {SECTIONS.map((s) => (
            <div
              key={s.key}
              className={`panel-item${s.key === activeSection.key ? ' active' : ''}`}
              onClick={() => { setActiveSection(s); setEditing(false) }}
            >
              {s.label}
            </div>
          ))}
        </div>
      </div>
      <div className="panel-editor">
        <div className="panel-editor-header">
          <h3>{activeSection.label}</h3>
          <div>
            {dirty && <span style={{ color: 'var(--danger)', fontSize: '0.85rem', marginRight: 8 }}>未保存</span>}
            {editing ? (
              <button className="btn-primary" onClick={() => { void handleSave() }}>保存</button>
            ) : (
              <button className="btn-secondary" onClick={() => { setEditing(true) }}>编辑</button>
            )}
          </div>
        </div>
        {editing ? (
          <textarea
            className="panel-textarea"
            value={content}
            onChange={(e) => { setContent(e.target.value); setDirty(true) }}
            placeholder={activeSection.placeholder}
          />
        ) : (
          <div className="panel-preview">{content || '暂无内容，点击编辑添加'}</div>
        )}
      </div>
    </div>
  )
}
