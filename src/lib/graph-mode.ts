import type { GraphNodeType } from '../types/novel'

export type GraphMode = 'overview' | 'character' | 'chapter' | 'storyline' | 'foreshadowing'
export type GraphDisplayMode = 'graph' | 'document' | 'mindmap'
export type GraphLabelVisibility = 'all' | 'focused' | 'minimal'

export interface GraphModePreset {
  label: string
  allowedNodeTypes: ReadonlySet<GraphNodeType>
  hiddenNodeTypes: ReadonlySet<GraphNodeType>
  hideIsolated: boolean
  hideStructural: boolean
  minimumEdgeWeight: number
  labelVisibility: GraphLabelVisibility
}

export const GRAPH_MODE_LABELS: Record<GraphMode, string> = {
  overview: '总览',
  character: '人物',
  chapter: '章节',
  storyline: '故事线',
  foreshadowing: '伏笔',
}

export const GRAPH_MODE_PRESETS: Record<GraphMode, GraphModePreset> = {
  overview: {
    label: '总览',
    allowedNodeTypes: new Set(['character', 'chapter', 'location', 'item', 'organization', 'event', 'foreshadowing']),
    hiddenNodeTypes: new Set([]),
    hideIsolated: false,
    hideStructural: true,
    minimumEdgeWeight: 0,
    labelVisibility: 'focused',
  },
  character: {
    label: '人物',
    allowedNodeTypes: new Set(['character', 'organization', 'location', 'chapter']),
    hiddenNodeTypes: new Set([]),
    hideIsolated: true,
    hideStructural: true,
    minimumEdgeWeight: 1,
    labelVisibility: 'focused',
  },
  chapter: {
    label: '章节',
    allowedNodeTypes: new Set(['chapter', 'character', 'location', 'event', 'foreshadowing']),
    hiddenNodeTypes: new Set([]),
    hideIsolated: true,
    hideStructural: true,
    minimumEdgeWeight: 1,
    labelVisibility: 'focused',
  },
  storyline: {
    label: '故事线',
    allowedNodeTypes: new Set(['event', 'chapter', 'character', 'foreshadowing']),
    hiddenNodeTypes: new Set([]),
    hideIsolated: true,
    hideStructural: true,
    minimumEdgeWeight: 2,
    labelVisibility: 'minimal',
  },
  foreshadowing: {
    label: '伏笔',
    allowedNodeTypes: new Set(['foreshadowing', 'chapter', 'character', 'event']),
    hiddenNodeTypes: new Set([]),
    hideIsolated: true,
    hideStructural: true,
    minimumEdgeWeight: 1,
    labelVisibility: 'focused',
  },
}
