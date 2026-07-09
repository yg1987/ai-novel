# Task P1-5: Inspiration / Brainstorm Mode

**Files:**
- Create: `src/services/brainstormService.ts`
- Create: `src/components/BrainstormPanel.tsx`
- Modify: `src/components/ProjectView.tsx` (add brainstorm tab)
- Modify: `src/style.css` (add brainstorm styles)

**Interfaces:**
- Consumes: `loadProviderConfig()` for AI call, context engine patterns for prompt building
- Produces: AI-generated plot direction suggestions, character development ideas, scene expansion ideas

**Dependencies:** This task depends on `src/utils/htmlToText.ts` (created by P1-3). If P1-3 hasn't been implemented yet, create a minimal `htmlToPlainText` function directly in the service instead.

## Existing Patterns

The existing `rewriteService.ts` shows the pattern for AI streaming calls. The `reviewService.ts` shows the pattern for non-streaming AI calls. Use the non-streaming pattern (fetch → JSON response) for brainstorm since we want the full response at once, not streaming.

Existing `src/services/aiProvider.ts` has the streaming generation pattern. The brainstorming service is different — it uses `analysis` model (not `writing`), non-streaming, higher temperature (0.8).

## Detailed Steps

### Step 1: Create `src/services/brainstormService.ts`

```typescript
// src/services/brainstormService.ts
import { loadProviderConfig, listChapters, getChapterContent, readProjectFile } from '../api/tauri'
import { htmlToPlainText } from '../utils/htmlToText'

export type BrainstormMode = 'plot_twist' | 'scene_idea' | 'character_dev' | 'world_expand'

export interface BrainstormRequest {
  mode: BrainstormMode
  projectId: string
  chapterNumber?: number
}

const MODE_PROMPTS: Record<BrainstormMode, string> = {
  plot_twist: `你是一个网文创意助手。根据以下项目信息，提供 3-5 个情节走向建议。
每个建议包含：情节点名称、具体描述（50-100字）、适用章节位置、预期效果。
建议要有新意但符合作品已有设定，不要推翻已有剧情。`,

  scene_idea: `你是一个网文场景创意助手。根据以下项目信息，提供 3-5 个具体的场景/桥段创意。
每个创意包含：场景名称、具体描写提示（50-100字）、可以插入的位置、配套的情绪氛围。
适合当前类型（玄幻/都市/言情等）的经典桥段 + 带新意的变体。`,

  character_dev: `你是一个角色发展创意助手。根据以下项目信息和角色状态，提供 3-5 个角色发展建议。
每个建议包含：涉及角色、发展方向、具体情节示例（50-100字）、为什么适合该角色。
考虑角色的当前状态、动机、未解伏笔。`,

  world_expand: `你是一个世界观扩展助手。根据以下世界观设定，提供 3-5 个世界观扩展方向。
