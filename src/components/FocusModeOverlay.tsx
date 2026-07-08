import { useState, useEffect } from 'react'
import { FocusSession, type FocusConfig } from '../services/focusService'

interface Props {
  wordCount: number
  targetWords: number
  onExit: () => void
}

const DEFAULT_MINUTES = 25
const DEFAULT_WORDS = 500

export default function FocusModeOverlay({ wordCount, targetWords: _targetWords, onExit }: Props) {
  const [session] = useState(() => new FocusSession())
  const [elapsed, setElapsed] = useState(0)
  const [targetMinutes, setTargetMinutes] = useState(DEFAULT_MINUTES)
  const [sessionTarget, setSessionTarget] = useState(DEFAULT_WORDS)
  const [started, setStarted] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    return () => { session.stop() }
  }, [session])

  const handleStart = () => {
    setStarted(true)
    const config: FocusConfig = { targetMinutes, targetWords: sessionTarget }
    session.start(config, {
      onTick: (e) => setElapsed(e),
      onComplete: () => setCompleted(true),
    })
  }

  const handlePause = () => {
    session.togglePause()
    setPaused(session.isPaused)
  }

  const formatTime = (s: number): string => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  if (completed) {
    return (
      <div className="focus-overlay" onClick={onExit}>
        <div className="focus-panel" onClick={(e) => e.stopPropagation()}>
          <div className="focus-completed">
            <div className="focus-completed-icon">🎉</div>
            <h2>专注完成！</h2>
            <p>本次写作：{wordCount} 字 / 目标 {sessionTarget} 字</p>
            <p className="focus-completed-time">用时 {formatTime(elapsed)}</p>
            <button className="btn-primary" onClick={onExit}>返回</button>
          </div>
        </div>
      </div>
    )
  }

  if (!started) {
    return (
      <div className="focus-overlay" onClick={onExit}>
        <div className="focus-panel" onClick={(e) => e.stopPropagation()}>
          <h2>专注模式</h2>
          <div className="focus-config">
            <label>
              目标时长（分钟）
              <input type="number" min={5} max={120} value={targetMinutes}
                onChange={(e) => setTargetMinutes(Number(e.target.value))} />
            </label>
            <label>
              目标字数
              <input type="number" min={100} max={5000} step={100} value={sessionTarget}
                onChange={(e) => setSessionTarget(Number(e.target.value))} />
            </label>
          </div>
          <div className="focus-actions">
            <button className="btn-primary" onClick={handleStart}>开始专注</button>
            <button className="btn-text" onClick={onExit}>取消</button>
          </div>
        </div>
      </div>
    )
  }

  const progress = targetMinutes > 0 ? Math.min(elapsed / (targetMinutes * 60), 1) : 0

  return (
    <div className="focus-overlay">
      <div className="focus-panel focus-active">
        <div className="focus-progress-bar">
          <div className="focus-progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="focus-timer">{formatTime(elapsed)}</div>
        <div className="focus-target">目标 {targetMinutes} 分钟</div>
        <div className="focus-stats">
          <span>已写 {wordCount} 字</span>
          <span>目标 {sessionTarget} 字</span>
        </div>
        <div className="focus-actions">
          <button className="btn-text" onClick={handlePause}>
            {paused ? '▶ 继续' : '⏸ 暂停'}
          </button>
          <button className="btn-text" style={{ color: 'var(--danger)' }} onClick={() => { session.stop(); onExit() }}>
            ✕ 放弃
          </button>
        </div>
      </div>
    </div>
  )
}
