/**
 * Review rules configuration — project-level, user-editable JSON.
 *
 * Layered loading:
 *   1. Try loading review-rules.json from project root
 *   2. If missing or malformed → fall back to getDefaultReviewRules()
 *
 * Users can copy the default rules to their project by calling
 * writeDefaultReviewRules() (future: trigger this from a "reset to defaults" UI).
 */

import { readProjectFile, writeProjectFile } from '../api/tauri'

// ─── Types ────────────────────────────────────────

export interface BannedWordRule {
  /** Regex source string (flags applied at compile time) */
  pattern: string
  /** 1=轻微 … 5=极重 */
  severity: 1 | 2 | 3 | 4 | 5
  label: string
  suggestion?: string
}

export interface ConsistencyThresholds {
  /** 伏笔沉寂超过 N 章 → S4 */
  dormantForeshadowWarn: number
  /** 伏笔沉寂超过 N 章 → S3 */
  dormantForeshadowAlert: number
  /** 伏笔沉寂超过 N 章 → S2 */
  dormantForeshadowCritical: number
  /** 高优先级伏笔(importance>=0.8)超 N 章 → S2 */
  overdueHighImportance: number
  /** 其他伏笔超 N 章 → S2 */
  overdueDefault: number
}

export interface ReviewDimensionConfig {
  id: string
  label: string
  description: string
}

export interface ReviewRules {
  version: number
  bannedWords: BannedWordRule[]
  consistency: ConsistencyThresholds
  reviewDimensions: ReviewDimensionConfig[]
}

// ─── File path ────────────────────────────────────

const REVIEW_RULES_FILENAME = 'review-rules.json'

// ─── Built-in defaults ────────────────────────────

export function getDefaultReviewRules(): ReviewRules {
  return {
    version: 1,
    bannedWords: [
      // Level 5: Extreme AI flavor
      { pattern: '不是[^，。]*，而是[^，。]*[，。]', severity: 5, label: '"不是A而是B"句式', suggestion: '直接陈述，不要用否定+转折结构' },
      { pattern: '仿佛[^，。]*一般', severity: 5, label: '"仿佛…一般"句式', suggestion: '用具体动作描写代替' },
      { pattern: '如同[^，。]*一般', severity: 5, label: '"如同…一般"句式', suggestion: '删掉，用直接描写' },

      // Level 4: Heavy AI flavor
      { pattern: '好像[^，。]*似的', severity: 4, label: '"好像…似的"' },
      { pattern: '似乎[^，。]*[，。]', severity: 4, label: '"似乎"滥用（3次+/段）' },
      { pattern: '[，,]\\s*带着[一不][^，。]{2,8}[，。]', severity: 4, label: '"，带着…"状语' },
      { pattern: '[，,]\\s*嘴角[^，。]*[，。]', severity: 4, label: '"嘴角"高频描写' },

      // Level 3: Moderate AI flavor
      { pattern: '眼中[^，。]*闪过[^，。]*[，。]', severity: 3, label: '"眼中闪过一丝"' },
      { pattern: '深吸[了]?一?口?气', severity: 3, label: '"深吸一口气"', suggestion: '用动作代替' },
      { pattern: '仿佛[^，。]*[，。]', severity: 3, label: '"仿佛"过度使用' },
      { pattern: '[，,]\\s*如同[^，。]+', severity: 3, label: '"，如同…"比喻', suggestion: '比喻控制在每千字1-2个' },
      { pattern: '命运[的之]', severity: 3, label: '"命运"抽象词' },
      { pattern: '宿命[的之]', severity: 3, label: '"宿命"抽象词' },
      { pattern: '终于[^，。]*了[。！]', severity: 3, label: '"终于…了"总结句式' },
      { pattern: '这一刻[，,]', severity: 3, label: '"这一刻"时间状语' },

      // Level 2: Mild AI flavor
      { pattern: '[……]{2,}', severity: 2, label: '省略号过多（≤2次/千字）' },
      { pattern: '——', severity: 2, label: '破折号过多（≤2次/千字）' },
      { pattern: '[，,]\\s*然后[^，。]*[，。]', severity: 2, label: '"然后"过渡词' },
      { pattern: '[，,]\\s*随即[^，。]*[，。]', severity: 2, label: '"随即"过渡词' },
      { pattern: '[，,]\\s*只见[^，。]*[，。]', severity: 2, label: '"只见"视角词' },
      { pattern: '他[她]感到[^，。]+', severity: 2, label: '"他感到"心理描述', suggestion: '用动作/反应外化情绪' },
      { pattern: '他[她]意识到[^，。]+', severity: 2, label: '"他意识到"心理描述' },
      { pattern: '他[她]知道[，,][^，。]+', severity: 2, label: '"他知道"解释腔' },
      { pattern: '[潮水闪电寒冰]般', severity: 2, label: '万能比喻（潮水般/闪电般/寒冰般）' },
      { pattern: '不知道为什么[，,]', severity: 2, label: '"不知道为什么"模糊解释' },

      // Level 1: Minor AI markers
      { pattern: '似乎[^，。]*似乎', severity: 1, label: '"似乎"连续使用' },
      { pattern: '某种[^，。]+[，。]', severity: 1, label: '"某种"模糊指代' },
      { pattern: '无法[^，。]+[，。]', severity: 1, label: '"无法X"否定式' },
    ],
    consistency: {
      dormantForeshadowWarn: 5,
      dormantForeshadowAlert: 8,
      dormantForeshadowCritical: 10,
      overdueHighImportance: 8,
      overdueDefault: 12,
    },
    reviewDimensions: [
      { id: 'timeline', label: '时间线', description: '时间顺序是否矛盾、跳跃是否合理' },
      { id: 'character_cognition', label: '角色认知', description: '角色是否知道不应知道的信息' },
      { id: 'foreshadow_health', label: '伏笔健康度', description: '未解伏笔是否过久未回收' },
      { id: 'setting_consistency', label: '设定一致性', description: '世界观规则是否被违反' },
    ],
  }
}

