// src/services/archiveService.ts
import { invoke } from '@tauri-apps/api/core'
import { save, open } from '@tauri-apps/plugin-dialog'

/**
 * Archive project to a tar.gz file.
 */
export async function archiveProject(projectId: string, projectName: string): Promise<void> {
  const filePath = await save({
    defaultPath: `${projectName}.ai-novel.tar.gz`,
    filters: [{ name: 'AI Novel Archive', extensions: ['tar.gz'] }],
  })
  if (!filePath) return
  await invoke<string>('archive_project', { projectId, outputPath: filePath })
}

/**
 * Import a project from a tar.gz archive. Returns the imported project ID.
 */
export async function importProject(): Promise<string | null> {
  const filePath = await open({
    filters: [{ name: 'AI Novel Archive', extensions: ['tar.gz'] }],
    multiple: false,
  })
  if (!filePath) return null
  const projectId = await invoke<string>('import_project', { archivePath: filePath })
  return projectId
}
