import { useState } from 'react'
import { runBrainstorm, type BrainstormMode, type BrainstormResult } from '../services/brainstormService'
import Button from './Button'
import './BrainstormPanel.css'

interface Props {
  projectId: string
}

const MODE_CONFIG: { key: BrainstormMode; label: string; icon: string; desc: string }[] = [
  { key: 'plot_twist', label: '情节走向', icon: '🔄', desc: '卡文时找新方向' },
  { key: 'scene_idea', label: '场景创意', icon: '🎬', desc: '缺少具体桥段' },
  { key: 'character_dev', label: '角色发展', icon: '👤', desc: '角色需要成长' },
  { key: 'world_expand', label: '世界观扩展', icon: '🌍', desc: '想丰富设定' },
]

export default function BrainstormPanel({ projectId }: Props) {
  const [mode, setMode] = useState<BrainstormMode>('plot_twist')
  const [results, setResults] = useState<BrainstormResult[]>([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    setResults([])
    try {
      const res = await runBrainstorm({ mode, projectId })
      setResults(res)
    } catch (e) {
      setError(String(e))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="panel-layout brainstorm-panel">
      <div className="panel-sidebar brainstorm-sidebar">
        <h3>灵感模式</h3>
        <p className="brainstorm-subtitle">选择你需要的创意方向</p>
        <div className="brainstorm-modes">
          {MODE_CONFIG.map((m) => (
            <button
              key={m.key}
              className={`brainstorm-mode-btn${mode === m.key ? ' active' : ''}`}
              onClick={() => setMode(m.key)}
            >
              <span className="brainstorm-mode-icon">{m.icon}</span>
              <span className="brainstorm-mode-label">{m.label}</span>
              <span className="brainstorm-mode-desc">{m.desc}</span>
            </button>
          ))}
        </div>
        <Button variant="primary" size="md" onClick={handleGenerate} disabled={generating} style={{ width: '100%', marginTop: 12 }}>
          {generating ? '⏳ 思考中…' : '🚀 开始脑暴'}
        </Button>
        {error && <div className="error-bar" style={{ marginTop: 8 }}>{error}</div>}
      </div>

      <div className="panel-editor brainstorm-content">
        {results.length > 0 ? (
          <div className="brainstorm-results">
            <h3>创意建议</h3>
            {results.map((r, i) => (
              <div key={i} className="brainstorm-card">
                <div className="brainstorm-card-header">
                  <span className="brainstorm-card-index">{i + 1}</span>
                  <h4>{r.title}</h4>
                </div>
                <div className="brainstorm-card-body">
                  {r.content.split('\n').map((line, j) => (
                    <p key={j}>{line}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="review-empty">
            <p style={{ fontSize: '2rem', marginBottom: 16 }}>💡</p>
            <p>选择左侧的创意方向，点击「生成灵感」</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 8 }}>
              AI 会根据你的项目数据（最近章节、角色状态、未解伏笔）生成有针对性的建议
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
