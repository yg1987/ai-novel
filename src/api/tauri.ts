import { invoke } from '@tauri-apps/api/core'
import type { ProjectMeta, CreateProjectInput, UpdateProjectInput } from '../types/project'
import type { ChapterMeta } from '../types/chapter'
import type { ProviderConfig } from '../types/provider'
import type { VersionMeta } from '../types/review'
import type {
  LegacyCleanupSummary,
  MaterialCategory,
  MaterialFilter,
  MaterialItem,
  MaterialKindDefinition,
  MaterialPage,
  MaterialSearchResult,
  MaterialUpdatePatch,
  MaterialWriteInput,
} from '../types/material'

export async function createProject(input: CreateProjectInput): Promise<ProjectMeta> {
  return invoke<ProjectMeta>('create_project', {
    name: input.name,
    genre: input.genre,
    description: input.description,
    targetWords: input.target_words,
  })
}

export async function listProjects(): Promise<ProjectMeta[]> {
  return invoke<ProjectMeta[]>('list_projects')
}

export async function getProject(projectId: string): Promise<ProjectMeta> {
  return invoke<ProjectMeta>('get_project', { projectId })
}

export async function updateProject(input: UpdateProjectInput): Promise<ProjectMeta> {
  return invoke<ProjectMeta>('update_project', input as unknown as Record<string, unknown>)
}

export async function deleteProject(projectId: string): Promise<null> {
  return invoke<null>('delete_project', { projectId })
}

export async function listChapters(projectId: string): Promise<ChapterMeta[]> {
  return invoke<ChapterMeta[]>('list_chapters', { projectId })
}

export async function getChapterContent(projectId: string, volume: string, chapterId: string): Promise<string> {
  return invoke<string>('get_chapter_content', { projectId, volume, chapterId })
}

export async function saveChapterContent(projectId: string, volume: string, chapterId: string, content: string): Promise<null> {
  return invoke<null>('save_chapter_content', { projectId, volume, chapterId, content })
}

export async function commitChapterVersion(projectId: string, volume: string, chapterId: string, content: string): Promise<null> {
  return invoke<null>('commit_chapter_version', { projectId, volume, chapterId, content })
}

export async function loadProviderConfig(): Promise<ProviderConfig> {
  return invoke<ProviderConfig>('load_provider_config')
}

export async function saveProviderConfig(config: ProviderConfig): Promise<null> {
  return invoke<null>('save_provider_config', { config })
}

export async function getChapterOutline(projectId: string, chapterId: string): Promise<string> {
  return invoke<string>('get_chapter_outline', { projectId, chapterId })
}

export interface FileEntry {
  name: string
}

export async function listProjectFiles(projectId: string, subdir: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>('list_project_files', { projectId, subdir })
}

export async function readProjectFile(projectId: string, subdir: string, filename: string): Promise<string> {
  return invoke<string>('read_project_file', { projectId, subdir, filename })
}

export async function writeProjectFile(projectId: string, subdir: string, filename: string, content: string): Promise<null> {
  return invoke<null>('write_project_file', { projectId, subdir, filename, content })
}

export async function deleteProjectFile(projectId: string, subdir: string, filename: string): Promise<null> {
  return invoke<null>('delete_project_file', { projectId, subdir, filename })
}

export interface SearchResult {
  path: string
  filename: string
  snippet: string
  score: number
  source: string
}

export async function searchProjectFiles(
  projectId: string,
  query: string,
  sources: string[],
  maxResults?: number,
): Promise<SearchResult[]> {
  return invoke<SearchResult[]>('search_project_files', {
    projectId,
    query,
    sources,
    maxResults: maxResults ?? 20,
  })
}

export interface ChunkUpsertInput {
  chunk_id: string
  page_id: string
  chunk_index: number
  heading_path: string
  chunk_text: string
  embedding: number[]
}

export interface ChunkSearchResult {
  chunk_id: string
  page_id: string
  chunk_index: number
  chunk_text: string
  heading_path: string
  score: number
}

export async function vectorUpsertChunks(
  projectId: string,
  chunks: ChunkUpsertInput[],
): Promise<void> {
  return invoke('vector_upsert_chunks', { projectId, chunks })
}

export async function vectorSearchChunks(
  projectId: string,
  queryEmbedding: number[],
  topK: number,
): Promise<ChunkSearchResult[]> {
  return invoke<ChunkSearchResult[]>('vector_search_chunks', {
    projectId,
    queryEmbedding,
    topK,
  })
}

export interface StatEvent {
  timestamp: string
  event_type: string
  chapter?: number
  char_count?: number
  word_count?: number
  duration_ms?: number
  prompt_tokens?: number
  output_tokens?: number
  event_version?: number
}

