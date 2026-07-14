// ─── Review System ───────────────────────────────

export type ReviewSeverity = 'error' | 'warning' | 'hint'
export type ReviewDimension = 'timeline' | 'character_cognition' | 'foreshadow_health' | 'setting_consistency'
export type CheckType = 'banned_words' | 'character_names' | 'location_names'

export interface ReviewIssue {
  severity: ReviewSeverity
  dimension?: ReviewDimension
  desc: string
  location?: { line: number; offset: number } | null
  suggestion?: string
  checkType?: CheckType
}

export interface LightCheckItem {
  name: string
  passed: boolean
  issues: ReviewIssue[]
  meta?: Record<string, unknown>
}

export interface LightCheckResult {
  passed: boolean
  checks: LightCheckItem[]
  timestamp: string
}

export interface DeepCheckDimension {
  name: ReviewDimension
  score: number
  issues: ReviewIssue[]
}

export interface DeepCheckResult {
  overall_score: number
  dimensions: DeepCheckDimension[]
  suggestions: string[]
  timestamp: string
}

export interface ReviewReportMeta {
  filename: string
  type: 'light' | 'full'
  timestamp: string
  passed?: boolean
  overall_score?: number
  chapterId: string
}

// ─── Version History ─────────────────────────────

export interface VersionMeta {
  version: number
  created_at: string
  word_count: number
  char_count: number
  source: 'auto_save' | 'manual_save' | 'ai_generated' | 'restore' | 'rewrite'
  label: string
}

export interface VersionIndex {
  versions: VersionMeta[]
  max_versions: number
}

// ─── Consistency Check (设计文档 §4.2) ────────────

/** S1-S4 severity matching design doc severity system */
export type ConsistencySeverity = 'S1' | 'S2' | 'S3' | 'S4'
/** S1=硬伤, S2=破坏叙事, S3=细节差异, S4=优化建议 */

export type ConsistencyCheckType =
  | 'dormant_foreshadow'
  | 'absent_character'
  | 'timeline_order'
  | 'overdue_foreshadow'
  | 'resolution_delay'
  | 'foreshadow_density'

export interface ConsistencyIssue {
  id: string
  type: ConsistencyCheckType
  severity: ConsistencySeverity
  chapter: number
  description: string
  suggestion?: string
  detail?: string
}

export interface ConsistencyCheckResult {
  issues: ConsistencyIssue[]
  summary: {
    S1: number
    S2: number
    S3: number
    S4: number
    total: number
  }
  checkedAt: string
}
