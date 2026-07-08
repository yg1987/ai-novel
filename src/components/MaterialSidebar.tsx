import { useState, useEffect, useCallback } from 'react'
import { listResourceCategories, listResourceFiles, readResourceFile } from '../api/tauri'
import type { FileEntry } from '../api/tauri'

interface Props {
  onInsert: (text: string) => void
}

export default function MaterialSidebar({ onInsert }: Props) {
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [previewText, setPreviewText] = useState('')

  useEffect(() => { listResourceCategories().then(setCategories).catch(console.error) }, [])

  useEffect(() => {
    if (selectedCategory) {
      listResourceFiles(selectedCategory)
        .then((fs) => setFiles(fs.filter((f) => f.name !== '.gitkeep')))
        .catch(console.error)
      setSelectedFile(null)
      setPreviewText('')
    }
  }, [selectedCategory])

  const handleSelectFile = useCallback(async (filename: string) => {
    if (!selectedCategory) return
    setSelectedFile(filename)
    try {
      const content = await readResourceFile(selectedCategory, filename)
      setPreviewText(content.slice(0, 500))
    } catch { setPreviewText('') }
  }, [selectedCategory])

  return (
    <div className="material-sidebar">
      <div className="material-sidebar-header">
        <h4>素材库</h4>
      </div>

      <select
        className="material-category-select"
        value={selectedCategory ?? ''}
        onChange={(e) => setSelectedCategory(e.target.value || null)}
      >
        <option value="">选择分类…</option>
        {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
      </select>

      <div className="material-file-list">
        {files.map((f) => (
          <div
            key={f.name}
            className={`material-file-item${selectedFile === f.name ? ' active' : ''}`}
            onClick={() => handleSelectFile(f.name)}
          >
            {f.name.replace(/\.md$/i, '')}
          </div>
        ))}
        {selectedCategory && files.length === 0 && (
          <p className="material-empty">该分类暂无素材</p>
        )}
      </div>

      {selectedFile ? (
        <div className="material-preview">
          <div className="material-preview-header">
            <span className="material-filename">{selectedFile}</span>
            <button
              className="btn-primary"
              style={{ fontSize: '0.78rem', padding: '2px 8px' }}
              onClick={() => onInsert(previewText)}
            >
              插入
            </button>
          </div>
          <pre className="material-preview-content">{previewText}</pre>
        </div>
      ) : (
        <p className="material-empty" style={{ padding: 16 }}>
          {selectedCategory ? '选择素材文件预览' : '选择分类后浏览素材，点击「插入」添加到编辑器光标位置'}
        </p>
      )}
    </div>
  )
}
