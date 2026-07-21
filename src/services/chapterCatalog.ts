import {
  deleteProjectFile,
  listChapters,
  listProjectFiles,
  readProjectFile,
  saveChapterContent,
  writeProjectFile,
} from '../api/tauri'
import type { ChapterKey, ChapterMeta, ChapterRef } from '../types/chapter'
import { chapterRefKey, compareChapters } from './chapterDisplay'

const MEMORY_DIR = 'memory'
const CHAPTER_TITLES_FILE = '_chapter_titles.json'
const VOLUME_NAMES_FILE = '_volume_names.json'

export const OUTLINE_DIR = 'outline'
export const OUTLINE_VOLUMES_DIR = 'outline/volumes'
export const OUTLINE_CHAPTERS_DIR = 'outline/chapters'

export interface WritingNames {
  volumeNames: Record<string, string>
  chapterTitles: Record<ChapterKey, string>
}

export interface OutlineCatalog {
  volumeOutlines: Set<string>
  outlineRefs: Set<ChapterKey>
  refsByVolume: Map<string, ChapterRef[]>
}

export function chapterOrder(chapterId: string): number {
  const match = /^ch(\d+)$/i.exec(chapterId)
  return match ? Number(match[1]) : 0
}

export function volumeOrder(volume: string): number {
  const match = /^卷(\d+)$/.exec(volume)
  return match ? Number(match[1]) : 0
}

export function compareVolumes(left: string, right: string): number {
  return volumeOrder(left) - volumeOrder(right) || left.localeCompare(right, 'zh-CN')
}

export function compareRefs(left: ChapterRef, right: ChapterRef): number {
  return compareVolumes(left.volume, right.volume)
    || chapterOrder(left.chapterId) - chapterOrder(right.chapterId)
    || left.chapterId.localeCompare(right.chapterId)
}

export function chapterRefFromMeta(chapter: ChapterMeta): ChapterRef {
  return { volume: chapter.volume, chapterId: chapter.id }
}

export function outlineVolumeFile(volume: string): string {
  return `${volume}.md`
}

export function outlineChapterDir(volume: string): string {
  return `${OUTLINE_CHAPTERS_DIR}/${volume}`
}

export function outlineChapterFile(ref: ChapterRef): string {
  return `${outlineChapterDir(ref.volume)}/${ref.chapterId}.md`
}

export function outlineChapterFilename(ref: ChapterRef): string {
  return `${ref.chapterId}.md`
}

