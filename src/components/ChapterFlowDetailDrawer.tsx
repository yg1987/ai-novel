import { useEffect, useState } from 'react'
import type { ChapterRef } from '../types/chapter'
import type { ChapterFlowEntry } from '../services/chapterFlowService'
import { chapterRefKey } from '../services/chapterDisplay'
import {
  readChapterAnalysisDetail,
  readChapterFlowFinding,
  type ChapterAnalysisDetail,
  type ChapterAnalysisStatus,
  type ChapterFlowFinding,
} from '../services/chapterFlowIndexStorage'
import Button from './Button'
import Modal from './Modal'

interface Props {
  projectId: string
  chapter: ChapterRef
  label: string
  exists: boolean
  entries: ChapterFlowEntry[]
  analysisStatus: ChapterAnalysisStatus
  onClose: () => void
  onNavigateToChapter: (ref: ChapterRef) => void
  onNavigateToForeshadow: (id: string) => void
}

function matches(left: ChapterRef | undefined, right: ChapterRef): boolean {
  return Boolean(left && left.volume === right.volume && left.chapterId === right.chapterId)
}

export default function ChapterFlowDetailDrawer({
  projectId,
  chapter,
  label,
  exists,
  entries,
  analysisStatus,
  onClose,
  onNavigateToChapter,
  onNavigateToForeshadow,
}: Props) {
  const [analysis, setAnalysis] = useState<ChapterAnalysisDetail | null>(null)
  const [findings, setFindings] = useState<ChapterFlowFinding[]>([])
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!exists || (analysisStatus !== 'ready' && analysisStatus !== 'stale')) return () => { active = false }
    readChapterAnalysisDetail(projectId, chapter)
      .then(async (detail) => {
        const loaded = await Promise.all(detail.findingIds.map((id) => readChapterFlowFinding(projectId, id)))
        if (active) {
          setAnalysis(detail)
          setFindings(loaded)
          setAnalysisError(null)
        }
      })
      .catch((error: unknown) => {
        if (active) setAnalysisError(error instanceof Error ? error.message : String(error))
      })
    return () => { active = false }
  }, [analysisStatus, chapter, exists, projectId])

  return (
    <Modal className="chapter-flow-detail-modal" onRequestClose={onClose}>
      <div className="chapter-flow-detail-modal-content">
      <div className="chapter-flow-detail-header">
        <div><strong>{label}</strong><small>{chapter.volume} · {chapter.chapterId}</small></div>
      </div>
      <div className="chapter-flow-detail-body">
        {!exists && <p className="chapter-flow-detail-notice">这是尚未创建正文的计划位置。</p>}
        {exists && <section className="chapter-flow-analysis-detail">
          <div className="chapter-flow-analysis-detail-title"><strong>AI 内容分析</strong><span className={`analysis-${analysisStatus}`}>{analysisStatus === 'ready' ? '已分析' : analysisStatus === 'stale' ? '已过期' : analysisStatus === 'failed' ? '分析失败' : '未分析'}</span></div>
          {analysisError && <p className="chapter-flow-detail-notice">分析详情不可用：{analysisError}</p>}
          {analysis && (
            <>
              <p>{analysis.summary || '暂无摘要'}</p>
              {analysis.keyEvents.length > 0 && <ul>{analysis.keyEvents.map((event) => <li key={event}>{event}</li>)}</ul>}
              {analysis.endingHook && <p><strong>结尾钩子：</strong>{analysis.endingHook}</p>}
              {findings.map((finding) => (
                <article key={finding.id} className="chapter-flow-finding">
                  <strong>{finding.summary}</strong><span>置信度 {Math.round(finding.confidence * 100)}%</span>
                  {finding.evidence.map((evidence) => <blockquote key={`${chapterRefKey(evidence.chapter)}:${evidence.quote}`}>{evidence.quote}</blockquote>)}
                  {finding.target && <Button variant="text" size="sm" onClick={() => onNavigateToChapter(finding.target!)}>打开关联章节</Button>}
                </article>
              ))}
            </>
          )}
        </section>}
        {entries.length === 0 ? <p className="chapter-flow-detail-empty">该章暂无伏笔计划或执行记录。</p> : entries.map(({ entry, check }) => (
          <section key={entry.id} className="chapter-flow-detail-entry">
            <strong>{entry.name}</strong>
            <div className="chapter-flow-detail-tags">
              {matches(entry.plantedChapter, chapter) && <span>埋设</span>}
              {matches(entry.plannedResolutionChapter, chapter) && <span>计划回收</span>}
              {entry.progress.some((progress) => matches(progress.chapter, chapter)) && <span>已记录推进</span>}
              {matches(entry.recordedResolutionChapter, chapter) && <span>已记录回收</span>}
            </div>
            <p>{check.message}</p>
            <Button variant="text" size="sm" onClick={() => onNavigateToForeshadow(entry.id)}>打开伏笔</Button>
          </section>
        ))}
      </div>
      <div className="chapter-flow-detail-footer">
        {exists
          ? <Button variant="primary" size="sm" onClick={() => onNavigateToChapter(chapter)}>打开章节</Button>
          : <span>请先在写作模块创建该章。</span>}
      </div>
      </div>
    </Modal>
  )
}
