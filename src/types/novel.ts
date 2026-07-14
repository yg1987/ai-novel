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

// ─── Foreshadowing ──────────────────────────────

export type ForeshadowStatus = 'planted' | 'advanced' | 'resolved' | 'abandoned'
export type ForeshadowCategory = 'identity' | 'mystery' | 'item' | 'relationship' | 'event' | 'ability' | 'power'

export interface ForeshadowClue {
  chapterId: string
  description: string
  timestamp: string
}

export interface ForeshadowEntry {
  id: string
  name: string
  description: string
  status: ForeshadowStatus
  category: ForeshadowCategory
  importance: number              // 0.2 / 0.4 / 0.6 / 0.8 / 1.0
  plantedChapterId: string
  targetChapterId?: string
  resolvedChapterId?: string
  resolutionPlan?: string
  clues: ForeshadowClue[]
  relatedCharacters: string[]
  notes: string
  createdAt: string
  updatedAt: string
}

export interface ForeshadowStore {
  entries: ForeshadowEntry[]
  updatedAt: string
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

// ─── Relationship Graph (v0.5) ────────────────────

export interface GraphNode {
  id: string
  label: string
  group: string               // 'protagonist' | 'supporter' | 'antagonist' | 'neutral'
  firstAppearance: number     // chapter number
  lastAppearance: number
  appearanceCount: number
  tags: string[]              // from character card tags if available
}

export type RelationType = 'ally' | 'rival' | 'family' | 'mentor' | 'enemy' | 'friend' | 'love' | 'ambiguous'

export interface RelationshipLink {
  source: string              // character name
  target: string              // character name
  type: RelationType
  strength: number            // 0.0 - 1.0, computed from co-occurrence count
  firstMentioned: number      // chapter number
  lastMentioned: number
  mentions: number            // how many chapters mention this relationship
  description?: string        // from relationshipChanges if available
}

export interface RelationshipGraph {
  nodes: GraphNode[]
  links: RelationshipLink[]
}
