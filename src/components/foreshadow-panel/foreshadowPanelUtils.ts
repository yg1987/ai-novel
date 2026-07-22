import type {
  ForeshadowCategory,
  ForeshadowEntry,
  ForeshadowProgress,
  ForeshadowStatus,
} from '../../types/novel'
import type { ChapterMeta, ChapterRef } from '../../types/chapter'
import type { ForeshadowUrgency } from '../../services/foreshadowContext'

export const CATEGORY_LABELS: Record<ForeshadowCategory, string> = {
  identity: '身份',
  mystery: '谜团',
  item: '物品',
  relationship: '关系',
  event: '事件',
  ability: '能力',
  power: '力量',
}

export const STATUS_LABELS: Record<ForeshadowStatus, string> = {
  planted: '待处理',
  advanced: '推进中',
  resolved: '已回收',
  abandoned: '已废弃',
}

export const DEFAULT_PAGE_SIZE = 15

export const IMPORTANCE_OPTIONS = [
  { value: 0.2, label: '★☆☆☆☆' },
  { value: 0.4, label: '★★☆☆☆' },
  { value: 0.6, label: '★★★☆☆' },
  { value: 0.8, label: '★★★★☆' },
  { value: 1.0, label: '★★★★★' },
]

export const URGENCY_LABELS: Record<ForeshadowUrgency, string> = {
  critical: '🔴 必须回收',
  upcoming: '🟡 即将到期',
  active: '🔵 近期活跃',
  background: '⚪ 已埋设',
}

export const URGENCY_TIPS: Record<ForeshadowUrgency, string> = {
  critical: '已超期，需尽快回收。编辑 → 展开高级选项 → 修改「计划回收章节」可调整',
  upcoming: '即将到期，应提前铺垫。编辑 → 展开高级选项 → 修改「计划回收章节」可调整',
  active: '近期有推进记录，保持活跃。超过20章无推进将自动变为「已埋设」',
  background: '暂无计划回收章节或长期未推进。编辑 → 展开高级选项 → 设置「计划回收章节」，或点击「推进」按钮记录一次推进',
}

export interface ForeshadowFormData {
  name: string
  description: string
  category: ForeshadowCategory
  importance: number
  plantedChapter: ChapterRef | null
  plannedResolutionChapter: ChapterRef | null
  plannedResolutionMode: 'existing' | 'future'
  futureResolutionVolume: string
  futureResolutionOrder: string
  relatedCharacters: string[]
  progress: ForeshadowProgress[]
  notes: string
  resolutionPlan: string
}

export interface ForeshadowCounts {
  all: number
  planted: number
  advanced: number
  resolved: number
  abandoned: number
}

export interface ForeshadowSuggestionPrefill {
  name?: string
  description?: string
  plantedChapter?: ChapterRef
  relatedCharacters?: string[]
}

export function emptyForeshadowForm(currentChapter: ChapterRef | null): ForeshadowFormData {
  return {
    name: '',
    description: '',
    category: 'mystery',
    importance: 0.6,
    plantedChapter: currentChapter,
    plannedResolutionChapter: null,
    plannedResolutionMode: 'existing',
    futureResolutionVolume: currentChapter?.volume ?? '',
    futureResolutionOrder: '',
    relatedCharacters: [],
    progress: [],
    notes: '',
    resolutionPlan: '',
  }
}

export function entryToForeshadowForm(entry: ForeshadowEntry): ForeshadowFormData {
  return {
    name: entry.name,
    description: entry.description,
    category: entry.category,
    importance: entry.importance,
    plantedChapter: entry.plantedChapter,
    plannedResolutionChapter: entry.plannedResolutionChapter ?? null,
    plannedResolutionMode: 'existing',
    futureResolutionVolume: entry.plannedResolutionChapter?.volume ?? entry.plantedChapter.volume,
    futureResolutionOrder: entry.plannedResolutionChapter?.chapterId.match(/^ch(\d+)$/i)?.[1] ?? '',
    relatedCharacters: entry.relatedCharacters,
    progress: entry.progress,
    notes: entry.notes,
    resolutionPlan: entry.resolutionPlan ?? '',
  }
}

export function getForeshadowUrgency(
  entry: ForeshadowEntry,
  classified: Record<ForeshadowUrgency, ForeshadowEntry[]>,
): ForeshadowUrgency {
  for (const level of ['critical', 'upcoming', 'active', 'background'] as ForeshadowUrgency[]) {
    if (classified[level].some((item) => item.id === entry.id)) return level
  }
  return 'background'
}

export function getChapterLabel(ref: ChapterRef, chapters: ChapterMeta[]): string {
  const meta = chapters.find((chapter) => chapter.volume === ref.volume && chapter.id === ref.chapterId)
  if (!meta) return `${ref.volume} · ${ref.chapterId}`
  return `${meta.volume} · ${meta.title || `第${meta.order}章`}`
}
