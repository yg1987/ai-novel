import { useState, useEffect, useCallback, useRef } from 'react'
import { listProjectFiles, readProjectFile, writeProjectFile, deleteProjectFile, loadProviderConfig } from '../api/tauri'
import { loadPrompt, savePrompt, resetPrompt } from '../services/aiPrompts'
import { buildAIContext } from '../services/aiContext'
import type { TextareaSelection } from '../services/rewriteUtils'
import { getTextareaSelection, applyTextareaRewrite } from '../services/rewriteUtils'
import { type RewriteMode } from '../services/rewriteService'
import RewriteButtons from './RewriteButtons'
import RewritePreview from './RewritePreview'
import SelectionContextMenu, { type ContextMenuAction } from './SelectionContextMenu'

interface Props {
  projectId: string
  initialCharacter?: string | null
}

const CHARACTER_SUBDIR = 'characters'
const ORDER_FILE = 'order.json'

const CHAR_EXAMPLE = `角色：林烬
身份/职业：玄天宗外门弟子，后觉醒太古剑魂
外貌特征：黑发黑瞳，身形清瘦，左眉有一道细疤
性格特点：沉默寡言但重情义，遇强则强，不畏权势
背景经历：自幼父母双亡，被玄天宗收养。入门十二年仍在淬体境徘徊，遭同门轻视。意外获得太古剑魂传承后命运转折。
动机目标：寻找父母死因真相，最终成为剑道至尊
说话风格：话少，常用短句。愤怒时语气冰冷
标签：["剑修", "孤儿", "逆袭", "天选之子"]`

// ─── Random name pools ──────────────────────────────

const SURNAMES = [
  '陆', '谢', '江', '裴', '沈', '顾', '楚', '叶', '祁', '温',
  '莫', '独孤', '钟离', '云', '殷', '宋', '萧', '花', '柳',
  '苏', '容', '朝', '南', '白', '秋', '扶', '步', '知', '未',
]

const GIVEN_MALE = [
  '沉舟', '云归', '望舒', '惊蛰', '千寻', '夜白', '寒秋',
  '连', '如玉', '听雨', '长歌', '信', '煜', '铮', '无邪',
  '时归', '墨', '舟', '长刃', '远', '修', '岚', '朔', '川',
  '陵', '镜', '阙', '涯', '笙', '渡',
]

const GIVEN_FEMALE = [
  '浅月', '清漪', '暮雪', '折枝', '浸月', '朝音', '与',
  '歌', '枝', '辞', '露', '夕', '酒', '摇', '更', '欢',
  '歌', '央', '秋', '晚', '笙', '鸢', '瑶', '霜', '绮',
  '瑟', '柔', '阑', '吟', '筝',
]

function randomName(): string {
  const surname = SURNAMES[Math.floor(Math.random() * SURNAMES.length)]!
  const isMale = Math.random() > 0.5
  const pool = isMale ? GIVEN_MALE : GIVEN_FEMALE
  const given = pool[Math.floor(Math.random() * pool.length)]!
  return surname + given
}

// ─── AI prompt ───────────────────────────────────────

function buildAIPrompt(name: string, projectInfo: string): { system: string; user: string } {
  const nameLine = name.trim()
    ? `角色名：${name.trim()}`
    : '请先为角色起一个合适的名字（要符合小说类型）'

  return {
    system: `你是一个网文角色设定助手。根据以下项目信息，创建一个新的角色。

${projectInfo}

${nameLine}

请严格按以下格式输出，不要加额外说明：

角色：[名字]
身份/职业：
外貌特征：
性格特点：
背景经历：
动机目标：
说话风格：
标签：[标签1, 标签2, ...]

要求：
- 角色设定要符合小说类型
- 背景经历要有合理的成长弧光
- 性格要立体，有优点也有缺点
- 如果名字是你起的，确保名字不落俗套、有辨识度`,
    user: `请为这部小说生成一个完整的角色卡。`,
  }
}

// ─── Component ───────────────────────────────────────

