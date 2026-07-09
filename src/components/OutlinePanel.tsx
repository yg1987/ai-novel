import { useState, useEffect, useCallback } from 'react'
import { listProjectFiles, readProjectFile, writeProjectFile, deleteProjectFile, loadProviderConfig } from '../api/tauri'
import { loadPrompt, savePrompt, resetPrompt } from '../services/aiPrompts'
import ConfirmDialog from './ConfirmDialog'

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
    writeProjectFile(projectId, OUTLINE_CHAPTER_DIR, name, `${label}细纲：\n\n情节点：\n\n`)
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
      Promise.all([
        deleteProjectFile(projectId, OUTLINE_DIR, name),
        ...volChapters.map((c) => deleteProjectFile(projectId, OUTLINE_CHAPTER_DIR, c.filename)),
      ]).then(() => {
        if (activeFile === name || volChapters.some((c) => c.filename === activeFile)) {
          setActiveFile('outline.md')
          setActiveType('outline')
        }
        setDeleteTarget(null)
        refresh()
      }).catch((e: unknown) => { console.error(e) })
    } else {
      deleteProjectFile(projectId, OUTLINE_CHAPTER_DIR, name).then(() => {
        if (activeFile === name) {
          setActiveFile('outline.md')
          setActiveType('outline')
        }
        setDeleteTarget(null)
        refresh()
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

      let context = ''
      try {
        const metaRaw = await readProjectFile(projectId, '', 'project.json')
        const meta = JSON.parse(metaRaw) as { name?: string; genre?: string; description?: string }
        context = `小说名称：${meta.name ?? ''}\n类型：${meta.genre ?? ''}\n简介：${meta.description ?? ''}`
      } catch { /* ignore */ }

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

  return (
    <div className="panel-layout">
      <div className="panel-sidebar">
        <div className="panel-sidebar-header">
          <h3>大纲</h3>
          <button className="btn-small" onClick={handleCreateVolume} title="添加分卷">+</button>
        </div>
        <div className="panel-list">
          {/* 总纲 */}
          <div
            className={`panel-item${activeFile === 'outline.md' ? ' active' : ''}`}
            onClick={() => openFile('outline.md', 'outline')}
          >
            📋 总纲
          </div>

          {/* 分卷 + 归属的章节细纲 */}
          {volumes.map((v) => {
            const volLabel = v.replace(/\.md$/, '')
            const volChapters = chaptersByVolume(volLabel)
            const isVolActive = activeFile === v
            return (
              <div key={v}>
                <div className={`panel-item${isVolActive ? ' active' : ''}`}>
                  <div className="panel-item-main" onClick={() => openFile(v, 'volume')}>
                    📖 {volLabel}
                  </div>
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button
                      className="panel-item-add"
                      onClick={(e) => { e.stopPropagation(); handleCreateChapter(volLabel) }}
                      title="添加章节细纲"
                    >+</button>
                    <button
                      className="panel-item-add"
                      style={{ color: 'var(--danger)' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTarget({ name: v, label: volLabel, type: 'volume' })
                      }}
                      title="删除分卷"
                    >✕</button>
                  </div>
                </div>
                {volChapters.map((c) => (
                  <div key={c.filename} className="panel-sub-item-row">
                    <div
                      className={`panel-sub-item${activeFile === c.filename ? ' active' : ''}`}
                      onClick={() => openFile(c.filename, 'chapter')}
                    >
                      📝 {c.label}
                    </div>
                    <button
                      className="panel-item-add"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => setDeleteTarget({ name: c.filename, label: c.label, type: 'chapter' })}
                      title="删除章节细纲"
                    >✕</button>
                  </div>
                ))}
              </div>
            )
          })}

          {volumes.length === 0 && <p className="panel-empty">暂无分卷，点击 + 添加</p>}
        </div>

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

      <div className="panel-editor">
        {activeFile ? (
          <>
            <div className="panel-editor-header">
              <h3>{activeLabel()}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {dirty && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>未保存</span>}
                {editing && (
                  <>
                    <button
                      className="btn-text"
                      onClick={() => { void handleAIGenerate() }}
                      disabled={generatingAi}
                      style={{ fontSize: '0.85rem' }}
                    >
                      {generatingAi ? '⏳ 生成中…' : '✨ AI 辅助'}
                    </button>
                    <button
                      className="btn-text"
                      onClick={() => { setShowExample(!showExample) }}
                      style={{ fontSize: '0.85rem' }}
                    >
                      {showExample ? '收起示例' : '📖 看示例'}
                    </button>
                    <button
                      className="btn-text"
                      onClick={() => {
                        if (!showPrompt && !editingPrompt.trim()) {
                          setEditingPrompt(getActiveDefaultPrompt())
                        }
                        setShowPrompt(!showPrompt)
                      }}
                      style={{ fontSize: '0.85rem' }}
                    >
                      {showPrompt ? '关闭提示词' : '✎ 提示词'}
                    </button>
                  </>
                )}
                {editing ? (
                  <button className="btn-primary" onClick={() => { void saveFile() }}>保存</button>
                ) : (
                  <button className="btn-secondary" onClick={() => { setEditing(true) }}>编辑</button>
                )}
              </div>
            </div>

            {showPrompt && editing && (
              <div className="prompt-editor">
                <div className="prompt-editor-header">
                  <span>提示词（AI 辅助使用，修改后自动保存到本项目）</span>
                  <button
                    className="btn-text"
                    style={{ fontSize: '0.8rem' }}
                    onClick={async () => {
                      setSavingPrompt(true)
                      await resetPrompt(projectId, promptKey)
                      setEditingPrompt('')
                      setShowPrompt(false)
                      setSavingPrompt(false)
                    }}
                  >恢复默认</button>
                </div>
                <textarea
                  className="prompt-editor-textarea"
                  value={editingPrompt}
                  onChange={(e) => { setEditingPrompt(e.target.value) }}
                  placeholder="在此编写自定义提示词…"
                />
                <div className="prompt-editor-footer">
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {editingPrompt.trim() ? '已保存自定义提示词' : '修改后点保存，AI 将使用你的提示词'}
                  </span>
                  <button
                    className="btn-primary"
                    style={{ fontSize: '0.82rem', padding: '4px 12px' }}
                    disabled={savingPrompt}
                    onClick={async () => {
                      setSavingPrompt(true)
                      await savePrompt(projectId, promptKey, editingPrompt)
                      setSavingPrompt(false)
                    }}
                  >{savingPrompt ? '保存中…' : '保存提示词'}</button>
                </div>
              </div>
            )}

            {aiError && (
              <div style={{ padding: '8px 24px', fontSize: '0.85rem', color: 'var(--danger)', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                AI 生成失败：{aiError}
              </div>
            )}

            {showExample && editing && (
              <div className="sub-field-example" style={{ margin: '8px 24px' }}>
                <pre>{EXAMPLES[activeType] ?? '暂无示例'}</pre>
              </div>
            )}

            {editing ? (
              <textarea
                className="panel-textarea"
                value={content}
                onChange={(e) => { setContent(e.target.value); setDirty(true) }}
                placeholder={
                  activeType === 'outline' ? '撰写全书总纲…' :
                  activeType === 'volume' ? '撰写本卷大纲…' :
                  '撰写章节细纲，3-5 个情节点…'
                }
              />
            ) : (
              <div className="panel-preview">{content || '暂无内容'}</div>
            )}
          </>
        ) : (
          <div className="panel-placeholder">选择或创建大纲</div>
        )}
      </div>
    </div>
  )
}