export interface DailyStats {
  date: string
  char_count: number
  word_count: number
  ai_generations: number
  sessions: number
  ai_tokens: number
  duration_ms: number
  session_duration_ms: number
}

export async function appendStatEvent(
  projectId: string,
  event: StatEvent,
): Promise<void> {
  return invoke('append_stat_event', { projectId, event })
}

export async function computeDailyStats(
  projectId: string,
  days: number,
): Promise<DailyStats[]> {
  return invoke<DailyStats[]>('compute_daily_stats', { projectId, days })
}

// ─── Phase A: Chapter word counts (file snapshot) ────────

export interface ChapterWordCount {
  chapter_id: string
  title: string
  volume: string
  order: number
  word_count: number
  char_count: number
}

export interface ProjectStats {
  total_words: number
  avg_words_per_chapter: number
  max_chapter_words: number
  min_chapter_words: number
  total_chapters: number
  total_volumes: number
  project_days_elapsed: number
  total_ai_generations: number
  total_ai_tokens: number
  avg_ai_duration_ms: number
  max_ai_duration_ms: number
  total_sessions: number
  total_duration_ms: number
  total_session_duration_ms: number
  writing_streak_days: number
  daily_stats: DailyStats[]
}

export async function computeChapterWordCounts(
  projectId: string,
): Promise<ChapterWordCount[]> {
  return invoke<ChapterWordCount[]>('compute_chapter_word_counts', { projectId })
}

export async function computeProjectStats(
  projectId: string,
  days: number,
): Promise<ProjectStats> {
  return invoke<ProjectStats>('compute_project_stats', { projectId, days })
}

// ─── Version History ─────────────────────────────

export async function listChapterVersions(projectId: string, volume: string, chapterId: string): Promise<VersionMeta[]> {
  return invoke<VersionMeta[]>('list_chapter_versions', { projectId, volume, chapterId })
}

export async function getChapterVersion(projectId: string, volume: string, chapterId: string, version: number): Promise<string> {
  return invoke<string>('get_chapter_version', { projectId, volume, chapterId, version })
}

export async function restoreChapterVersion(projectId: string, volume: string, chapterId: string, version: number): Promise<void> {
  await invoke('restore_chapter_version', { projectId, volume, chapterId, version })
}

export async function deleteChapterVersion(projectId: string, volume: string, chapterId: string, version: number): Promise<void> {
  await invoke('delete_chapter_version', { projectId, volume, chapterId, version })
}

export async function renameChapterVersion(projectId: string, volume: string, chapterId: string, version: number, label: string): Promise<void> {
  await invoke('rename_chapter_version', { projectId, volume, chapterId, version, label })
}

// ─── Material Library ─────────────────────────────

export async function initializeMaterialLibrary(): Promise<LegacyCleanupSummary> {
  return invoke<LegacyCleanupSummary>('initialize_material_library')
}

export async function listMaterials(
  filter: MaterialFilter,
  page = 1,
  pageSize = 20,
): Promise<MaterialPage> {
  return invoke<MaterialPage>('list_materials', { filter, page, pageSize })
}

export async function getMaterial(materialId: string): Promise<MaterialItem> {
  return invoke<MaterialItem>('get_material', { materialId })
}

export async function createMaterial(input: MaterialWriteInput): Promise<MaterialItem> {
  return invoke<MaterialItem>('create_material', { input })
}

export async function updateMaterial(
  materialId: string,
  patch: MaterialUpdatePatch,
): Promise<MaterialItem> {
  return invoke<MaterialItem>('update_material', { materialId, patch })
}

export async function deleteMaterial(materialId: string): Promise<void> {
  await invoke('delete_material', { materialId })
}

export async function listMaterialCategories(): Promise<MaterialCategory[]> {
  return invoke<MaterialCategory[]>('list_material_categories')
}

export async function saveMaterialCategories(categories: MaterialCategory[]): Promise<void> {
  await invoke('save_material_categories', { categories })
}

export async function listMaterialKinds(): Promise<MaterialKindDefinition[]> {
  return invoke<MaterialKindDefinition[]>('list_material_kinds')
}

export async function saveMaterialKinds(kinds: MaterialKindDefinition[]): Promise<void> {
  await invoke('save_material_kinds', { kinds })
}

export async function restoreMaterialKindPresets(): Promise<MaterialKindDefinition[]> {
  return invoke<MaterialKindDefinition[]>('restore_material_kind_presets')
}

export async function searchMaterials(
  query: string,
  filter: MaterialFilter,
  limit = 20,
): Promise<MaterialSearchResult[]> {
  return invoke<MaterialSearchResult[]>('search_materials', { query, filter, limit })
}
