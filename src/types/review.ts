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
