import { useState, useEffect, useCallback } from 'react'
import type { ForeshadowEntry, ForeshadowStore } from '../types/novel'
import { readProjectFile, writeProjectFile } from '../api/tauri'

interface Props {
  projectId: string
  currentChapter: number
}

const FORESHADOW_FILE = 'foreshadows.json'
const FORESHADOW_DIR = 'memory'

function emptyStore(): ForeshadowStore {
  return { version: 1, entries: [], updatedAt: new Date().toISOString().slice(0, 16) }
}

function getUrgency(entry: ForeshadowEntry, currentChapter: number): { label: string; level: 'critical' | 'warning' | 'normal' } {
  if (entry.status === 'resolved' || entry.status === 'abandoned') {
    return { label: '已处理', level: 'normal' }
  }
  const age = currentChapter - entry.plantedChapter
  if (age > 30) return { label: `已过${String(age)}章未回收`, level: 'critical' }
  if (age > 15) return { label: `已过${String(age)}章`, level: 'warning' }
  return { label: `已埋${String(age)}章`, level: 'normal' }
}

export default function ForeshadowPanel({ projectId, currentChapter }: Props) {
  const [store, setStore] = useState<ForeshadowStore>(emptyStore)
  const [filter, setFilter] = useState<string>('all')

  const refresh = useCallback(async () => {
    try {
      const raw = await readProjectFile(projectId, FORESHADOW_DIR, FORESHADOW_FILE)
      if (raw.trim()) {
        setStore(JSON.parse(raw) as ForeshadowStore)
      }
    } catch { /* file may not exist */ }
  }, [projectId])

  useEffect(() => { refresh().catch((e: unknown) => { console.error(e) }) }, [refresh])

  const save = async (s: ForeshadowStore) => {
    setStore(s)
    await writeProjectFile(projectId, FORESHADOW_DIR, FORESHADOW_FILE, JSON.stringify(s, null, 2))
  }

  const handleDelete = (id: string) => {
    const updated = { ...store, entries: store.entries.filter((e) => e.id !== id), updatedAt: new Date().toISOString().slice(0, 16) }
    save(updated).catch(console.error)
  }

  const filtered = filter === 'all'
    ? store.entries
    : store.entries.filter((e) => e.status === filter)

  const counts = {
    all: store.entries.length,
    planted: store.entries.filter((e) => e.status === 'planted' || e.status === 'advanced').length,
    resolved: store.entries.filter((e) => e.status === 'resolved').length,
    abandoned: store.entries.filter((e) => e.status === 'abandoned').length,
  }

  return (
    <div className="foreshadow-panel">
      <div className="foreshadow-stats">
        <span>总计 {counts.all}</span>
        <span className="stat-active">待处理 {counts.planted}</span>
        <span className="stat-done">已回收 {counts.resolved}</span>
        <span className="stat-abandoned">已废弃 {counts.abandoned}</span>
      </div>

      <div className="notes-filter">
        <button className={`tab-btn${filter === 'all' ? ' active' : ''}`} onClick={() => { setFilter('all') }}>全部</button>
        <button className={`tab-btn${filter === 'planted' ? ' active' : ''}`} onClick={() => { setFilter('planted') }}>待处理</button>
        <button className={`tab-btn${filter === 'advanced' ? ' active' : ''}`} onClick={() => { setFilter('advanced') }}>推进中</button>
        <button className={`tab-btn${filter === 'resolved' ? ' active' : ''}`} onClick={() => { setFilter('resolved') }}>已回收</button>
      </div>

      <div className="foreshadow-list">
        {filtered.map((entry) => {
          const urgency = getUrgency(entry, currentChapter)
          return (
            <div key={entry.id} className={`foreshadow-item ${urgency.level}`}>
              <div className="foreshadow-item-header">
                <span className={`foreshadow-status status-${entry.status}`}>
                  {entry.status === 'planted' ? '待处理' : entry.status === 'advanced' ? '推进中' : entry.status === 'resolved' ? '已回收' : '已废弃'}
                </span>
                <span className="foreshadow-name">{entry.name}</span>
                <span className={`urgency-badge ${urgency.level}`}>{urgency.label}</span>
              </div>
              <div className="foreshadow-desc">{entry.description}</div>
              <div className="foreshadow-meta">
                <span>埋入: 第{entry.plantedChapter}章</span>
                {entry.resolvedChapter && <span>回收: 第{entry.resolvedChapter}章</span>}
                <span>重要度: {'★'.repeat(Math.round(entry.importance * 5))}</span>
              </div>
              <div className="foreshadow-actions">
                <button className="btn-text" onClick={() => { handleDelete(entry.id) }} style={{ color: 'var(--danger)' }}>删除</button>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && <p className="foreshadow-empty">暂无伏笔</p>}
      </div>
    </div>
  )
}
