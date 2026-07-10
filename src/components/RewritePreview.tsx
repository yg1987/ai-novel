import { useState, useCallback } from 'react'
import { rewriteText, stopRewrite, type RewriteMode } from '../services/rewriteService'

interface Props {
  selectedText: string
  beforeText: string
  afterText: string
  defaultMode?: RewriteMode
  onAccept: (newText: string) => void
  onReject: () => void
}

export default function RewritePreview({ selectedText, beforeText, afterText, defaultMode = 'rewrite', onAccept, onReject }: Props) {
  const [mode, setMode] = useState<RewriteMode>(defaultMode)
  const [result, setResult] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setError(null)
    setResult('')
    await rewriteText({ selectedText, beforeText, afterText, mode }, {
      onToken: (text) => setResult((prev) => prev + text),
      onDone: () => setGenerating(false),
      onError: (err) => { setError(err); setGenerating(false) },
    })
  }, [selectedText, beforeText, afterText, mode])

  const handleStop = () => {
    stopRewrite()
    setGenerating(false)
  }

  const modeLabels: Record<RewriteMode, string> = { rewrite: '改写', expand: '扩写', polish: '润色' }

  return (
    <div className="rewrite-overlay">
      <div className="rewrite-panel">
        <div className="rewrite-header">
          <h3>AI {modeLabels[mode]}</h3>
          <div className="rewrite-modes">
            {(Object.entries(modeLabels) as [RewriteMode, string][]).map(([key, label]) => (
              <button
                key={key}
                className={`tab-btn${mode === key ? ' active' : ''}`}
                onClick={() => setMode(key)}
                disabled={generating}
              >
                {label}
              </button>
            ))}
          </div>
          <button className="btn-text" onClick={onReject} disabled={generating}>✕</button>
        </div>

        <div className="rewrite-compare">
          <div className="rewrite-column">
            <div className="rewrite-column-header">原文</div>
            <div className="rewrite-column-content">{selectedText}</div>
          </div>
          <div className="rewrite-column">
            <div className="rewrite-column-header">AI 建议</div>
            <div className="rewrite-column-content">
              {generating && !result && <span className="rewrite-streaming">生成中…</span>}
              {result || (error ? <span className="rewrite-error">{error}</span> : generating ? '' : '')}
              {generating && result && <span className="rewrite-cursor">▊</span>}
            </div>
          </div>
        </div>

        <div className="rewrite-actions">
          {generating ? (
            <button className="toolbar-btn stop-btn" onClick={handleStop}>■ 停止</button>
          ) : result ? (
            <>
              <button className="btn-primary" onClick={() => onAccept(result)}>✓ 接受</button>
              <button className="btn-text" onClick={handleGenerate}>🔄 重新生成</button>
            </>
          ) : (
            <button className="btn-primary" onClick={handleGenerate}>✨ 生成</button>
          )}
        </div>
      </div>
    </div>
  )
}
