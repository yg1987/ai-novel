export type MaterialContentFormat = 'plain_text' | 'markdown'
export type MaterialScope = 'global' | 'projects'
export type MaterialSourceType = 'original' | 'book' | 'web' | 'file' | 'image'
export type MaterialUsageAction = 'insert' | 'ai_context'

export interface CurrentChapterRef {
  projectId: string
  volume: string
  chapterId: string
  chapterTitle: string
}

export interface MaterialContextSelection {
  materialId: string
  title: string
  excerpt: string
}

export interface MaterialItem {
  schemaVersion: 1
  id: string
  title: string
  kindId: string
  content: string
  contentFormat: MaterialContentFormat
  summary: string
  sourceType: MaterialSourceType
  sourceName: string
  sourceUrl: string
  categoryId: string
  tags: string[]
  scope: MaterialScope
  projectIds: string[]
  favorite: boolean
  attachmentIds: string[]
  createdAt: string
  updatedAt: string
}

export interface MaterialKindDefinition {
  id: string
  name: string
  order: number
  presetKey: string | null
  archived: boolean
}

export interface MaterialCategory {
  id: string
  name: string
  parentId: string | null
  order: number
  systemKey: 'inbox' | null
}

export interface MaterialFilter {
  query?: string
  kindId?: string
  categoryId?: string
  tag?: string
  favorite?: boolean
  projectId?: string
}

export interface MaterialSummary {
  id: string
  title: string
  kindId: string
  categoryId: string
  summary: string
  contentPreview: string
  sourceName: string
  tags: string[]
  scope: MaterialScope
  projectIds: string[]
  favorite: boolean
  updatedAt: string
}

export interface MaterialPage {
  items: MaterialSummary[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export interface MaterialSearchResult {
  materialId: string
  title: string
  snippet: string
  score: number
}

export interface MaterialWriteInput {
  title: string
  kindId: string
  content: string
  contentFormat?: MaterialContentFormat
  summary?: string
  sourceType?: MaterialSourceType
  sourceName?: string
  sourceUrl?: string
  categoryId: string
  tags?: string[]
  scope: MaterialScope
  projectIds: string[]
  favorite?: boolean
}

export type MaterialUpdatePatch = Partial<MaterialWriteInput>

export interface MaterialUsage {
  id: string
  materialId: string
  action: MaterialUsageAction
  projectId: string
  volume: string
  chapterId: string
  chapterTitle: string
  excerpt: string
  createdAt: string
}

export interface CreateMaterialUsageInput {
  materialId: string
  action: MaterialUsageAction
  projectId: string
  volume: string
  chapterId: string
  chapterTitle: string
  excerpt: string
}

export interface LegacyCleanupSummary {
  cleanedProjects: number
  skippedProjects: number
}
