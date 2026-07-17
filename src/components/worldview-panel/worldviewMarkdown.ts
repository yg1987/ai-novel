import type { SectionDef } from '../../services/worldviewConfig'

export function parseWorldviewSubs(content: string, definedKeys: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  let currentKey = ''
  const lines: string[] = []

  for (const line of content.split('\n')) {
    const m = line.match(/^##\s+(.+)/)
    if (m) {
      if (currentKey) result[currentKey] = lines.join('\n').trim()
      currentKey = m[1]!.trim()
      lines.length = 0
    } else if (!line.startsWith('# ')) {
      lines.push(line)
    }
  }

  if (currentKey) result[currentKey] = lines.join('\n').trim()
  for (const key of definedKeys) {
    if (!(key in result)) result[key] = ''
  }
  return result
}

export function buildWorldviewContent(title: string, subs: Record<string, string>): string {
  const parts = [`# ${title}`]
  for (const [key, text] of Object.entries(subs)) {
    parts.push('', `## ${key}`, '')
    if (text.trim()) parts.push(text.trim())
  }
  return parts.join('\n')
}

export function getWorldviewDefaultPrompt(section: SectionDef, hasSubs: boolean): string {
  if (hasSubs) {
    return `你是一个网文世界观设定助手。根据以下项目信息，为这部小说生成「${section.label}」的设定。

请严格按以下各部分输出，使用 ## 作为小标题：

${section.subs.map((s) => `## ${s.label}\n（要求：${s.hint}）`).join('\n\n')}

要求：
- 每部分控制在 200 字以内
- 内容要符合小说类型
- 直接输出小标题+内容，不要加额外说明`
  }

  return `你是一个网文世界观设定助手。根据以下项目信息，为这部小说生成「${section.label}」的内容。直接输出内容，控制在 300 字以内，不要加额外说明。`
}
