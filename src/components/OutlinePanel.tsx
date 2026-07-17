import { useState, useEffect, useCallback, useRef } from 'react'
import { listProjectFiles, readProjectFile, writeProjectFile, deleteProjectFile, loadProviderConfig } from '../api/tauri'
import { buildAIContext } from '../services/aiContext'
import { loadPrompt, savePrompt, resetPrompt } from '../services/aiPrompts'
import { loadChapterExpectedWords, saveChapterExpectedWords, loadSettings } from '../services/settings'
import type { TextareaSelection } from '../services/rewriteUtils'
import { getTextareaSelection, applyTextareaRewrite } from '../services/rewriteUtils'
import { type RewriteMode } from '../services/rewriteService'
import type { ContextMenuAction } from './SelectionContextMenu'
import ConfirmDialog from './ConfirmDialog'
import OutlineSidebar from './outline-panel/OutlineSidebar'
import OutlineEditor from './outline-panel/OutlineEditor'

interface Props {
  projectId: string
}

const OUTLINE_DIR = 'outline'
const OUTLINE_CHAPTER_DIR = 'outline/细纲'

interface ChapterInfo {
  filename: string
  label: string
  volumeLabel: string // e.g. "卷1"
}

// ─── Examples ─────────────────────────────────────────

const EXAMPLES: Record<string, string> = {
  outline: `故事背景：这是一个以武道为尊的世界，大陆分为五域，修炼之风盛行。

主线剧情：
- 开局：主角林氏少年林烬在家族大比中落败，被嘲笑为废柴
- 发展：意外获得太古剑魂传承，修为突飞猛进，考入玄天宗
- 转折：发现父母失踪与天渊封印有关，宗门内奸暴露
- 高潮：天渊封印破裂，邪魔入侵，林烬挺身而出
- 结局：林烬封印天渊，成为剑道至尊，揭开父母身世之谜

核心冲突：林烬与宗门内奸的斗争 / 人族与邪魔的千年战争
结局走向：HE，主角成就至尊，但留下续作空间（天渊之外还有更高层次的世界）

→ 按这个框架把你的故事填进去就行，不用太详细。`,

  volume: `第1卷 - 崛起篇

概要：林烬从家族弃子成长为玄天宗核心弟子，初步掌握剑魂之力。

主要冲突：
- 家族内部排挤 vs 林烬的反击
- 玄天宗入门考核的竞争
- 首次接触天渊秘密

章节规划（共 10 章）：
第1章：家族大比落败，被羞辱
第2章：意外获得剑魂传承
第3-4章：拜入玄天宗
第5-7章：修行历练，崭露头角
第8-9章：初次接触天渊之谜
第10章：第一卷高潮，获得秘境资格

本卷目标：建立世界观，塑造主角性格，埋下天渊伏笔

→ 写 3-5 句话概括本卷剧情走向就行。`,

  chapter: `第3章 - 剑魂觉醒

情节点 1：林烬在藏经阁被同门围攻
描述：三名外门弟子堵住林烬，嘲讽他"废物不配进藏经阁"，动手推搡
类型：铺垫
字数：300 字

情节点 2：危急时刻剑魂共鸣
描述：林烬被推倒撞上墙壁，祖传玉佩碎裂，太古剑魂觉醒，剑气震退三人
类型：爽点
字数：200 字

情节点 3：藏经阁长老现身
描述：长老感应到剑气波动赶来，斥退众人，却若有所思地看了林烬一眼
类型：推进
字数：250 字

情节点 4：回到住处整理思绪
描述：林烬回想刚才的异象，决定隐瞒剑魂的秘密，私下查询父母遗物
类型：悬念
字数：250 字

→ 每章写 3-5 个情节点，每个写清楚发生什么 + 类型 + 大概字数。`,
}

// ─── AI prompt builders ───────────────────────────────