// ─── Load / Save ──────────────────────────────────

/**
 * Load review rules for a project.
 * Falls back to built-in defaults if the file is missing or malformed.
 */
export async function loadReviewRules(projectId: string): Promise<ReviewRules> {
  try {
    const raw = await readProjectFile(projectId, '', REVIEW_RULES_FILENAME)
    const parsed = JSON.parse(raw) as Partial<ReviewRules>
    if (parsed && typeof parsed.version === 'number' && Array.isArray(parsed.bannedWords)) {
      // Merge with defaults to fill any missing fields (forward compat)
      return mergeWithDefaults(parsed)
    }
  } catch {
    // File missing or unparseable → use defaults
  }
  return getDefaultReviewRules()
}

/**
 * Write default rules to the project, creating review-rules.json.
 */
export async function writeDefaultReviewRules(projectId: string): Promise<void> {
  const defaults = getDefaultReviewRules()
  await writeProjectFile(projectId, '', REVIEW_RULES_FILENAME, JSON.stringify(defaults, null, 2))
}

/**
 * Save user-edited rules to the project.
 */
export async function saveReviewRules(projectId: string, rules: ReviewRules): Promise<void> {
  await writeProjectFile(projectId, '', REVIEW_RULES_FILENAME, JSON.stringify(rules, null, 2))
}

// ─── Internal helpers ─────────────────────────────

function mergeWithDefaults(partial: Partial<ReviewRules>): ReviewRules {
  const defaults = getDefaultReviewRules()
  return {
    version: partial.version ?? defaults.version,
    bannedWords: partial.bannedWords ?? defaults.bannedWords,
    consistency: {
      ...defaults.consistency,
      ...partial.consistency,
    },
    reviewDimensions: partial.reviewDimensions ?? defaults.reviewDimensions,
  }
}
