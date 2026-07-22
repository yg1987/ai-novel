export type BrainstormMode = 'plot_twist' | 'scene_idea' | 'character_dev' | 'world_expand'
export type CreativityLevel = 'safe' | 'balanced' | 'bold'

export type BrainstormContextSource =
  | 'project_meta'
  | 'chapter_content'
  | 'chapter_snapshot'
  | 'outline'
  | 'characters'
  | 'relationships'
  | 'worldview'
  | 'foreshadows'
  | 'notes'

export interface BrainstormChapterRef {
  volume: string
  chapterId: string
  chapterTitle: string
}

export type BrainstormScope =
  | { type: 'current_chapter'; chapter: BrainstormChapterRef }
  | { type: 'current_volume'; volume: string }
  | { type: 'whole_project' }
  | { type: 'selected_chapters'; chapters: BrainstormChapterRef[] }

export interface BrainstormProjectPreferences {
  schemaVersion: 1
  mode: BrainstormMode
  creativityLevel: CreativityLevel
  resultCount: number
  enabledContextSources: BrainstormContextSource[]
}

export interface BrainstormRequest {
  projectId: string
  mode: BrainstormMode
  problem: string
  scope: BrainstormScope
  relatedCharacters: string[]
  creativityLevel: CreativityLevel
  desiredTone: string
  mustKeep: string[]
  avoid: string[]
  resultCount: number
  enabledContextSources: BrainstormContextSource[]
  derivation?: BrainstormDerivation
  signal?: AbortSignal
}

export type BrainstormOperation =
  | 'generate'
  | 'continue'
  | 'deepen'
  | 'variant'
  | 'adjust_scale'
  | 'combine'
  | 'redo_with_feedback'

export interface BrainstormDerivation {
  operation: BrainstormOperation
  parentSessionId?: string
  parentIdeaIds: string[]
  feedback: string
}

export interface BrainstormForeshadowDraft {
  name: string
  description: string
  plantedChapter?: { volume: string; chapterId: string }
  relatedCharacters: string[]
  notes: string
}

export interface BrainstormLocation {
  volume?: string
  chapterId?: string
  chapterLabel: string
  positionNote: string
  verified: boolean
}

export interface BrainstormEntityRef {
  type: 'character' | 'worldview' | 'outline' | 'foreshadow' | 'chapter'
  entityId?: string
  label: string
  reason: string
  verified: boolean
}

export interface BrainstormIdea {
  id: string
  title: string
  summary: string
  developmentSteps: string[]
  suggestedLocation: BrainstormLocation
  whyItFits: string
  connections: BrainstormEntityRef[]
  risks: string[]
  hooks: string[]
  creativityLevel: CreativityLevel
  favorite: boolean
  dismissed: boolean
  parentIdeaIds: string[]
}

export interface BrainstormResponse {
  summary: string
  ideas: BrainstormIdea[]
}

export interface BrainstormContextManifestEntry {
  source: BrainstormContextSource
  entityIds: string[]
  labels: string[]
  estimatedTokens: number
  truncated: boolean
  error?: string
}

export interface BrainstormGenerationInfo {
  promptVersion: number
  providerName: string
  model: string
  durationMs: number
  inputTokens?: number
  outputTokens?: number
}

export interface BrainstormSession {
  schemaVersion: 1
  id: string
  projectId: string
  createdAt: string
  request: Omit<BrainstormRequest, 'signal'>
  response: BrainstormResponse
  contextManifest: BrainstormContextManifestEntry[]
  contextWarnings: string[]
  generation: BrainstormGenerationInfo
}

export type BrainstormSessionHistoryEntry =
  | { kind: 'valid'; session: BrainstormSession }
  | { kind: 'corrupted'; sessionId: string; createdAt?: string }
  | { kind: 'newer_schema'; sessionId: string; createdAt?: string }

export interface BrainstormGenerationResult {
  response: BrainstormResponse
  contextManifest: BrainstormContextManifestEntry[]
  contextWarnings: string[]
  generation: BrainstormGenerationInfo
}

export const BRAINSTORM_MODE_CONTEXT_PRESETS: Record<BrainstormMode, BrainstormContextSource[]> = {
  plot_twist: ['project_meta', 'chapter_content', 'chapter_snapshot', 'outline', 'characters', 'foreshadows'],
  scene_idea: ['project_meta', 'chapter_content', 'outline', 'characters', 'relationships', 'worldview'],
  character_dev: ['project_meta', 'chapter_content', 'chapter_snapshot', 'outline', 'characters', 'relationships', 'foreshadows'],
  world_expand: ['project_meta', 'outline', 'characters', 'worldview', 'foreshadows'],
}

export const DEFAULT_BRAINSTORM_PREFERENCES: BrainstormProjectPreferences = {
  schemaVersion: 1,
  mode: 'plot_twist',
  creativityLevel: 'balanced',
  resultCount: 4,
  enabledContextSources: BRAINSTORM_MODE_CONTEXT_PRESETS.plot_twist,
}
