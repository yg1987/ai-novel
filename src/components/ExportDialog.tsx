import { useState, useCallback } from 'react'
import { exportAsPlainText, exportAsMarkdown, exportAsEpub, type ExportFormat, type ExportProgress } from '../services/exportService'
import { adaptForPlatform, PLATFORM_LABELS, type PublishPlatform } from '../utils/formatAdapter'
import { listChapters, getChapterContent } from '../api/tauri'

interface Props {
  projectId: string
  projectName: string
  onClose: () => void
}

export default function ExportDialog({ projectId, projectName, onClose }: Props) {
  const [format, setFormat] = useState<ExportFormat>('txt')
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [publishPlatform, setPublishPlatform] = useState<PublishPlatform>('raw')
  const [publishPreview, setPublishPreview] = useState('')
  const [copied, setCopied] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const handleExport = useCallback(async () => {
    setExporting(true)
    setError(null)
    const onProgress = (p: ExportProgress) => setProgress(p)
    try {
      if (format === 'txt') {
        await exportAsPlainText(projectId, projectName, onProgress)
      } else if (format === 'markdown') {
        await exportAsMarkdown(projectId, projectName, onProgress)
      } else if (format === 'epub') {
        await exportAsEpub(projectId, projectName, onProgress)
      }
      setDone(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setExporting(false)
    }
  }, [projectId, projectName, format])

  const formatLabels: Record<ExportFormat, string> = {
    txt: '纯文本 (.txt)',
    markdown: 'Markdown (.md)',
    epub: 'EPUB (.epub)',
  }

  const handlePublishCopy = useCallback(async () => {
    setLoadingPreview(true)
    setCopied(false)
    try {
      const chapters = await listChapters(projectId)
      chapters.sort((a, b) => a.order - b.order)
      const parts: string[] = []
      for (const ch of chapters) {
        const html = await getChapterContent(projectId, ch.volume, ch.id)
        parts.push(adaptForPlatform(html, publishPlatform))
      }
      const text = parts.join('\n\n')
      setPublishPreview(text.slice(0, 500))
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoadingPreview(false)
    }
  }, [projectId, publishPlatform])

  return (
    <div className="rewrite-overlay">
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="export-header">
          <h3>导出项目</h3>
          <button className="btn-text" onClick={onClose}>✕</button>
        </div>

        <div className="export-body">
          {done ? (
            <div className="export-done">
              <p>✅ 导出成功</p>
              <button className="btn-primary" onClick={onClose}>完成</button>
            </div>
          ) : (
            <>
              <label className="export-label">选择导出格式：</label>
              <div className="export-format-list">
                {(Object.entries(formatLabels) as [ExportFormat, string][]).map(([key, label]) => (
                  <label key={key} className={`export-format-item${format === key ? ' selected' : ''}`}>
                    <input
                      type="radio"
                      name="format"
                      value={key}
                      checked={format === key}
                      onChange={() => setFormat(key)}
                      disabled={exporting}
                    />
                    <span className="export-format-label">{label}</span>
                  </label>
                ))}
              </div>

              {progress && (
                <div className="export-progress">
                  <div className="export-progress-bar">
                    <div
                      className="export-progress-fill"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                  <span className="export-progress-text">
                    正在导出 {progress.chapterId} ({progress.current}/{progress.total})
                  </span>
                </div>
              )}

              {error && <div className="error-bar">{error}</div>}

              <div className="export-divider" />
              <label className="export-label">发布格式（一键复制）</label>
              <div className="export-format-list">
                {(Object.entries(PLATFORM_LABELS) as [PublishPlatform, string][]).map(([key, label]) => (
                  <label key={key} className={`export-format-item${publishPlatform === key ? ' selected' : ''}`}>
                    <input
                      type="radio"
                      name="publishPlatform"
                      value={key}
                      checked={publishPlatform === key}
                      onChange={() => setPublishPlatform(key)}
                    />
                    <span className="export-format-label">{label}</span>
                  </label>
                ))}
              </div>
              <button
                className="btn-primary"
                onClick={handlePublishCopy}
                disabled={loadingPreview}
                style={{ width: '100%', marginTop: 8 }}
              >
                {loadingPreview ? '生成中…' : copied ? '✅ 已复制' : '📋 复制全文'}
              </button>
              {publishPreview && (
                <div className="export-preview">
                  <div className="export-preview-header">预览（前500字）</div>
                  <div className="export-preview-text">{publishPreview}</div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="export-footer">
          {!done && (
            <button
              className="btn-primary"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? '导出中…' : '导出'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
