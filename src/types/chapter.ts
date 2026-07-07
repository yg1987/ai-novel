export interface ChapterMeta {
  id: string
  title: string
  order: number
}

export interface ChapterContent {
  meta: ChapterMeta
  content: string
}