function asStringMap(value: string): Record<string, string> {
  if (!value.trim()) return {}
  const parsed = JSON.parse(value) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

async function loadStringMap(projectId: string, filename: string): Promise<Record<string, string>> {
  try {
    return asStringMap(await readProjectFile(projectId, MEMORY_DIR, filename))
  } catch {
    return {}
  }
}

export async function loadWritingNames(projectId: string): Promise<WritingNames> {
  const [volumeNames, chapterTitles] = await Promise.all([
    loadStringMap(projectId, VOLUME_NAMES_FILE),
    loadStringMap(projectId, CHAPTER_TITLES_FILE),
  ])
  return { volumeNames, chapterTitles: chapterTitles as Record<ChapterKey, string> }
}

async function saveWritingNames(projectId: string, names: WritingNames): Promise<void> {
  await Promise.all([
    writeProjectFile(projectId, MEMORY_DIR, VOLUME_NAMES_FILE, JSON.stringify(names.volumeNames, null, 2)),
    writeProjectFile(projectId, MEMORY_DIR, CHAPTER_TITLES_FILE, JSON.stringify(names.chapterTitles, null, 2)),
  ])
}

async function ensureChapterMissing(projectId: string, ref: ChapterRef): Promise<void> {
  const chapters = await listChapters(projectId)
  if (chapters.some((chapter) => chapter.volume === ref.volume && chapter.id === ref.chapterId)) {
    throw new Error(`${ref.volume} / ${ref.chapterId} 的正文已存在，请直接打开已有章节。`)
  }
}

async function writeWritingChapter(
  projectId: string,
  ref: ChapterRef,
  names: WritingNames,
  content = '',
): Promise<ChapterMeta> {
  await ensureChapterMissing(projectId, ref)
  await saveChapterContent(projectId, ref.volume, ref.chapterId, content)
  try {
    await saveWritingNames(projectId, names)
  } catch (error) {
    await deleteProjectFile(projectId, `chapters/${ref.volume}`, `${ref.chapterId}.md`).catch(() => undefined)
    throw error
  }
  return { id: ref.chapterId, volume: ref.volume, order: chapterOrder(ref.chapterId), title: `第${chapterOrder(ref.chapterId)}章` }
}

export async function createNewWritingVolume(
  projectId: string,
  input: { volumeName: string; firstChapterName: string },
): Promise<ChapterMeta> {
  const volumeName = input.volumeName.trim()
  const firstChapterName = input.firstChapterName.trim()
  if (!volumeName || !firstChapterName) throw new Error('请填写卷名和第一章名称。')
  const chapters = await listChapters(projectId)
  const nextVolume = Math.max(0, ...chapters.map((chapter) => volumeOrder(chapter.volume))) + 1
  const ref: ChapterRef = { volume: `卷${nextVolume}`, chapterId: 'ch001' }
  const names = await loadWritingNames(projectId)
  names.volumeNames[ref.volume] = volumeName
  names.chapterTitles[chapterRefKey(ref)] = firstChapterName
  return writeWritingChapter(projectId, ref, names)
}

export async function createNextWritingChapter(
  projectId: string,
  volume: string,
  input: { chapterName: string },
): Promise<ChapterMeta> {
  const chapterName = input.chapterName.trim()
  if (!chapterName) throw new Error('请填写章节名称。')
  const chapters = await listChapters(projectId)
  const inVolume = chapters.filter((chapter) => chapter.volume === volume)
  if (inVolume.length === 0) throw new Error('实际写作卷必须从“新建分卷”创建第一章。')
  const nextOrder = Math.max(...inVolume.map((chapter) => chapter.order)) + 1
  const ref: ChapterRef = { volume, chapterId: `ch${String(nextOrder).padStart(3, '0')}` }
  const names = await loadWritingNames(projectId)
  names.chapterTitles[chapterRefKey(ref)] = chapterName
  return writeWritingChapter(projectId, ref, names)
}

export async function startWritingFromOutline(
  projectId: string,
  ref: ChapterRef,
  input: { volumeName?: string; chapterName: string },
): Promise<ChapterMeta> {
  const chapterName = input.chapterName.trim()
  if (!chapterName) throw new Error('请填写章节名称。')
  const chapters = await listChapters(projectId)
  const inVolume = chapters.filter((chapter) => chapter.volume === ref.volume)
  const expectedOrder = inVolume.length === 0 ? 1 : Math.max(...inVolume.map((chapter) => chapter.order)) + 1
  if (chapterOrder(ref.chapterId) !== expectedOrder) {
    throw new Error(`只能从本卷下一章开始写作：当前应创建 ch${String(expectedOrder).padStart(3, '0')}。`)
  }
  const names = await loadWritingNames(projectId)
  if (inVolume.length === 0) {
    const volumeName = input.volumeName?.trim()
    if (!volumeName) throw new Error('从细纲创建本卷第一章时，请填写卷名。')
    names.volumeNames[ref.volume] = volumeName
  }
  names.chapterTitles[chapterRefKey(ref)] = chapterName
  return writeWritingChapter(projectId, ref, names)
}

export async function createOutlineVolume(projectId: string): Promise<string> {
  const [chapters, catalog] = await Promise.all([listChapters(projectId), loadOutlineCatalog(projectId)])
  const knownVolumes = [
    ...chapters.map((chapter) => chapter.volume),
    ...catalog.volumeOutlines,
    ...catalog.refsByVolume.keys(),
  ]
  const nextVolume = Math.max(0, ...knownVolumes.map(volumeOrder)) + 1
  const volume = `卷${nextVolume}`
  await createOutlineVolumeAt(projectId, volume)
  return volume
}

export async function createOutlineVolumeAt(projectId: string, volume: string): Promise<void> {
  const files = await listProjectFiles(projectId, OUTLINE_VOLUMES_DIR).catch(() => [])
  const filename = outlineVolumeFile(volume)
  if (files.some((file) => file.name === filename)) {
    throw new Error(`${volume} 的分卷纲已存在，请直接打开。`)
  }
  await writeProjectFile(projectId, OUTLINE_VOLUMES_DIR, filename, `# ${volume} 分卷纲\n\n`)
}

export async function createOutlineChapter(projectId: string, ref: ChapterRef): Promise<void> {
  const catalog = await loadOutlineCatalog(projectId)
  if (catalog.outlineRefs.has(chapterRefKey(ref))) {
    throw new Error(`${ref.volume} / ${ref.chapterId} 的细纲已存在，请直接打开已有细纲。`)
  }
  await writeProjectFile(projectId, outlineChapterDir(ref.volume), outlineChapterFilename(ref), `# 第${chapterOrder(ref.chapterId)}章细纲\n\n`)
}

export async function createNextOutlineChapter(projectId: string, volume: string): Promise<ChapterRef> {
  const [chapters, catalog] = await Promise.all([listChapters(projectId), loadOutlineCatalog(projectId)])
  const existing = [
    ...chapters.filter((chapter) => chapter.volume === volume).map((chapter) => chapter.id),
    ...(catalog.refsByVolume.get(volume) ?? []).map((ref) => ref.chapterId),
  ]
  const nextOrder = Math.max(0, ...existing.map(chapterOrder)) + 1
  const ref = { volume, chapterId: `ch${String(nextOrder).padStart(3, '0')}` }
  await createOutlineChapter(projectId, ref)
  return ref
}

export async function loadOutlineCatalog(projectId: string): Promise<OutlineCatalog> {
  const [volumeFiles, chapterVolumes] = await Promise.all([
    listProjectFiles(projectId, OUTLINE_VOLUMES_DIR).catch(() => []),
    listProjectFiles(projectId, OUTLINE_CHAPTERS_DIR).catch(() => []),
  ])
  const volumeOutlines = new Set(volumeFiles
    .map((file) => file.name)
    .filter((file) => /^卷\d+\.md$/.test(file))
    .map((file) => file.replace(/\.md$/, '')))
  const refsByVolume = new Map<string, ChapterRef[]>()
  await Promise.all(chapterVolumes
    .map((entry) => entry.name)
    .filter((volume) => /^卷\d+$/.test(volume))
    .map(async (volume) => {
      const files = await listProjectFiles(projectId, outlineChapterDir(volume)).catch(() => [])
      const refs = files
        .map((file) => file.name)
        .filter((file) => /^ch\d+\.md$/i.test(file))
        .map((file) => ({ volume, chapterId: file.replace(/\.md$/i, '') }))
        .sort(compareRefs)
      if (refs.length > 0) refsByVolume.set(volume, refs)
    }))
  const outlineRefs = new Set<ChapterKey>()
  for (const refs of refsByVolume.values()) {
    for (const ref of refs) outlineRefs.add(chapterRefKey(ref))
  }
  return { volumeOutlines, outlineRefs, refsByVolume }
}

export function sortChapters(chapters: ChapterMeta[]): ChapterMeta[] {
  return [...chapters].sort(compareChapters)
}