/** 从大纲文件名推导章节 ID，如 "卷1_第1章.md" → "ch001" */
function outlineFileToChapterId(filename: string): string | null {
  const match = filename.match(/卷(\d+)_第(\d+)章/)
  if (!match) return null
  return `ch${match[2]!.padStart(3, '0')}`
}

function getDefaultPrompt(type: 'outline' | 'volume' | 'chapter', label: string): string {
  const prompts: Record<'outline' | 'volume' | 'chapter', string> = {
    outline: `你是一个网文大纲助手。根据项目信息，生成全书的总纲（故事梗概）。

请按以下结构输出：

## 故事背景（一句话概括世界观）
## 主线剧情（故事的起承转合）
## 核心冲突（主要矛盾）
## 结局走向

控制在 500 字以内，直接输出，不要加额外说明。`,
    volume: `你是一个网文大纲助手。根据项目信息，为「${label}」生成分卷大纲。

请按以下结构输出：

## 概要（本卷的核心剧情）
## 主要冲突
## 章节规划（计划写几章，每章一句话概括）
## 本卷目标

控制在 300 字以内，直接输出，不要加额外说明。`,
    chapter: `你是一个网文大纲助手。根据项目信息，为「${label}」生成章节细纲。

请生成 3-5 个情节点，每个情节点包含：

1. 情节点名称
2. 具体描述（1-2 句话）
3. 类型（铺垫/爽点/推进/转折/悬念）
4. 字数预算

输出格式：
## 情节点 1
- 名称：xxx
- 描述：xxx
- 类型：铺垫
- 字数：300 字

控制在 400 字以内，直接输出。`,
  }
  return prompts[type]
}

// ─── Component ────────────────────────────────────────