每个方向包含：扩展主题、具体内容（50-100字）、与现有设定的衔接方式、可挖掘的剧情潜力。
不要与已有设定矛盾。`,
}

export interface BrainstormResult {
  title: string
  content: string
}

export async function runBrainstorm(
  request: BrainstormRequest,
): Promise<BrainstormResult[]> {
  const config = await loadProviderConfig()
  const provider = config.providers.find((p) => p.name === config.active_profile)
  if (!provider) throw new Error('未配置 AI Provider')

  // Build context
  const contextParts: string[] = []

  // Project metadata
  try {
    const metaRaw = await readProjectFile(request.projectId, '', 'project.json')
    const meta = JSON.parse(metaRaw)
    contextParts.push(`项目名称：${meta.name || ''}\n类型：${meta.genre || ''}\n简介：${meta.description || ''}`)
  } catch { /* ignore */ }

  // Recent chapters (last 3)
  try {
    const chapters = await listChapters(request.projectId)
    const recent = [...chapters].sort((a, b) => b.order - a.order).slice(0, 3)
    const summaries: string[] = ['## 最近章节']
    for (const ch of recent) {
      const html = await getChapterContent(request.projectId, ch.id)
      const text = htmlToPlainText(html)
      summaries.push(`第${ch.order}章：${text.slice(0, 200)}`)
    }
    contextParts.push(summaries.join('\n'))
  } catch { /* ignore */ }

  // Character states (abbreviated)
  try {
    const cognitionRaw = await readProjectFile(request.projectId, 'memory', 'character-states.json')
    const cognition = JSON.parse(cognitionRaw)
    const charLines: string[] = ['## 角色状态']
    for (const c of cognition.characters || []) {
      charLines.push(`${c.character}：知道[${(c.knows || []).slice(0, 3).join(', ')}]，不知道[${(c.doesNotKnow || []).slice(0, 3).join(', ')}]`)
    }
    contextParts.push(charLines.join('\n'))
  } catch { /* ignore */ }

  // Unresolved foreshadowing
  try {
    const foreshadowRaw = await readProjectFile(request.projectId, 'memory', 'foreshadows.json')
    const store = JSON.parse(foreshadowRaw)
    const pending = (store.entries || []).filter((e: any) => e.status !== 'resolved' && e.status !== 'abandoned')
    if (pending.length > 0) {
      contextParts.push(`## 未解伏笔\n${pending.slice(0, 5).map((f: any) => `- ${f.name}：${f.description}`).join('\n')}`)
    }
  } catch { /* ignore */ }

  const modeLabel: Record<BrainstormMode, string> = {
    plot_twist: '情节走向',
    scene_idea: '场景创意',
    character_dev: '角色发展',
    world_expand: '世界观扩展',
  }

  const systemPrompt = MODE_PROMPTS[request.mode]
  const userMessage = contextParts.join('\n\n') || '（暂无项目数据）'

  const response = await fetch(`${provider.base_url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.api_key}`,
    },
    body: JSON.stringify({
      model: provider.models.analysis,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.8,
      max_tokens: 2048,
    }),
  })

  if (!response.ok) {
    throw new Error(`Brainstorm API error: ${response.status}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const rawContent = data.choices?.[0]?.message?.content ?? ''

  // Split by numbered items
  const results: BrainstormResult[] = []
  const blocks = rawContent.split(/(?=\d+[\.、])/).filter((b) => b.trim().length > 20)
  for (const block of blocks) {
    const firstLine = block.trim().split('\n')[0] || ''
    results.push({
      title: firstLine.slice(0, 60),
      content: block.trim(),
    })
  }

  if (results.length === 0) {
    results.push({
      title: modeLabel[request.mode],
      content: rawContent,
    })
  }

  return results
}
```

### Step 2: Create `src/components/BrainstormPanel.tsx`

```tsx
// src/components/BrainstormPanel.tsx
import { useState } from 'react'
import { runBrainstorm, type BrainstormMode, type BrainstormResult } from '../services/brainstormService'

interface Props {
  projectId: string
}

const MODE_CONFIG: { key: BrainstormMode; label: string; icon: string; desc: string }[] = [
  { key: 'plot_twist', label: '情节走向', icon: '🔄', desc: '卡文时找新方向' },
  { key: 'scene_idea', label: '场景创意', icon: '🎬', desc: '缺少具体桥段' },
  { key: 'character_dev', label: '角色发展', icon: '👤', desc: '角色需要成长' },
  { key: 'world_expand', label: '世界观扩展', icon: '🌍', desc: '想丰富设定' },
]

export default function BrainstormPanel({ projectId }: Props) {
  const [mode, setMode] = useState<BrainstormMode>('plot_twist')
  const [results, setResults] = useState<BrainstormResult[]>([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    setResults([])
    try {
      const res = await runBrainstorm({ mode, projectId })
      setResults(res)
    } catch (e) {
      setError(String(e))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="panel-layout brainstorm-panel">
      <div className="panel-sidebar brainstorm-sidebar">
        <h3>灵感模式</h3>
        <p className="brainstorm-subtitle">选择你需要的创意方向</p>
        <div className="brainstorm-modes">
          {MODE_CONFIG.map((m) => (
            <button
              key={m.key}
              className={`brainstorm-mode-btn${mode === m.key ? ' active' : ''}`}
              onClick={() => setMode(m.key)}
            >
              <span className="brainstorm-mode-icon">{m.icon}</span>
              <span className="brainstorm-mode-label">{m.label}</span>
              <span className="brainstorm-mode-desc">{m.desc}</span>
            </button>
          ))}
        </div>
        <button
          className="btn-primary"
          onClick={handleGenerate}
          disabled={generating}
          style={{ width: '100%', marginTop: 12 }}
        >
          {generating ? '生成中…' : '✨ 生成灵感'}
        </button>
        {error && <div className="error-bar" style={{ marginTop: 8 }}>{error}</div>}
      </div>

      <div className="panel-editor brainstorm-content">
        {results.length > 0 ? (
          <div className="brainstorm-results">
            <h3>创意建议</h3>
            {results.map((r, i) => (
              <div key={i} className="brainstorm-card">
                <div className="brainstorm-card-header">
                  <span className="brainstorm-card-index">{i + 1}</span>
                  <h4>{r.title}</h4>
                </div>
                <div className="brainstorm-card-body">
                  {r.content.split('\n').map((line, j) => (
                    <p key={j}>{line}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="review-empty">
            <p style={{ fontSize: '2rem', marginBottom: 16 }}>💡</p>
            <p>选择左侧的创意方向，点击「生成灵感」</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 8 }}>
              AI 会根据你的项目数据（最近章节、角色状态、未解伏笔）生成有针对性的建议
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
```

### Step 3: Add brainstorm tab to `ProjectView.tsx`

In `src/components/ProjectView.tsx`:

```typescript
// Add import
import BrainstormPanel from './BrainstormPanel'

// Extend Tab
type Tab = 'writing' | 'characters' | 'worldview' | 'outline' | 'notes' | 'foreshadow' | 'search' | 'stats' | 'review' | 'resource' | 'graph' | 'brainstorm'

// Add tab button (after resource or graph button)
// NOTE: The 'graph' tab may or may not exist yet. Add brainstorm after the last existing tab.
// Find the last tab button (currently 'resource') and add after it:
<button className={`tab-btn${tab === 'brainstorm' ? ' active' : ''}`} onClick={() => setTab('brainstorm')}>💡 灵感</button>

// Add tab content
{tab === 'brainstorm' && <BrainstormPanel projectId={project.id} />}
```

Read the existing `ProjectView.tsx` first to understand the current tab list. The current tabs are: writing, characters, worldview, outline, notes, foreshadow, search, stats, review, resource. Add 'brainstorm' after 'resource'.

### Step 4: Add CSS to `src/style.css`

```css
/* ─── Brainstorm Panel ─────────────────────────── */
.brainstorm-panel { height: 100%; }
.brainstorm-sidebar {
  width: 240px; padding: 16px; overflow-y: auto;
}
.brainstorm-sidebar h3 { font-size: 0.95rem; margin-bottom: 4px; }
.brainstorm-subtitle { font-size: 0.78rem; color: var(--text-muted); margin-bottom: 16px; }
.brainstorm-modes { display: flex; flex-direction: column; gap: 6px; }
.brainstorm-mode-btn {
  display: flex; flex-direction: column; align-items: flex-start;
  padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--bg-card); cursor: pointer; transition: all 0.15s;
  text-align: left; width: 100%;
}
.brainstorm-mode-btn:hover { border-color: var(--accent); }
.brainstorm-mode-btn.active { border-color: var(--accent); background: var(--accent-dim); }
.brainstorm-mode-icon { font-size: 1.2rem; }
.brainstorm-mode-label { font-weight: 600; font-size: 0.85rem; margin-top: 2px; }
.brainstorm-mode-desc { font-size: 0.75rem; color: var(--text-muted); }
.brainstorm-content {
  overflow-y: auto; padding: 16px;
}
.brainstorm-results h3 { font-size: 1rem; margin-bottom: 16px; }
.brainstorm-card {
  background: var(--bg-card); border-radius: var(--radius);
  box-shadow: var(--shadow); margin-bottom: 12px; overflow: hidden;
}
.brainstorm-card-header {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px; border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.brainstorm-card-index {
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--accent); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.78rem; font-weight: 600; flex-shrink: 0;
}
.brainstorm-card-header h4 { font-size: 0.9rem; }
.brainstorm-card-body {
  padding: 12px 16px; font-size: 0.85rem; line-height: 1.6;
}
.brainstorm-card-body p { margin: 4px 0; }
```

### Step 5: Handle missing `htmlToPlainText` dependency

The `brainstormService.ts` imports `htmlToPlainText` from `../utils/htmlToText`. If this file doesn't exist yet (P1-3 may not be done), create it with:

```typescript
// src/utils/htmlToText.ts
export function htmlToPlainText(html: string): string {
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}
```

### Step 6: Verify and commit

Run: `npx tsc --noEmit` — expect clean

```bash
git add src/services/brainstormService.ts src/components/BrainstormPanel.tsx src/components/ProjectView.tsx src/style.css src/utils/htmlToText.ts
git commit -m "feat(brainstorm): add AI-powered inspiration/brainstorm mode with 4 creative directions"
```

## Global Constraints

- No `as any`, `@ts-ignore`, or `@ts-expect-error` allowed
- TypeScript strict mode — new types go in `src/types/`
- New panels follow AGENTS.md `panel-layout` CSS convention (`.panel-layout` / `.panel-sidebar` / `.panel-editor`)
- Every change must pass `npx tsc --noEmit`
