// src/services/exportService.ts
import { listChapters, getChapterContent, readProjectFile } from '../api/tauri'
import { htmlToPlainText, htmlToMarkdown } from '../utils/htmlToText'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'

export type ExportFormat = 'txt' | 'markdown'

export interface ExportProgress {
  current: number
  total: number
  chapterId: string
}

/**
 * Export project as plain text. Each chapter separated by heading + blank line.
 */
export async function exportAsPlainText(
  projectId: string,
  projectName: string,
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  const chapters = await listChapters(projectId)
  chapters.sort((a, b) => a.order - b.order)

  const lines: string[] = []
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i]!
    onProgress?.({ current: i + 1, total: chapters.length, chapterId: ch.id })
    const html = await getChapterContent(projectId, ch.id)
    const text = htmlToPlainText(html)
    lines.push(`第${ch.order}章 ${ch.title}`, '', text, '')
  }

  const content = lines.join('\n')
  const filePath = await save({
    defaultPath: `${projectName}.txt`,
    filters: [{ name: 'Text Files', extensions: ['txt'] }],
  })
  if (!filePath) return

  await writeTextFile(filePath, content)
}

/**
 * Export project as Markdown. Each chapter as an H1 heading + content.
 */
export async function exportAsMarkdown(
  projectId: string,
  projectName: string,
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  const chapters = await listChapters(projectId)
  chapters.sort((a, b) => a.order - b.order)

  let description = ''
  try {
    const metaRaw = await readProjectFile(projectId, '', 'project.json')
    const meta = JSON.parse(metaRaw)
    description = meta.description || ''
  } catch { /* ignore */ }

  const lines: string[] = [
    `# ${projectName}`,
    '',
    description ? `> ${description}\n` : '',
    '---',
    '',
  ]

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i]!
    onProgress?.({ current: i + 1, total: chapters.length, chapterId: ch.id })
    const html = await getChapterContent(projectId, ch.id)
    const md = htmlToMarkdown(html, `第${ch.order}章 ${ch.title}`)
    lines.push(md, '', '---', '')
  }

  const content = lines.join('\n')
  const filePath = await save({
    defaultPath: `${projectName}.md`,
    filters: [{ name: 'Markdown Files', extensions: ['md'] }],
  })
  if (!filePath) return

  await writeTextFile(filePath, content)
}
