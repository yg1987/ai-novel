// ─── Chapter Snapshot ───────────────────────────

export interface ChapterSnapshot {
  chapterNumber: number
  chapterTitle: string
  summary: string                    // 200 字以内
  characters: string[]               // 出场角色
  locations: string[]                // 涉及地点
  items: string[]                    // 涉及物品
  characterStateChanges: string[]    // "林烬: 修为突破至金丹期"
  relationshipChanges: string[]      // "林烬 → 盟友 → 苏婉"
  knowledgeChanges: string[]         // "林烬知道魔族入侵计划"
  foreshadowingChanges: string[]     // "新增伏笔: 神器下落" / "推进伏笔: 身份之谜" / "回收伏笔: 刘长老身份"
  timelineEvents: string[]           // "进入秘境第二天"
  endingHook: string                 // 本章末尾钩子
  qualityScore?: number              // 0-10
  suggestions?: string[]             // AI 改进建议
}

import type { ChapterRef } from './chapter'

// ─── Foreshadowing ──────────────────────────────

export type ForeshadowStatus = 'planted' | 'advanced' | 'resolved' | 'abandoned'
export type ForeshadowCategory = 'identity' | 'mystery' | 'item' | 'relationship' | 'event' | 'ability' | 'power'

export interface ForeshadowProgress {
  chapter: ChapterRef
  description: string
  recordedAt: string
}

export interface ForeshadowEntry {
  id: string
  name: string
  description: string
  status: ForeshadowStatus
  category: ForeshadowCategory
  importance: number              // 0.2 / 0.4 / 0.6 / 0.8 / 1.0
  plantedChapter: ChapterRef
  plannedResolutionChapter?: ChapterRef
  recordedResolutionChapter?: ChapterRef
  resolutionPlan?: string
  progress: ForeshadowProgress[]
  relatedCharacters: string[]
  /** Stable character references introduced by foreshadow schema v2. Old names stay for display compatibility. */
  relatedCharacterIds: string[]
  notes: string
  createdAt: string
  updatedAt: string
}

export interface ForeshadowStore {
  schemaVersion: 2
  entries: ForeshadowEntry[]
  updatedAt: string
  /** In-memory migration preview. This field is never persisted. */
  migration?: {
    sourceSchemaVersion: 1
    unresolvedNames: string[]
  }
}

// ─── Foreshadow Config ─────────────────────────

export interface ForeshadowConfig {
  dormantThreshold: number
  upcomingWindow: number
  densityWarningThreshold: number
  densityLowThreshold: number
}

export const DEFAULT_FORESHADOW_CONFIG: ForeshadowConfig = {
  dormantThreshold: 20,
  upcomingWindow: 10,
  densityWarningThreshold: 0.3,
  densityLowThreshold: 0.05,
}

// ─── Foreshadow Inspiration ─────────────────────

export interface ForeshadowGapSuggestion {
  type: 'gap'
  /** 建议加伏笔的章节引用，如 "第3章" */
  chapterRef: string
  /** 为什么这里缺少伏笔 */
  reason: string
  /** AI 给出的具体伏笔建议 */
  suggestion: string
  /** 与该伏笔相关的角色名列表 */
  relatedCharacters: string[]
}

export interface ForeshadowCallbackSuggestion {
  type: 'callback'
  /** 源头章节 */
  sourceChapter: string
  /** 可被呼应的已有元素描述 */
  element: string
  /** 如何呼应/回收的建议 */
  suggestion: string
  /** 关联的已有伏笔 ID（若有） */
  relatedForeshadowId?: string
}

export interface ForeshadowDensityAssessment {
  type: 'density'
  /** 伏笔过多的章节 */
  hotChapters: string[]
  /** 没有伏笔的章节 */
  coldChapters: string[]
  /** 全局密度评价 */
  overallAssessment: string
}

export type ForeshadowSuggestion =
  | ForeshadowGapSuggestion
  | ForeshadowCallbackSuggestion
  | ForeshadowDensityAssessment

export interface ForeshadowInspiration {
  suggestions: ForeshadowSuggestion[]
  summary: string
}

// ─── Character Cognition ─────────────────────────

export interface CharacterCognition {
  character: string
  knows: string[]
  doesNotKnow: string[]
}

export interface CognitionState {
  characters: CharacterCognition[]
  readerKnows: string[]             // 读者知道但角色不知道
  lastUpdatedChapter: number
}

// ─── Timeline ────────────────────────────────────

export interface TimelineEntry {
  chapterNumber: number
  storyDate?: string
  events: string[]
}

// ─── Banned Words ────────────────────────────────

export interface BannedWordMatch {
  pattern: string
  line: number
  context: string
  offset: number
  severity: 1 | 2 | 3 | 4 | 5     // 5 = highest toxicity
  suggestion?: string
}

export const BANNED_WORD_SEVERITY_LABEL: Record<number, string> = {
  1: '轻度',
  2: '轻度',
  3: '中度',
  4: '重度',
  5: '极重',
}

// ─── Relationship Graph ────────────────────────────

export type GraphNodeType =
  | 'character'
  | 'location'
  | 'organization'
  | 'item'
  | 'event'
  | 'chapter'
  | 'foreshadowing'

export type RelationType = 'ally' | 'rival' | 'family' | 'mentor' | 'enemy' | 'friend' | 'love' | 'ambiguous'
export type RelationTier = 1 | 2 | 3

export const RELATION_META: Record<RelationType, { tier: RelationTier; weight: number; label: string }> = {
  ally: { tier: 1, weight: 1.5, label: '盟友' },
  enemy: { tier: 1, weight: 1.5, label: '仇敌' },
  rival: { tier: 2, weight: 1.2, label: '对手' },
  love: { tier: 2, weight: 1.2, label: '恋情' },
  family: { tier: 2, weight: 1.2, label: '血缘' },
  mentor: { tier: 3, weight: 0.5, label: '师徒' },
  friend: { tier: 3, weight: 0.5, label: '朋友' },
  ambiguous: { tier: 3, weight: 0.5, label: '关联' },
}

export interface InsightItem {
  type: 'surprising-connection' | 'isolated-node' | 'sparse-community' | 'bridge-node'
  title: string
  description: string
  nodeIds: string[]
  suggestion: string
}

export interface GraphNode {
  id: string
  label: string
  type: GraphNodeType
  group: string
  community: number
  linkCount: number
  firstAppearance: number
  lastAppearance: number
  appearanceCount: number
  tags: string[]
}

export interface RelationshipLink {
  source: string
  target: string
  /** Configuration ID. The built-in RelationType union remains the legacy compatibility set. */
  type: string
  tier: RelationTier
  weight: number
  strength: number
  firstMentioned: number
  lastMentioned: number
  mentions: number
  description?: string
  structural?: boolean
  kind?: 'relationship' | 'affiliation' | 'appearance' | 'participation' | 'foreshadowing' | 'organizationHierarchy'
  sourceKind?: 'manual' | 'snapshot' | 'co-occurrence' | 'catalog' | 'foreshadowing'
  recordId?: string
  periodId?: string
  temporalStatus?: 'current' | 'historical'
  relationshipStatus?: 'active' | 'ended' | 'uncertain'
  startChapter?: ChapterRef
  endChapter?: ChapterRef
  direction?: 'undirected' | 'a-to-b' | 'b-to-a'
  evidence?: string[]
  label?: string
  color?: string
}

export interface RelationshipGraph {
  nodes: GraphNode[]
  links: RelationshipLink[]
  insights: InsightItem[]
}
