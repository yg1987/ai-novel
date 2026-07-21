/** Stable position of a chapter inside the current project chapter tree. */
export interface ChapterRef {
  volume: string
  chapterId: string
}

/** A `volume:chapterId` key for UI state and persisted per-chapter metadata. */
export type ChapterKey = string & { readonly __brand: 'ChapterKey' }

export interface ChapterMeta {
  id: string
  title: string
  order: number
  volume: string
}

export interface ChapterContent {
  meta: ChapterMeta
  content: string
}
