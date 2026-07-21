import { invoke } from '@tauri-apps/api/core'
import { readProjectFile, writeProjectFile } from '../api/tauri'
import type { ChapterRef } from '../types/chapter'
import { chapterRefKey } from './chapterDisplay'

// ─── Types ────────────────────────────────────────────────

export interface AppSettings {
  default_word_count: number
}

export interface ChapterWordCountResolution {
  value: number
  source: 'manual' | 'outline' | 'system' | 'fallback'
}

// ─── Settings Registry ────────────────────────────────────

type SettingType = 'number' | 'string' | 'select' | 'boolean'

export interface SettingDef {
  key: keyof AppSettings & string
  label: string
  description: string
  type: SettingType
  default: AppSettings[SettingDef['key']]
  /** Only for number type */
  min?: number
  max?: number
  step?: number
  /** Unit label shown after the input */
  suffix?: string
  /** Only for select type */
  options?: { value: string; label: string }[]
}

/** All system settings. Add a new entry here to add a setting to the UI. */
export const SETTINGS_REGISTRY: SettingDef[] = [
  {
    key: 'default_word_count',
    label: '默认预计字数',
    description: '新建章节 / 未设置字数时，AI 生成的默认目标字数',
    type: 'number',
    default: 4000,
    min: 500,
    max: 50000,
    step: 100,
    suffix: '字',
  },
  // ─── 后续新设置加在这里即可 ───
  // {
  //   key: 'auto_save_interval',
  //   label: '自动保存间隔',
  //   description: '编辑器自动保存的间隔时间',
  //   type: 'number',
  //   default: 3000,
  //   min: 1000,
  //   max: 30000,
  //   step: 1000,
  //   suffix: 'ms',
  // },
]

/** Get default value for a setting key */
export function getSettingDefault(key: string): number | string | boolean {
  const def = SETTINGS_REGISTRY.find((s) => s.key === key)
  if (def) return def.default
  // Fallback for known keys not yet in registry
  if (key === 'default_word_count') return 4000
  return ''
}

// ─── System settings (workspace-level) ────────────────────

export async function loadSettings(): Promise<AppSettings> {
  return invoke<AppSettings>('load_settings')
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke<void>('save_settings', { settings })
}

// ─── Chapter word count resolution ─────────────────────────

const CHAPTER_META_FILE = '_chapter_meta.json'
const CHAPTER_WORDCOUNT_FILE = '_chapter_wordcounts.json'
const META_DIR = 'outline'
const OVERRIDE_DIR = 'memory'

interface ChapterMetaStore {
  [chapterKey: string]: { expectedWords?: number }
}

async function loadChapterMeta(projectId: string): Promise<ChapterMetaStore> {
  try {
    const raw = await readProjectFile(projectId, META_DIR, CHAPTER_META_FILE)
    if (!raw.trim()) return {}
    return JSON.parse(raw) as ChapterMetaStore
  } catch {
    return {}
  }
}

export async function saveChapterExpectedWords(
  projectId: string,
  ref: ChapterRef,
  expectedWords: number,
): Promise<void> {
  const meta = await loadChapterMeta(projectId)
  const key = chapterRefKey(ref)
  meta[key] = { ...meta[key], expectedWords }
  await writeProjectFile(projectId, META_DIR, CHAPTER_META_FILE, JSON.stringify(meta, null, 2))
}

export async function loadChapterExpectedWords(
  projectId: string,
  ref: ChapterRef,
): Promise<number | null> {
  const meta = await loadChapterMeta(projectId)
  return meta[chapterRefKey(ref)]?.expectedWords ?? null
}

async function loadWordCountOverrides(projectId: string): Promise<Record<string, number>> {
  try {
    const raw = await readProjectFile(projectId, OVERRIDE_DIR, CHAPTER_WORDCOUNT_FILE)
    if (!raw.trim()) return {}
    return JSON.parse(raw) as Record<string, number>
  } catch {
    return {}
  }
}

export async function saveChapterWordCountOverride(
  projectId: string,
  ref: ChapterRef,
  wordCount: number,
): Promise<void> {
  const overrides = await loadWordCountOverrides(projectId)
  overrides[chapterRefKey(ref)] = wordCount
  await writeProjectFile(projectId, OVERRIDE_DIR, CHAPTER_WORDCOUNT_FILE, JSON.stringify(overrides, null, 2))
}

export async function deleteChapterWordCountOverride(
  projectId: string,
  ref: ChapterRef,
): Promise<void> {
  const overrides = await loadWordCountOverrides(projectId)
  delete overrides[chapterRefKey(ref)]
  await writeProjectFile(projectId, OVERRIDE_DIR, CHAPTER_WORDCOUNT_FILE, JSON.stringify(overrides, null, 2))
}

/**
 * 三级优先级决议：获取某章的预计字数
 *
 * Priority:
 *   1. Editor 手动覆盖  (memory/_chapter_wordcounts.json)
 *   2. Outline 面板设置  (outline/_chapter_meta.json)
 *   3. 系统设置默认值    (settings.json → default_word_count)
 *   4. 硬编码兜底 4000
 */
export async function resolveChapterWordCount(
  projectId: string,
  ref: ChapterRef,
): Promise<ChapterWordCountResolution> {
  const key = chapterRefKey(ref)
  // ① 手动覆盖
  const overrides = await loadWordCountOverrides(projectId)
  if (overrides[key] != null) {
    return { value: overrides[key]!, source: 'manual' }
  }

  // ② 大纲设置
  const meta = await loadChapterMeta(projectId)
  if (meta[key]?.expectedWords != null) {
    return { value: meta[key]!.expectedWords!, source: 'outline' }
  }

  // ③ 系统默认
  try {
    const settings = await loadSettings()
    return { value: settings.default_word_count, source: 'system' }
  } catch {
    // ④ 硬编码兜底
    return { value: 4000, source: 'fallback' }
  }
}
