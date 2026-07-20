export type MaterialContentFormat = 'plain_text' | 'markdown'
export type MaterialScope = 'global' | 'projects'
export type MaterialSourceType = 'original' | 'book' | 'web' | 'file' | 'image'
export type MaterialUsageAction = 'insert' | 'ai_context'
export type MaterialDocumentFormat = 'txt' | 'epub'
export type TxtImportMode = 'detected_sections' | 'single'

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
  sourceDocumentId?: string
  sourceSectionId?: string
  sourceLocator?: string
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
  sourceDocumentId?: string
  sourceSectionId?: string
  sourceLocator?: string
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
  sourceDocumentId?: string
  sourceSectionId?: string
  sourceLocator?: string
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

export interface MaterialDocumentSection {
  id: string
  documentId: string
  order: number
  title: string
  relativePath: string
  characterCount: number
}

export interface MaterialDocument {
  schemaVersion: 1
  id: string
  title: string
  author: string
  format: MaterialDocumentFormat
  attachmentId: string
  scope: MaterialScope
  projectIds: string[]
  sectionIds: string[]
  createdAt: string
  updatedAt: string
}

export interface MaterialDocumentSectionPreview {
  order: number
  title: string
  characterCount: number
  contentPreview: string
}

export interface MaterialDocumentImportPreview {
  fileName: string
  format: MaterialDocumentFormat
  title: string
  author: string
  detectedEncoding?: string
  sections: MaterialDocumentSectionPreview[]
}

export interface TxtSectionEdit {
  order: number
  title: string
  mergeWithPrevious: boolean
}

export interface MaterialDocumentImportOptions {
  title?: string
  author?: string
  txtMode?: TxtImportMode
  txtSectionEdits?: TxtSectionEdit[]
}

export interface MaterialDocumentSummary {
  id: string
  title: string
  author: string
  format: MaterialDocumentFormat
  scope: MaterialScope
  projectIds: string[]
  sectionCount: number
  updatedAt: string
}

export interface MaterialDocumentPage {
  items: MaterialDocumentSummary[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export interface MaterialDocumentDetail {
  document: MaterialDocument
  sections: MaterialDocumentSection[]
}

export interface MaterialDocumentSectionContent {
  document: MaterialDocument
  section: MaterialDocumentSection
  content: string
}

export interface MaterialDocumentSearchResult {
  documentId: string
  sectionId: string
  documentTitle: string
  sectionTitle: string
  snippet: string
  score: number
}

export interface MaterialDocumentSourceStatus {
  documentExists: boolean
  sectionExists: boolean
}

export interface WebMaterialPreview {
  title: string
  sourceName: string
  sourceUrl: string
  content: string
}

export interface MaterialImageAttachment {
  id: string
  materialId: string
  originalName: string
  mimeType: string
  size: number
  relativePath: string
  createdAt: string
}

export interface MaterialImageAttachmentContent {
  attachment: MaterialImageAttachment
  bytes: number[]
}

export interface FileCleanupResult {
  cleanupPending: boolean
}

export interface MarkdownMaterialImportPreview {
  title: string
  sourceName: string
  content: string
}
