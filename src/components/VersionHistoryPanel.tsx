import { useState, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type { VersionMeta } from '../types/review'
import { listChapterVersions, getChapterVersion, restoreChapterVersion, deleteChapterVersion, renameChapterVersion } from '../api/tauri'
import Button from './Button'

interface Props {
  projectId: string
  volume: string
  chapterId: string | null
  onRestore?: () => void
}

export default function VersionHistoryPanel({ projectId, volume, chapterId, onRestore }: Props) {
  const [versions, setVersions] = useState<VersionMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [previewContent, setPreviewContent] = useState<string>('')
  const [renamingVersion, setRenamingVersion] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null)

  useEffect(() => {
    if (!chapterId) return
    setLoading(true)
    listChapterVersions(projectId, volume, chapterId)
      .then(setVersions)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [projectId, volume, chapterId])

  const handlePreview = async (version: number) => {
    if (!chapterId) return
    setSelectedVersion(version)
    try {
      const content = await getChapterVersion(projectId, volume, chapterId, version)
      setPreviewContent(content)
    } catch (e) {
      console.error('Failed to load version:', e)
    }
  }

  const handleRestore = async (version: number) => {
    if (!chapterId) return
    try {
      await restoreChapterVersion(projectId, volume, chapterId, version)
      setConfirmRestore(null)
      onRestore?.()
    } catch (e) {
      console.error('Failed to restore:', e)
    }
  }

  const handleDelete = async (version: number) => {
    if (!chapterId) return
    try {
      await deleteChapterVersion(projectId, volume, chapterId, version)
      setVersions((prev) => prev.filter((v) => v.version !== version))
    } catch (e) {
      console.error('Failed to delete version:', e)
    }
  }

  const handleRename = async (version: number) => {
    if (!chapterId || !renameValue.trim()) return
    try {
      await renameChapterVersion(projectId, volume, chapterId, version, renameValue.trim())
      setVersions((prev) => prev.map((v) => v.version === version ? { ...v, label: renameValue.trim() } : v))
      setRenamingVersion(null)
      setRenameValue('')
    } catch (e) {
      console.error('Failed to rename:', e)
    }
  }

  const sourceLabel = (source: string): string => {
    const map: Record<string, string> = {
      auto_save: '自动保存', manual_save: '手动保存',
      ai_generated: 'AI 生成', restore: '恢复', rewrite: '改写',
    }
    return map[source] ?? source
  }

  const previewEditor = useEditor(
    {
      content: previewContent,
      editable: false,
      extensions: [StarterKit],
      editorProps: { attributes: { class: 'editor-content' } },
    },
    [previewContent],
  )

  if (!chapterId) return <div className="review-empty">请先选择一个章节</div>

  return (
    <div className="version-panel panel-layout">
      <div className="version-sidebar panel-sidebar">
        <div className="version-sidebar-header">
          <h3>版本历史</h3>
          <span className="version-count">{versions.length} 个版本</span>
        </div>
        <div className="version-list">
          {versions.length === 0 && !loading && (
            <p className="review-empty">暂无历史版本</p>
          )}
          {versions.map((v) => (
            <div
              key={v.version}
              className={`version-item${selectedVersion === v.version ? ' active' : ''}`}
              onClick={() => handlePreview(v.version)}
            >
              <div className="version-item-header">
                <span className="version-number">v{v.version}</span>
                <span className="version-source">{sourceLabel(v.source)}</span>
              </div>
              <div className="version-item-meta">
                <span>{v.word_count} 字</span>
                <span>{v.created_at.slice(0, 16).replace('T', ' ')}</span>
              </div>
              {v.label && <div className="version-label">{v.label}</div>}
              <div className="version-actions">
                {renamingVersion === v.version ? (
                  <div className="version-rename-inline">
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(v.version); if (e.key === 'Escape') setRenamingVersion(null) }}
                      placeholder="版本标记…"
                      autoFocus
                    />
                    <Button variant="text" size="sm" onClick={() => handleRename(v.version)}>✓</Button>
                    <Button variant="text" size="sm" onClick={() => setRenamingVersion(null)}>✕</Button>
                  </div>
                ) : (
                  <Button variant="text" size="sm" onClick={(e) => { e.stopPropagation(); setRenamingVersion(v.version); setRenameValue(v.label) }}>
                    标记
                  </Button>
                )}
                <Button variant="text" size="sm" onClick={(e) => { e.stopPropagation(); setConfirmRestore(v.version) }}>
                  回退
                </Button>
                <Button variant="text" size="sm" style={{ color: 'var(--danger)' }} onClick={(e) => { e.stopPropagation(); handleDelete(v.version) }}>
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="version-preview panel-editor">
        {selectedVersion ? (
          <>
            <div className="version-preview-header">
              <h4>v{selectedVersion} 预览</h4>
              {confirmRestore === selectedVersion ? (
                <div className="dialog-footer" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
                  <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>确认恢复到 v{selectedVersion}？</span>
                  <Button variant="text" size="sm" onClick={() => setConfirmRestore(null)}>取消</Button>
                  <Button variant="primary" size="sm" onClick={() => handleRestore(selectedVersion)}>确认恢复</Button>
                </div>
              ) : null}
            </div>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {previewEditor && <EditorContent editor={previewEditor} className="editor-content-wrapper" />}
            </div>
          </>
        ) : (
          <div className="review-empty">
            <p>选择一个版本查看内容</p>
          </div>
        )}
      </div>
    </div>
  )
}