export default function OutlinePanel({ projectId }: Props) {
  // Sidebar data
  const [volumes, setVolumes] = useState<string[]>([])
  const [chapters, setChapters] = useState<ChapterInfo[]>([])
  const [activeFile, setActiveFile] = useState<string | null>('outline.md')
  const [activeType, setActiveType] = useState<'outline' | 'volume' | 'chapter'>('outline')

  // Editor state
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)

  // AI state
  const [generatingAi, setGeneratingAi] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [showExample, setShowExample] = useState(false)
  const [rewriteState, setRewriteState] = useState<(TextareaSelection & { mode: RewriteMode }) | null>(null)
  const [hasSelection, setHasSelection] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const rewriteTextareaRef = useRef<HTMLTextAreaElement>(null)
  const checkSelection = useCallback(() => {
    const ta = rewriteTextareaRef.current
    if (ta) setHasSelection(ta.selectionStart !== ta.selectionEnd)
  }, [])

  // ─── Expected words (chapter only) ────────────────

  const [expectedWordsState, setExpectedWordsState] = useState<{
    chapterId: string
    value: number | null
  } | null>(null)
  const expectedWordsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Derive chapterId from active outline file
  const activeChapterId = activeFile && activeType === 'chapter'
    ? outlineFileToChapterId(activeFile)
    : null
  const expectedWords = expectedWordsState?.chapterId === activeChapterId
    ? expectedWordsState.value
    : null

  // Load expectedWords when chapter changes
  useEffect(() => {
    if (!activeChapterId) return
    loadChapterExpectedWords(projectId, activeChapterId)
      .then((v) => {
        if (v != null) {
          setExpectedWordsState({ chapterId: activeChapterId, value: v })
        } else {
          // No outline value set — use system default
          loadSettings()
            .then((s) => { setExpectedWordsState({ chapterId: activeChapterId, value: s.default_word_count }) })
            .catch(() => { setExpectedWordsState({ chapterId: activeChapterId, value: 4000 }) })
        }
      })
      .catch(() => { setExpectedWordsState({ chapterId: activeChapterId, value: null }) })
  }, [projectId, activeChapterId])

  const persistExpectedWords = async (id: string, words: number) => {
    try {
      await saveChapterExpectedWords(projectId, id, words)
    } catch { /* ignore */ }
  }

  // ─── Data loading ──────────────────────────────────

  const refresh = useCallback(async () => {
    const [rootFiles, chapterFiles] = await Promise.all([
      listProjectFiles(projectId, OUTLINE_DIR),
      listProjectFiles(projectId, OUTLINE_CHAPTER_DIR).catch(() => []),
    ])

    // Volumes: .md files at root of outline/ that aren't outline.md
    const vols = rootFiles
      .map((f) => f.name)
      .filter((n) => n.endsWith('.md') && n !== 'outline.md')
      .sort()
    setVolumes(vols)

    // Chapters: parse filenames like "卷1_第1章.md" -> volumeLabel + chapterLabel
    const chs: ChapterInfo[] = chapterFiles
      .map((f) => {
        const name = f.name
        if (!name.endsWith('.md')) return null
        const label = name.replace(/\.md$/, '')
        // Try to extract volume prefix (e.g. "卷1_第1章" -> volumeLabel="卷1", chapterLabel="第1章")
        const match = label.match(/^(卷\d+)_(.+)$/)
        if (match) {
          return { filename: name, label: match[2]!, volumeLabel: match[1]! }
        }
        return { filename: name, label, volumeLabel: '' }
      })
      .filter((c): c is ChapterInfo => c !== null)
      .sort((a, b) => {
        // Sort by volume number first, then chapter number
        const volA = parseInt(a.volumeLabel.match(/\d+/)?.[0] ?? '0')
        const volB = parseInt(b.volumeLabel.match(/\d+/)?.[0] ?? '0')
        if (volA !== volB) return volA - volB
        const chA = parseInt(a.label.match(/\d+/)?.[0] ?? '0')
        const chB = parseInt(b.label.match(/\d+/)?.[0] ?? '0')
        return chA - chB
      })
    setChapters(chs)
  }, [projectId])

  useEffect(() => {
    refresh().catch((e: unknown) => { console.error(e) })
  }, [refresh])

  // Load content when active file changes
  useEffect(() => {
    if (!activeFile) return
    if (activeType === 'chapter') {
      readProjectFile(projectId, OUTLINE_CHAPTER_DIR, activeFile)
        .then((c) => { setContent(c); setDirty(false) })
        .catch((e: unknown) => { console.error(e) })
    } else {
      readProjectFile(projectId, OUTLINE_DIR, activeFile)
        .then((c) => { setContent(c); setDirty(false) })
        .catch((e: unknown) => { console.error(e) })
    }
  }, [projectId, activeFile, activeType])

  // Load saved prompt for this type
  const promptKey = `outline_${activeType}`
  useEffect(() => {
    loadPrompt(projectId, promptKey).then((saved) => {
      setEditingPrompt(saved ?? '')
      setShowPrompt(false)
    }).catch(() => {})
  }, [projectId, promptKey])

  // ─── File operations ────────────────────────────────

  const saveFile = async () => {
    if (!activeFile) return
    if (activeType === 'chapter') {
      await writeProjectFile(projectId, OUTLINE_CHAPTER_DIR, activeFile, content)
    } else {
      await writeProjectFile(projectId, OUTLINE_DIR, activeFile, content)
    }
    setEditing(false)
    setDirty(false)
  }

  const [deleteTarget, setDeleteTarget] = useState<{ name: string; label: string; type: 'volume' | 'chapter' } | null>(null)

  const handleCreateVolume = () => {
    const num = volumes.length + 1
    const name = `卷${num}.md`
    writeProjectFile(projectId, OUTLINE_DIR, name, `第${num}卷\n\n概要：\n\n章节规划：\n\n`)
      .then(() => refresh())
      .then(() => { setActiveFile(name); setActiveType('volume'); setEditing(true) })
      .catch((e: unknown) => { console.error(e) })
  }

  const handleCreateChapter = (volumeLabel: string) => {
    const existing = chapters.filter((c) => c.volumeLabel === volumeLabel)
    const chNum = existing.length + 1
    const name = `${volumeLabel}_第${chNum}章.md`
    const label = `第${chNum}章`
    void writeProjectFile(projectId, OUTLINE_CHAPTER_DIR, name, `${label}细纲：\n\n情节点：\n\n`)
      .then(() => refresh())
      .then(() => { setActiveFile(name); setActiveType('chapter'); setEditing(true) })
      .catch((e: unknown) => { console.error(e) })
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    const { name, type } = deleteTarget
    if (type === 'volume') {
      const volLabel = name.replace(/\.md$/, '')
      const volChapters = chaptersByVolume(volLabel)
      void Promise.all([
        deleteProjectFile(projectId, OUTLINE_DIR, name),
        ...volChapters.map((c) => deleteProjectFile(projectId, OUTLINE_CHAPTER_DIR, c.filename)),
      ]).then(() => {
        if (activeFile === name || volChapters.some((c) => c.filename === activeFile)) {
          setActiveFile('outline.md')
          setActiveType('outline')
        }
        setDeleteTarget(null)
        void refresh()
      }).catch((e: unknown) => { console.error(e) })
    } else {
      void deleteProjectFile(projectId, OUTLINE_CHAPTER_DIR, name).then(() => {
        if (activeFile === name) {
          setActiveFile('outline.md')
          setActiveType('outline')
        }
        setDeleteTarget(null)
        void refresh()
      }).catch((e: unknown) => { console.error(e) })
    }
  }

  // ─── Navigation ─────────────────────────────────────

  const openFile = (file: string, type: 'outline' | 'volume' | 'chapter') => {
    setActiveFile(file)
    setActiveType(type)
    setEditing(false)
  }

  const activeLabel = () => {
    if (!activeFile) return ''
    if (activeFile === 'outline.md') return '📋 总纲'
    if (activeType === 'chapter') return `📝 ${activeFile.replace(/\.md$/, '')}`
    return `📖 ${activeFile.replace(/\.md$/, '')}`
  }

  // ─── AI generation ──────────────────────────────────

  const getActiveDefaultPrompt = () => getDefaultPrompt(activeType, activeLabel())

  const handleAIGenerate = async () => {
    setGeneratingAi(true)
    setAiError(null)
    try {
      const config = await loadProviderConfig()
      const provider = config.providers.find((p) => p.name === config.active_profile)
      if (!provider) throw new Error('未配置 AI Provider')
      if (!provider.models.analysis) throw new Error('未配置分析模型，请在 AI 配置中设置')

      let context = await buildAIContext(projectId)

      const systemPrompt = editingPrompt.trim() || getActiveDefaultPrompt()

      const base = provider.base_url.replace(/\/+$/, '')
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.api_key}`,
        },
        body: JSON.stringify({
          model: provider.models.analysis,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: context || '请生成大纲内容' },
          ],
          temperature: 0.8,
          max_tokens: 2048,
        }),
      })
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
      const raw = data.choices?.[0]?.message?.content ?? ''
      if (raw.trim()) {
        setContent(raw.trim())
        setDirty(true)
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      setGeneratingAi(false)
    }
  }

  // Volume chapters grouped
  const chaptersByVolume = (volLabel: string) =>
    chapters.filter((c) => c.volumeLabel === volLabel)

  // ─── Rewrite handlers ──────────────────────────

  const handleRewriteMode = (mode: RewriteMode) => {
    const sel = getTextareaSelection(rewriteTextareaRef.current, content)
    if (!sel) return
    setRewriteState({ ...sel, mode })
  }

  const handleRewriteAccept = (newText: string) => {
    if (!rewriteState) return
    setContent((prev) => applyTextareaRewrite(prev, rewriteState.start, rewriteState.end, newText))
    setDirty(true)
    setRewriteState(null)
  }

  const menuItems: ContextMenuAction[] = contextMenu ? [
    { label: '✏️ AI 改写', onClick: () => handleRewriteMode('rewrite') },
    { label: '📝 AI 扩写', onClick: () => handleRewriteMode('expand') },
    { label: '✨ AI 润色', onClick: () => handleRewriteMode('polish') },
  ] : []

  return (
    <div className="panel-layout">
      <OutlineSidebar
        volumes={volumes}
        chapters={chapters}
        activeFile={activeFile}
        onOpen={openFile}
        onCreateVolume={handleCreateVolume}
        onCreateChapter={handleCreateChapter}
        onDeleteVolume={(name, label) => setDeleteTarget({ name, label, type: 'volume' })}
        onDeleteChapter={(name, label) => setDeleteTarget({ name, label, type: 'chapter' })}
      />

      <OutlineEditor
        activeFile={activeFile}
        activeType={activeType}
        content={content}
        editing={editing}
        dirty={dirty}
        generatingAi={generatingAi}
        aiError={aiError}
        showPrompt={showPrompt}
        editingPrompt={editingPrompt}
        savingPrompt={savingPrompt}
        showExample={showExample}
        expectedWords={expectedWords}
        activeChapterId={activeChapterId}
        example={EXAMPLES[activeType] ?? '暂无示例'}
        textareaRef={rewriteTextareaRef}
        onContentChange={(next) => { setContent(next); setDirty(true) }}
        onEdit={() => { setEditing(true) }}
        onSave={() => { void saveFile() }}
        onAIGenerate={() => { void handleAIGenerate() }}
        onTogglePrompt={() => {
          if (!showPrompt && !editingPrompt.trim()) {
            setEditingPrompt(getActiveDefaultPrompt())
          }
          setShowPrompt(!showPrompt)
        }}
        onPromptChange={setEditingPrompt}
        onResetPrompt={() => {
          setSavingPrompt(true)
          void resetPrompt(projectId, promptKey)
            .then(() => {
              setEditingPrompt('')
              setShowPrompt(false)
            })
            .catch((error: unknown) => { console.error(error) })
            .finally(() => setSavingPrompt(false))
        }}
        onSavePrompt={() => {
          setSavingPrompt(true)
          void savePrompt(projectId, promptKey, editingPrompt)
            .catch((error: unknown) => { console.error(error) })
            .finally(() => setSavingPrompt(false))
        }}
        onToggleExample={() => { setShowExample(!showExample) }}
        onExpectedWordsChange={(value) => {
          if (activeChapterId) setExpectedWordsState({ chapterId: activeChapterId, value })
          if (expectedWordsTimer.current) clearTimeout(expectedWordsTimer.current)
          expectedWordsTimer.current = setTimeout(() => {
            if (activeChapterId && value != null) {
              void persistExpectedWords(activeChapterId, value)
            }
          }, 800)
        }}
        onExpectedWordsCommit={(value) => {
          if (expectedWordsTimer.current) clearTimeout(expectedWordsTimer.current)
          if (activeChapterId) void persistExpectedWords(activeChapterId, value)
        }}
        onSelectionCheck={checkSelection}
        onSelectionContextMenu={(e) => {
          const ta = e.currentTarget
          if (ta.selectionStart !== ta.selectionEnd) {
            e.preventDefault()
            setContextMenu({ x: e.clientX, y: e.clientY })
          }
        }}
        rewriteState={rewriteState}
        hasSelection={hasSelection}
        onRewrite={handleRewriteMode}
        onRewriteAccept={handleRewriteAccept}
        onRewriteReject={() => setRewriteState(null)}
        contextMenu={contextMenu}
        onContextMenuClose={() => setContextMenu(null)}
        menuItems={menuItems}
      />

      {deleteTarget && (
        <ConfirmDialog
          title={deleteTarget.type === 'volume' ? '删除分卷' : '删除章节细纲'}
          message={`确定删除「${deleteTarget.label}」？${deleteTarget.type === 'volume' ? '\n该分卷下的所有章节细纲也将被删除。' : ''}\n此操作不可恢复。`}
          confirmText="删除"
          danger
          onConfirm={confirmDelete}
          onCancel={() => { setDeleteTarget(null) }}
        />
      )}
    </div>
  )
}
