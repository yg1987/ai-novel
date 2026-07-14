// src/contextEngine/sources.ts
import { readProjectFile, listChapters } from '../api/tauri'
import type { DataSource, ContextLoadContext } from './dataSource'
import type { CognitionState } from '../types/novel'
import { loadForeshadows, loadForeshadowConfig } from '../services/foreshadowStorage'
import { loadAllNotes, buildChapterRef } from '../services/notesStorage'
import type { NoteEntry } from '../services/notesStorage'
import { classifyForeshadows, classifiedForeshadowsToText } from '../services/foreshadowContext'

const SNAPSHOT_DIR = 'memory/snapshots'
const COGNITION_FILE = 'character-states.json'

// ─── Helpers ───────────────────────────────

function cognitionToText(state: CognitionState): string {
  const lines: string[] = []
  for (const char of state.characters) {
    if (char.knows.length > 0) lines.push(`${char.character}知道：${char.knows.join('、')}`)
    if (char.doesNotKnow.length > 0) lines.push(`${char.character}不知道：${char.doesNotKnow.join('、')}`)
  }
  if (state.readerKnows.length > 0) lines.push(`读者知道但角色不知道：${state.readerKnows.join('、')}`)
  return lines.join('\n')
}

export function foreshadowToText(entries: { name: string; description: string; status: string; plantedChapterId: string }[]): string {
  if (entries.length === 0) return ''
  return entries.map((f) => {
    const statusLabel = f.status === 'advanced' ? '推进中' : '已埋设'
    return `· [${statusLabel}] ${f.name}：${f.description}（${f.plantedChapterId}埋设）`
  }).join('\n')
}

// ─── Data Sources ───────────────────────────

export const cognitionDS: DataSource<string> = {
  name: '角色认知',
  priority: 7,
  async load(ctx: ContextLoadContext): Promise<string> {
    try {
      const raw = await readProjectFile(ctx.projectId, 'memory', COGNITION_FILE)
      if (!raw.trim()) return ''
      const state = JSON.parse(raw) as CognitionState
      return cognitionToText(state)
    } catch { return '' }
  },
}

export const foreshadowDS: DataSource<string> = {
  name: '未解伏笔',
  priority: 5,
  async load(ctx: ContextLoadContext): Promise<string> {
    try {
      const store = await loadForeshadows(ctx.projectId)
      const unresolved = store.entries.filter(
        (e) => e.status !== 'resolved' && e.status !== 'abandoned',
      )
      if (unresolved.length === 0) return ''

      const chapters = await listChapters(ctx.projectId)
      const config = await loadForeshadowConfig(ctx.projectId)

      // Load current chapter snapshot to get appearing characters
      let currentChars: string[] = []
      try {
        const snapRaw = await readProjectFile(
          ctx.projectId,
          'memory/snapshots',
          `${ctx.chapterId}.snapshot.json`,
        )
        if (snapRaw.trim()) {
          const snap = JSON.parse(snapRaw)
          if (Array.isArray(snap.characters)) currentChars = snap.characters
        }
      } catch { /* no snapshot yet */ }

      const classified = classifyForeshadows(unresolved, ctx.chapterId, chapters, config)
      const text = classifiedForeshadowsToText(
        classified,
        chapters,
        ctx.chapterId,
        currentChars.length > 0 ? currentChars : undefined,
      )
      return text
    } catch { return '' }
  },
}

export const styleDS: DataSource<string> = {
  name: '文风设定',
  priority: 11,
  async load(ctx: ContextLoadContext): Promise<string> {
    try {
      return await readProjectFile(ctx.projectId, '', 'style.md')
    } catch { return '' }
  },
}

/** Recent chapter summaries (last 3) */
export const recentSummaryDS: DataSource<string> = {
  name: '最近剧情摘要',
  priority: 6,
  async load(ctx: ContextLoadContext): Promise<string> {
    const summaries: string[] = []
    for (let i = Math.max(1, ctx.chapterNumber - 3); i < ctx.chapterNumber; i++) {
      const chId = `ch${String(i).padStart(3, '0')}`
      try {
        const raw = await readProjectFile(ctx.projectId, SNAPSHOT_DIR, `${chId}.snapshot.json`)
        if (raw.trim()) {
          const snap = JSON.parse(raw)
          summaries.push(`第${i}章「${snap.chapterTitle || chId}」：${snap.summary || ''}`)
        }
      } catch { /* snapshot may not exist */ }
    }
    return summaries.join('\n')
  },
}

// ─── Notes source ──────────────────────────

function notesToText(notes: NoteEntry[], chapterRef: string): string {
  const chapterNotes = notes.filter((n) => n.chapterRef === chapterRef)
  const projectTodos = notes.filter((n) => !n.chapterRef && n.type === 'todo' && !n.done)

  const sections: string[] = []

  const plainNotes = chapterNotes.filter((n) => n.type === 'note')
  if (plainNotes.length > 0) {
    sections.push(plainNotes.map((n) => `- ${n.content}`).join('\n'))
  }

  const todos = [
    ...chapterNotes.filter((n) => n.type === 'todo' && !n.done),
    ...projectTodos,
  ]
  if (todos.length > 0) {
    sections.push(todos.map((n) => {
      const label = n.chapterRef ? '（关联本章）' : '（项目级）'
      return `- ☐ ${n.content} ${label}`
    }).join('\n'))
  }

  const questions = chapterNotes.filter((n) => n.type === 'question' && !n.resolved)
  if (questions.length > 0) {
    sections.push(questions.map((n) => `- ❓ ${n.content}`).join('\n'))
  }

  if (sections.length === 0) return ''

  const labels = [
    plainNotes.length > 0 ? '写作笔记' : '',
    todos.length > 0 ? '待办事项' : '',
    questions.length > 0 ? '疑问待确认' : '',
  ].filter(Boolean)

  return labels.map((label, i) => {
    if (!sections[i]) return ''
    return `【${label}】\n${sections[i]}`
  }).filter(Boolean).join('\n\n')
}

export const notesDS: DataSource<string> = {
  name: '写作笔记',
  priority: 9,
  async load(ctx: ContextLoadContext): Promise<string> {
    try {
      const all = await loadAllNotes(ctx.projectId)
      const chapterRef = buildChapterRef(ctx.volume, ctx.chapterId)
      return notesToText(all, chapterRef)
    } catch { return '' }
  },
}