export default function CharacterPanel({ projectId, initialCharacter }: Props) {
  const [files, setFiles] = useState<string[]>([])
  const [order, setOrder] = useState<string[]>([])
  const orderRef = useRef<string[]>([])
  // Keep ref in sync so mouse event closures use latest order
  useEffect(() => { orderRef.current = order }, [order])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [newName, setNewName] = useState('')
  const [showExample, setShowExample] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [rewriteState, setRewriteState] = useState<(TextareaSelection & { mode: RewriteMode }) | null>(null)
  const [hasSelection, setHasSelection] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const rewriteTextareaRef = useRef<HTMLTextAreaElement>(null)
  const checkSelection = useCallback(() => {
    const ta = rewriteTextareaRef.current
    if (ta) setHasSelection(ta.selectionStart !== ta.selectionEnd)
  }, [])

  const promptKey = 'character_create'

  useEffect(() => {
    loadPrompt(projectId, promptKey).then((saved) => {
      setEditingPrompt(saved ?? '')
      setShowPrompt(false)
    }).catch(() => {})
  }, [projectId, promptKey])

  const saveOrder = useCallback(async (names: string[]) => {
    await writeProjectFile(projectId, CHARACTER_SUBDIR, ORDER_FILE, JSON.stringify(names, null, 2))
  }, [projectId])

  const refresh = useCallback(async () => {
    const entries = await listProjectFiles(projectId, CHARACTER_SUBDIR)
    // Only .md files are character files; order.json is not a character
    const charNames = entries
      .filter((e) => e.name.endsWith('.md'))
      .map((e) => e.name.replace(/\.md$/i, ''))

    let currentOrder: string[] = []
    try {
      const raw = await readProjectFile(projectId, CHARACTER_SUBDIR, ORDER_FILE)
      if (raw.trim()) {
        currentOrder = JSON.parse(raw)
      }
    } catch { /* order.json missing or malformed */ }

    // Merge: keep order entries that still exist, append new ones at end
    const validOrder = currentOrder.filter((n) => charNames.includes(n))
    const newChars = charNames.filter((n) => !currentOrder.includes(n))
    const mergedOrder = [...validOrder, ...newChars]

    // Persist if order changed (new/deleted chars)
    if (mergedOrder.length !== currentOrder.length || validOrder.length !== currentOrder.length) {
      await writeProjectFile(projectId, CHARACTER_SUBDIR, ORDER_FILE, JSON.stringify(mergedOrder, null, 2))
    }

    setOrder(mergedOrder)
    setFiles(mergedOrder)
  }, [projectId])

  useEffect(() => {
    refresh().catch((e: unknown) => { console.error(e) })
  }, [refresh])

  // Auto-select character when navigated from foreshadow panel
  useEffect(() => {
    if (initialCharacter && files.includes(`${initialCharacter}.md`)) {
      setActiveFile(initialCharacter)
    }
  }, [initialCharacter, files])

  useEffect(() => {
    if (!activeFile) {
      setContent('')
      return
    }
    readProjectFile(projectId, CHARACTER_SUBDIR, `${activeFile}.md`)
      .then(setContent)
      .catch((e: unknown) => { console.error(e) })
  }, [projectId, activeFile])

  const handleSave = () => {
    if (!activeFile) return
    writeProjectFile(projectId, CHARACTER_SUBDIR, `${activeFile}.md`, content)
      .then(() => { setEditing(false) })
      .catch((e: unknown) => { console.error(e) })
  }

  const handleCreate = () => {
    if (!newName.trim()) return
    const name = newName.trim()
    if (files.includes(name)) return
    writeProjectFile(projectId, CHARACTER_SUBDIR, `${name}.md`, '')
      .then(() => {
        setNewName('')
        return refresh()
      })
      .then(async () => {
        // Append new char to end of order
        const updatedOrder = [...order, name]
        await saveOrder(updatedOrder)
        setOrder(updatedOrder)
        setFiles(updatedOrder)
        setActiveFile(name)
        setContent('')
        setEditing(true)
      })
      .catch((e: unknown) => { console.error(e) })
  }

  const handleDelete = (name: string) => {
    deleteProjectFile(projectId, CHARACTER_SUBDIR, `${name}.md`)
      .then(() => {
        if (activeFile === name) { setActiveFile(null); setContent('') }
        return refresh()
      })
      .then(async () => {
        const updatedOrder = order.filter((n) => n !== name)
        await saveOrder(updatedOrder)
        setOrder(updatedOrder)
        setFiles(updatedOrder)
      })
      .catch((e: unknown) => { console.error(e) })
  }

  const handleRandomName = () => {
    let name = randomName()
    // Avoid duplicates
    let tries = 0
    while (files.includes(name) && tries < 20) {
      name = randomName()
      tries++
    }
    setNewName(name)
  }

  const handleAICreate = async () => {
    setGenerating(true)
    setAiError(null)
    try {
      const config = await loadProviderConfig()
      const provider = config.providers.find(p => p.name === config.active_profile)
      if (!provider) throw new Error('未配置 AI Provider')
      if (!provider.models.analysis) throw new Error('未配置分析模型，请在 AI 配置中设置')

      // Read project info + worldview context
      let projectInfo = await buildAIContext(projectId)

      const defaultPromptObj = buildAIPrompt(newName, projectInfo)
      const system = editingPrompt.trim() || defaultPromptObj.system
      const user = editingPrompt.trim() ? projectInfo || '请生成角色卡' : defaultPromptObj.user

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
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.8,
          max_tokens: 2048,
        }),
      })
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
      const raw = data.choices?.[0]?.message?.content ?? ''
      if (!raw.trim()) throw new Error('AI 返回内容为空')

      // Extract character name from AI response
      const nameMatch = raw.match(/^角色[：:]\s*(.+)/m)
      const charName = nameMatch?.[1]?.trim() || newName.trim()
      if (!charName) throw new Error('未能确定角色名')

      // Check for duplicate
      if (files.includes(charName)) throw new Error(`角色「${charName}」已存在`)

      // Save directly
      await writeProjectFile(projectId, CHARACTER_SUBDIR, `${charName}.md`, raw.trim())
      setNewName('')
      await refresh()
      setActiveFile(charName)
      setContent(raw.trim())
      setEditing(true)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  const isNameDuplicate = newName.trim().length > 0 && files.includes(newName.trim())

  // ─── Drag-and-drop reorder (mouse events) ─────

  const dragItemRef = useRef<{ index: number; startY: number; currentY: number } | null>(null)
  const [dragPreview, setDragPreview] = useState<{ index: number; offset: number } | null>(null)

  const handleMouseDown = (e: React.MouseEvent, index: number) => {
    // Only drag from the grip icon (⠿)
    if (!(e.target as HTMLElement).closest('[data-drag-handle]')) return
    e.preventDefault()
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    dragItemRef.current = {
      index,
      startY: e.clientY,
      currentY: e.clientY,
    }
    setDragPreview({ index, offset: 0 })

    const handleMove = (ev: MouseEvent) => {
      if (!dragItemRef.current) return
      dragItemRef.current.currentY = ev.clientY
      const offset = ev.clientY - dragItemRef.current.startY
      setDragPreview({ index: dragItemRef.current.index, offset })

      // Calculate target position
      const itemHeight = rect.height
      const moveStep = Math.round(offset / itemHeight)
      const targetIndex = Math.max(0, Math.min(files.length - 1, dragItemRef.current.index + moveStep))
      
      if (targetIndex !== dragItemRef.current.index) {
        // Apply reorder using latest order from ref
        const newOrder = [...orderRef.current]
        const [moved] = newOrder.splice(dragItemRef.current.index, 1)
        if (moved) newOrder.splice(targetIndex, 0, moved)
        orderRef.current = newOrder
        setOrder(newOrder)
        setFiles(newOrder)
        dragItemRef.current.index = targetIndex
        dragItemRef.current.startY = dragItemRef.current.currentY
        setDragPreview({ index: targetIndex, offset: 0 })
      }
    }

    const handleUp = () => {
      if (dragItemRef.current) {
        saveOrder(orderRef.current).catch((e: unknown) => { console.error(e) })
      }
      dragItemRef.current = null
      setDragPreview(null)
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  // ─── Rewrite handlers ──────────────────────────

  const handleRewriteMode = (mode: RewriteMode) => {
    const sel = getTextareaSelection(rewriteTextareaRef.current, content)
    if (!sel) return
    setRewriteState({ ...sel, mode })
  }

  const handleRewriteAccept = (newText: string) => {
    if (!rewriteState) return
    setContent((prev) => applyTextareaRewrite(prev, rewriteState.start, rewriteState.end, newText))
    setRewriteState(null)
  }

  const menuItems: ContextMenuAction[] = contextMenu ? [
    { label: '✏️ AI 改写', onClick: () => handleRewriteMode('rewrite') },
    { label: '📝 AI 扩写', onClick: () => handleRewriteMode('expand') },
    { label: '✨ AI 润色', onClick: () => handleRewriteMode('polish') },
  ] : []

  return (
    <div className="panel-layout">
      <div className="panel-sidebar">
        <div className="panel-sidebar-header">
          <h3>角色</h3>
        </div>
        <div className="panel-new-item">
          <input
            value={newName}
            onChange={(e) => { setNewName(e.target.value) }}
            placeholder="角色名"
            onKeyDown={(e) => { if (e.key === 'Enter' && !generating) { handleCreate() } }}
          />
          <button className="btn-small" onClick={handleCreate} disabled={!newName.trim() || isNameDuplicate} title="创建空白角色卡">
            +
          </button>
        </div>
        <div className="panel-new-actions">
          <button className="btn-small" onClick={handleRandomName} title="随机起名">
            🎲 起名
          </button>
          <button
            className="btn-small btn-ai"
            onClick={() => { void handleAICreate() }}
            disabled={generating || (newName.trim().length > 0 && isNameDuplicate)}
            title="AI 生成完整角色卡"
          >
            {generating ? '⏳ 生成中' : '✨ AI 创建'}
          </button>
        </div>
        {aiError && (
          <div style={{ padding: '4px 8px', fontSize: '0.78rem', color: 'var(--danger)', background: 'var(--bg)' }}>
            {aiError}
          </div>
        )}
        {isNameDuplicate && (
          <div style={{ padding: '4px 8px', fontSize: '0.78rem', color: 'var(--text-muted)', background: 'var(--bg)' }}>
            该角色名已存在
          </div>
        )}
        <div className="panel-list">
          {files.map((f, idx) => (
            <div
              key={f}
              className={`panel-item${f === activeFile ? ' active' : ''}${dragPreview?.index === idx ? ' dragging' : ''}`}
              onClick={() => { setActiveFile(f); setEditing(false) }}
            >
              <span
                data-drag-handle
                style={{ cursor: 'grab', userSelect: 'none' }}
                onMouseDown={(e) => handleMouseDown(e, idx)}
              >⠿ {f}</span>
              <button className="btn-text" onClick={(e) => { e.stopPropagation(); handleDelete(f) }} style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>✕</button>
            </div>
          ))}
          {files.length === 0 && <p className="panel-empty">暂无角色</p>}
        </div>
      </div>
      <div className="panel-editor">
        {activeFile ? (
          <>
            <div className="panel-editor-header">
              <h3>{activeFile}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {editing && (
                  <>
                    <button
                      className="btn-text"
                      onClick={() => { void handleAICreate() }}
                      disabled={generating}
                      style={{ fontSize: '0.85rem' }}
                    >
                      {generating ? '⏳ 生成中…' : '✨ AI 辅助'}
                    </button>
                    <RewriteButtons
                      enabled={hasSelection}
                      loading={rewriteState !== null}
                      onRewrite={() => handleRewriteMode('rewrite')}
                      onExpand={() => handleRewriteMode('expand')}
                      onPolish={() => handleRewriteMode('polish')}
                    />
                    <button
                      className="btn-text"
                      onClick={async () => {
                        if (!showPrompt && !editingPrompt.trim()) {
                          let info = await buildAIContext(projectId)
                          const def = buildAIPrompt(newName, info)
                          setEditingPrompt(def.system + '\n\n---\n\n' + def.user)
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
                  <button className="btn-primary" onClick={() => { handleSave() }}>保存</button>
                ) : (
                  <button className="btn-secondary" onClick={() => { setEditing(true) }}>编辑</button>
                )}
              </div>
            </div>
            {showPrompt && editing && (
              <div className="prompt-editor">
                <div className="prompt-editor-header">
                  <span>提示词（AI 辅助使用，修改后自动保存到本项目的提示词库）</span>
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
            {editing ? (
              <div className="panel-editor-inner">
                <div className="sub-field" style={{ marginBottom: 0 }}>
                  <div className="sub-field-label-row">
                    <label className="sub-field-label">角色信息</label>
                    <button
                      className="btn-text"
                      style={{ fontSize: '0.78rem' }}
                      onClick={() => { setShowExample(!showExample) }}
                    >
                      {showExample ? '收起示例' : '📖 看示例'}
                    </button>
                  </div>
                  {showExample && (
                    <div className="sub-field-example">
                      <pre>{CHAR_EXAMPLE}</pre>
                    </div>
                  )}
                  <textarea
                    ref={rewriteTextareaRef}
                    className="sub-field-textarea"
                    style={{ minHeight: 350 }}
                    value={content}
                    onChange={(e) => { setContent(e.target.value) }}
                    onMouseUp={checkSelection}
                    onKeyUp={checkSelection}
                    onContextMenu={(e) => {
                      const ta = e.currentTarget as HTMLTextAreaElement
                      if (ta.selectionStart !== ta.selectionEnd) {
                        e.preventDefault()
                        setContextMenu({ x: e.clientX, y: e.clientY })
                      }
                    }}
                    placeholder={`角色：${activeFile}\n身份/职业：\n外貌特征：\n性格特点：\n背景经历：\n动机目标：\n说话风格：\n标签：[标签1, 标签2, ...]\n\n💡 每行填一项就行，不确定的可以空着，或者点 ✨ AI 辅助 一键生成`}
                  />
                </div>
              </div>
            ) : (
              <div className="panel-preview">{content || <span style={{ color: 'var(--text-muted)' }}>暂无内容，点击编辑填写角色信息</span>}</div>
            )}
          </>
        ) : (
          <div className="panel-placeholder">
            <p style={{ marginBottom: 8 }}>选择或创建角色</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              在左侧输入角色名，点击 🎲 起名 或 ✨ AI 创建
            </p>
          </div>
        )}
      </div>

      {rewriteState && (
        <RewritePreview
          selectedText={rewriteState.selectedText}
          beforeText={rewriteState.beforeText}
          afterText={rewriteState.afterText}
          defaultMode={rewriteState.mode}
          onAccept={handleRewriteAccept}
          onReject={() => setRewriteState(null)}
        />
      )}

      {contextMenu && (
        <SelectionContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
