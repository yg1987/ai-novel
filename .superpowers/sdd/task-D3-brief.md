### Task D3: StatisticsPanel Component

**Files:**
- Create: `src/components/StatisticsPanel.tsx`

- [ ] **Step 1: Write StatisticsPanel**

```tsx
import { useState, useEffect, useCallback } from 'react'
import { computeDailyStats } from '../api/tauri'
import type { DailyStats } from '../api/tauri'

interface Props {
  projectId: string
  targetWords?: number
}

function maxWidth(bar: number, max: number): string {
  if (max === 0) return '0%'
  return `${Math.round((bar / max) * 100)}%`
}

export default function StatisticsPanel({ projectId, targetWords = 0 }: Props) {
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([])
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await computeDailyStats(projectId, days)
      setDailyStats(data)
    } catch (e) {
      console.error('Failed to load stats:', e)
    } finally {
      setLoading(false)
    }
  }, [projectId, days])

  useEffect(() => { load().catch(console.error) }, [load])

  const maxCharCount = Math.max(...dailyStats.map((d) => d.char_count), 1)
  const totalWords = dailyStats.reduce((s, d) => s + d.word_count, 0)
  const avgDaily = dailyStats.length > 0 ? Math.round(totalWords / dailyStats.length) : 0
  const aiRatio = dailyStats.reduce((s, d) => s + d.ai_generations, 0)
  const progress = targetWords > 0 ? Math.min(100, Math.round((totalWords / targetWords) * 100)) : 0

  return (
    <div className="panel-layout">
      <div className="panel-sidebar" style={{ width: 200 }}>
        <div className="panel-sidebar-header">
          <h3>统计概览</h3>
        </div>
        <div className="panel-list" style={{ padding: 12 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>总字数</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{totalWords.toLocaleString()}</div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>日均字数</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{avgDaily.toLocaleString()}</div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>AI 生成次数</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{aiRatio}</div>
          </div>
          {targetWords > 0 && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>进度</div>
              <div style={{
                height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden',
              }}>
                <div style={{
                  width: `${progress}%`, height: '100%', background: 'var(--accent)',
                  borderRadius: 4, transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {progress}% ({totalWords.toLocaleString()}/{targetWords.toLocaleString()})
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: '8px', borderTop: '1px solid var(--border)' }}>
          <select
            value={days}
            onChange={(e) => { setDays(Number(e.target.value)) }}
            style={{ width: '100%', padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
          >
            <option value={7}>近 7 天</option>
            <option value={30}>近 30 天</option>
            <option value={90}>近 90 天</option>
          </select>
        </div>
      </div>
      <div className="panel-editor">
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          <h3 style={{ marginBottom: 16 }}>日更字数</h3>
          {loading ? (
            <div className="panel-placeholder">加载中…</div>
          ) : dailyStats.length === 0 ? (
            <div className="panel-placeholder">暂无数据，写几章后再来看看</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dailyStats.map((d) => (
                <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 80, fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0,
                  }}>
                    {d.date.slice(5)}
                  </span>
                  <div style={{
                    flex: 1, height: 20, background: 'var(--bg)',
                    borderRadius: 'var(--radius-sm)', overflow: 'hidden',
                    position: 'relative',
                  }}>
                    <div style={{
                      width: maxWidth(d.char_count, maxCharCount),
                      height: '100%',
                      background: d.char_count > 0 ? 'var(--accent)' : 'transparent',
                      borderRadius: 'var(--radius-sm)',
                      opacity: 0.7,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  <span style={{
                    width: 70, fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'right',
                    flexShrink: 0,
                  }}>
                    {d.char_count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: No errors
