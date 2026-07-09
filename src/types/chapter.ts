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
