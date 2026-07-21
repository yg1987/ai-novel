import { useCallback, useState } from 'react'

export const CHAPTER_SEGMENT_SIZE_OPTIONS = [25, 50, 100] as const
export type ChapterSegmentSize = (typeof CHAPTER_SEGMENT_SIZE_OPTIONS)[number]

const DEFAULT_CHAPTER_SEGMENT_SIZE: ChapterSegmentSize = 50

export function loadChapterSegmentSize(
  projectId: string,
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): ChapterSegmentSize {
  const stored = Number(storage.getItem(`chapter-segment-size:${projectId}`))
  return stored === 25 || stored === 100 ? stored : DEFAULT_CHAPTER_SEGMENT_SIZE
}

export function saveChapterSegmentSize(
  projectId: string,
  value: ChapterSegmentSize,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
): void {
  storage.setItem(`chapter-segment-size:${projectId}`, String(value))
}

/** Shared, project-scoped chapter grouping preference for writing-related tabs. */
export function useChapterSegmentSize(projectId: string) {
  const [state, setState] = useState(() => ({ projectId, value: loadChapterSegmentSize(projectId) }))
  const segmentSize = state.projectId === projectId ? state.value : loadChapterSegmentSize(projectId)

  const setSegmentSize = useCallback((value: ChapterSegmentSize) => {
    saveChapterSegmentSize(projectId, value)
    setState({ projectId, value })
  }, [projectId])

  return [segmentSize, setSegmentSize] as const
}
