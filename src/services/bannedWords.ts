import type { BannedWordMatch } from '../types/novel'

/**
 * Banned word patterns for Chinese web novel AI flavor detection.
 * Adapted from oh-story-claudecode's banned-words.md.
 * Severity: 5 = highest toxicity, 1 = mild.
 */
const PATTERNS: Array<{ pattern: RegExp; severity: 1 | 2 | 3 | 4 | 5; label: string; suggestion?: string }> = [
  // ─── Level 5: Extreme AI flavor ─────────────────
  { pattern: /不是[^，。]*，而是[^，。]*[，。]/g, severity: 5, label: '"不是A而是B"句式', suggestion: '直接陈述，不要用否定+转折结构' },
  { pattern: /仿佛[^，。]*一般/g, severity: 5, label: '"仿佛…一般"句式', suggestion: '用具体动作描写代替' },
  { pattern: /如同[^，。]*一般/g, severity: 5, label: '"如同…一般"句式', suggestion: '删掉，用直接描写' },

  // ─── Level 4: Heavy AI flavor ───────────────────
  { pattern: /好像[^，。]*似的/g, severity: 4, label: '"好像…似的"' },
  { pattern: /似乎[^，。]*[，。]/g, severity: 4, label: '"似乎"滥用（3次+/段）' },
  { pattern: /[，,]\s*带着[一不][^，。]{2,8}[，。]/g, severity: 4, label: '"，带着…"状语' },
  { pattern: /[，,]\s*嘴角[^，。]*[，。]/g, severity: 4, label: '"嘴角"高频描写' },

  // ─── Level 3: Moderate AI flavor ─────────────────
  { pattern: /眼中[^，。]*闪过[^，。]*[，。]/g, severity: 3, label: '"眼中闪过一丝"' },
  { pattern: /深吸[了]?一?口?气/g, severity: 3, label: '"深吸一口气"', suggestion: '用动作代替' },
  { pattern: /仿佛[^，。]*[，。]/g, severity: 3, label: '"仿佛"过度使用' },
  { pattern: /[，,]\s*如同[^，。]+/g, severity: 3, label: '"，如同…"比喻', suggestion: '比喻控制在每千字1-2个' },
  { pattern: /命运[的之]/g, severity: 3, label: '"命运"抽象词' },
  { pattern: /宿命[的之]/g, severity: 3, label: '"宿命"抽象词' },
  { pattern: /终于[^，。]*了[。！]/g, severity: 3, label: '"终于…了"总结句式' },
  { pattern: /这一刻[，,]/g, severity: 3, label: '"这一刻"时间状语' },

  // ─── Level 2: Mild AI flavor ────────────────────
  { pattern: /[……]{2,}/g, severity: 2, label: '省略号过多（≤2次/千字）' },
  { pattern: /——/g, severity: 2, label: '破折号过多（≤2次/千字）' },
  { pattern: /[，,]\s*然后[^，。]*[，。]/g, severity: 2, label: '"然后"过渡词' },
  { pattern: /[，,]\s*随即[^，。]*[，。]/g, severity: 2, label: '"随即"过渡词' },
  { pattern: /[，,]\s*只见[^，。]*[，。]/g, severity: 2, label: '"只见"视角词' },
  { pattern: /他[她]感到[^，。]+/g, severity: 2, label: '"他感到"心理描述', suggestion: '用动作/反应外化情绪' },
  { pattern: /他[她]意识到[^，。]+/g, severity: 2, label: '"他意识到"心理描述' },
  { pattern: /他[她]知道[，,][^，。]+/g, severity: 2, label: '"他知道"解释腔' },
  { pattern: /[潮水闪电寒冰]般/g, severity: 2, label: '万能比喻（潮水般/闪电般/寒冰般）' },
  { pattern: /不知道为什么[，,]/g, severity: 2, label: '"不知道为什么"模糊解释' },

  // ─── Level 1: Minor AI markers ──────────────────
  { pattern: /似乎[^，。]*似乎/g, severity: 1, label: '"似乎"连续使用' },
  { pattern: /某种[^，。]+[，。]/g, severity: 1, label: '"某种"模糊指代' },
  { pattern: /无法[^，。]+[，。]/g, severity: 1, label: '"无法X"否定式' },
]

export interface CheckResult {
  matches: BannedWordMatch[]
  score: number          // 0-100, higher = more AI flavor
  level: 'green' | 'yellow' | 'red'
}

/**
 * Scan text for banned word patterns.
 * Returns matches with severity and overall score.
 */
export function checkBannedWords(text: string): CheckResult {
  const lines = text.split('\n')
  const matches: BannedWordMatch[] = []

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!
    for (const p of PATTERNS) {
      const regex = new RegExp(p.pattern.source, 'g')
      let m: RegExpExecArray | null
      while ((m = regex.exec(line)) !== null) {
        matches.push({
          pattern: p.label,
          line: lineIdx + 1,
          context: extractContext(line, m.index, m[0].length),
          severity: p.severity,
          suggestion: p.suggestion,
        })
      }
    }
  }

  // Calculate weighted score
  let totalScore = 0
  for (const m of matches) {
    totalScore += m.severity * 3  // weight per hit
  }
  const score = Math.min(100, totalScore)

  const level = score >= 40 ? 'red' : score >= 15 ? 'yellow' : 'green'

  return { matches, score, level }
}

export function getSeverityLabel(severity: number): string {
  const map: Record<number, string> = { 1: '轻微', 2: '轻度', 3: '中度', 4: '重度', 5: '极重' }
  return map[severity] ?? '未知'
}

function extractContext(line: string, index: number, length: number): string {
  const start = Math.max(0, index - 10)
  const end = Math.min(line.length, index + length + 10)
  let ctx = line.slice(start, end)
  if (start > 0) ctx = '…' + ctx
  if (end < line.length) ctx = ctx + '…'
  return ctx
}
