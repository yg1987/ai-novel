import { useState, useCallback } from 'react'
import { exportAsPlainText, exportAsMarkdown, exportAsEpub, type ExportFormat, type ExportProgress } from '../services/exportService'

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

  return (
    <div className="rewrite-overlay" onClick={onClose}>
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
