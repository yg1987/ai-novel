import { invoke } from '@tauri-apps/api/core'
import type { ProjectMeta, CreateProjectInput, UpdateProjectInput } from '../types/project'
import type { ChapterMeta } from '../types/chapter'
import type { ProviderConfig } from '../types/provider'

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

export async function getChapterContent(projectId: string, chapterId: string): Promise<string> {
  return invoke<string>('get_chapter_content', { projectId, chapterId })
}

export async function saveChapterContent(projectId: string, chapterId: string, content: string): Promise<null> {
  return invoke<null>('save_chapter_content', { projectId, chapterId, content })
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
