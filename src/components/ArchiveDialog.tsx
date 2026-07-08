import { useState } from 'react'
import { archiveProject, importProject } from '../services/archiveService'

interface Props {
  projectId: string
  projectName: string
  onClose: () => void
  onImported?: () => void
}

export default function ArchiveDialog({ projectId, projectName, onClose, onImported }: Props) {
  const [working, setWorking] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async () => {
    setWorking(true)
    setError(null)
    try {
      await archiveProject(projectId, projectName)
      setDone(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setWorking(false)
    }
  }

  const handleImport = async () => {
    setWorking(true)
    setError(null)
    try {
      await importProject()
      setDone(true)
      onImported?.()
    } catch (e) {
      setError(String(e))
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="rewrite-overlay" onClick={onClose}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="export-header">
          <h3>项目存档</h3>
          <button className="btn-text" onClick={onClose}>✕</button>
        </div>

        <div className="export-body">
          {done ? (
            <div className="export-done">
              <p>✅ 操作成功</p>
              <button className="btn-primary" onClick={onClose}>完成</button>
            </div>
          ) : (
            <>
              <p className="export-label">导出当前项目为备份文件，或从备份文件导入</p>

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button
                  className="btn-primary"
                  onClick={handleExport}
                  disabled={working}
                  style={{ flex: 1 }}
                >
                  {working ? '导出中…' : '📤 导出存档'}
                </button>
                <button
                  className="btn-primary"
                  onClick={handleImport}
                  disabled={working}
                  style={{ flex: 1 }}
                >
                  {working ? '导入中…' : '📥 导入存档'}
                </button>
              </div>

              {error && <div className="error-bar" style={{ marginTop: 12 }}>{error}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
