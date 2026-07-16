import { invoke } from '@tauri-apps/api/core'
import type { ProjectMeta, CreateProjectInput, UpdateProjectInput } from '../types/project'
import type { ChapterMeta } from '../types/chapter'
import type { ProviderConfig } from '../types/provider'
import type { VersionMeta } from '../types/review'

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
  return invoke<void>('restore_chapter_version', { projectId, volume, chapterId, version })
}

export async function deleteChapterVersion(projectId: string, volume: string, chapterId: string, version: number): Promise<void> {
  return invoke<void>('delete_chapter_version', { projectId, volume, chapterId, version })
}

export async function renameChapterVersion(projectId: string, volume: string, chapterId: string, version: number, label: string): Promise<void> {
  return invoke<void>('rename_chapter_version', { projectId, volume, chapterId, version, label })
}

// ─── Resource Library ─────────────────────────────

export async function listResourceCategories(): Promise<string[]> {
  return invoke<string[]>('list_resource_categories')
}

export async function listResourceFiles(category: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>('list_resource_files', { category })
}

export async function readResourceFile(category: string, filename: string): Promise<string> {
  return invoke<string>('read_resource_file', { category, filename })
}

export async function writeResourceFile(category: string, filename: string, content: string): Promise<void> {
  return invoke<void>('write_resource_file', { category, filename, content })
}

export async function deleteResourceFile(category: string, filename: string): Promise<void> {
  return invoke<void>('delete_resource_file', { category, filename })
}

export async function searchResourceFiles(query: string, maxResults?: number): Promise<SearchResult[]> {
  return invoke<SearchResult[]>('search_resource_files', { query, maxResults: maxResults ?? 10 })
}
