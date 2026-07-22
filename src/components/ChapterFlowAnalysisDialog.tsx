import { useMemo, useState } from 'react'
import type { ChapterMeta, ChapterRef } from '../types/chapter'
import { chapterRefKey } from '../services/chapterDisplay'
import type { ChapterAnalysisStatus } from '../services/chapterFlowIndexStorage'
import type { ChapterFlowAnalysisProgress, ChapterFlowAnalysisResult } from '../services/chapterFlowAnalysis'
import Button from './Button'
import Modal from './Modal'

type Scope = 'pending' | 'selected' | 'volume' | 'all'

interface Props {
  chapters: ChapterMeta[]
  statuses: Array<{ ref: ChapterRef; status: ChapterAnalysisStatus }>
  selectedRef: ChapterRef | null
  running: boolean
  progress: ChapterFlowAnalysisProgress | null
  result: ChapterFlowAnalysisResult | null
  onStart: (refs: ChapterRef[]) => void
  onCancel: () => void
  onClose: () => void
}

export default function ChapterFlowAnalysisDialog({
  chapters,
  statuses,
  selectedRef,
  running,
  progress,
  result,
  onStart,
  onCancel,
  onClose,
}: Props) {
  const [scope, setScope] = useState<Scope>('pending')
  const volumes = useMemo(() => [...new Set(chapters.map((chapter) => chapter.volume))], [chapters])
  const [volume, setVolume] = useState(volumes[0] ?? '')
  const statusByRef = useMemo(() => new Map(statuses.map((item) => [chapterRefKey(item.ref), item.status])), [statuses])
  const refs = useMemo(() => chapters.flatMap((chapter): ChapterRef[] => {
    const ref = { volume: chapter.volume, chapterId: chapter.id }
    if (scope === 'selected') return selectedRef && chapterRefKey(selectedRef) === chapterRefKey(ref) ? [ref] : []
    if (scope === 'volume') return chapter.volume === volume ? [ref] : []
    if (scope === 'pending') {
      const status = statusByRef.get(chapterRefKey(ref)) ?? 'missing'
      return status === 'missing' || status === 'stale' || status === 'failed' ? [ref] : []
    }
    return [ref]
  }), [chapters, scope, selectedRef, statusByRef, volume])

  return (
    <Modal className="chapter-flow-analysis-dialog">
      <h3>更新 AI 分析</h3>
      <div className="chapter-flow-analysis-scopes">
        <label><input type="radio" name="chapter-flow-scope" checked={scope === 'pending'} onChange={() => setScope('pending')} disabled={running} />所有待处理章节</label>
        <label><input type="radio" name="chapter-flow-scope" checked={scope === 'selected'} onChange={() => setScope('selected')} disabled={running || !selectedRef} />选中章节</label>
        <label><input type="radio" name="chapter-flow-scope" checked={scope === 'volume'} onChange={() => setScope('volume')} disabled={running} />指定卷</label>
        <label><input type="radio" name="chapter-flow-scope" checked={scope === 'all'} onChange={() => setScope('all')} disabled={running} />全书</label>
      </div>
      {scope === 'volume' && (
        <select value={volume} onChange={(event) => setVolume(event.target.value)} disabled={running} aria-label="分析卷">
          {volumes.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      )}
      <p className="chapter-flow-analysis-notice">此操作将进行 {refs.length} 次基础章节分析；每章最多追加 3 次跨章候选核对，可能耗时数分钟。分析只更新章节脉络的派生结果，不会修改正文、细纲或伏笔正式记录。</p>
      {(running || progress) && (
        <div className="chapter-flow-analysis-progress">
          <progress value={progress?.completed ?? 0} max={Math.max(1, progress?.total ?? refs.length)} />
          <span>{progress?.current ? `${progress.current.volume} · ${progress.current.chapterId}` : '准备任务'}</span>
          <span>{progress?.completed ?? 0}/{progress?.total ?? refs.length} · 成功 {progress?.succeeded ?? 0} · 失败 {progress?.failed ?? 0}</span>
        </div>
      )}
      {result && !running && (
        <p className="chapter-flow-analysis-result">
          已完成 {result.completed} 章，成功 {result.succeeded}，失败 {result.failed}{result.cancelled ? '，任务已取消' : ''}。
        </p>
      )}
      <div className="dialog-footer">
        <Button variant="text" size="sm" onClick={onClose} disabled={running}>关闭</Button>
        {running ? (
          <Button variant="danger" size="md" onClick={onCancel}>取消任务</Button>
        ) : (
          <Button variant="primary" size="md" onClick={() => onStart(refs)} disabled={refs.length === 0}>{result?.cancelled || result?.failed ? '继续分析' : '开始分析'}</Button>
        )}
      </div>
    </Modal>
  )
}
