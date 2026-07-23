import { forwardRef, useState, useEffect, useCallback, useImperativeHandle, useRef } from 'react'
import { listProjectFiles, readProjectFile, writeProjectFile, deleteProjectFile, loadProviderConfig } from '../api/tauri'
import { loadPrompt, savePrompt, resetPrompt } from '../services/aiPrompts'
import { buildAIContext } from '../services/aiContext'
import { hasDuplicateCharacterName, normalizeCharacterName, validateCharacterName } from '../services/characterNames'
import { parseCharacterGender, randomCharacterName, setCharacterGender, type CharacterGender } from '../services/characterProfiles'
import type { TextareaSelection } from '../services/rewriteUtils'
import { getTextareaSelection, applyTextareaRewrite } from '../services/rewriteUtils'
import { type RewriteMode } from '../services/rewriteService'
import Button from './Button'
import Modal from './Modal'
import RewritePreview from './RewritePreview'
import SelectionContextMenu, { type ContextMenuAction } from './SelectionContextMenu'
import CharacterSidebar from './character-panel/CharacterSidebar'
import CharacterEditor from './character-panel/CharacterEditor'
import CharacterUnsavedChangesDialog from './character-panel/CharacterUnsavedChangesDialog'
import './CharacterPanel.css'

interface Props {
  projectId: string
  initialCharacter?: string | null
}

export interface CharacterPanelHandle {
  hasUnsavedChanges: () => boolean
  saveChanges: () => Promise<boolean>
  discardChanges: () => void
}

const CHARACTER_SUBDIR = 'characters'
const ORDER_FILE = 'order.json'

const CHAR_EXAMPLE = `角色：林烬
性别：男
身份/职业：玄天宗外门弟子，后觉醒太古剑魂
外貌特征：黑发黑瞳，身形清瘦，左眉有一道细疤
性格特点：沉默寡言但重情义，遇强则强，不畏权势
背景经历：自幼父母双亡，被玄天宗收养。入门十二年仍在淬体境徘徊，遭同门轻视。意外获得太古剑魂传承后命运转折。
动机目标：寻找父母死因真相，最终成为剑道至尊
说话风格：话少，常用短句。愤怒时语气冰冷
标签：["剑修", "孤儿", "逆袭", "天选之子"]`

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
性别：[男/女]
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

function buildAICompletionPrompt(name: string, content: string, projectInfo: string): { system: string; user: string } {
  return {
    system: `你是一个网文角色设定助手。请在不改变角色核心身份和已有有效设定的前提下，补全并优化角色卡。

请严格按以下格式输出完整角色卡，不要加额外说明：

角色：${name}
身份/职业：
外貌特征：
性格特点：
背景经历：
动机目标：
说话风格：
标签：[标签1, 标签2, ...]

要求：
- 保留已有的具体设定，缺失字段才补全
- 角色要符合小说类型，性格有优点也有缺点
- 不要替换角色名或凭空推翻已有内容`,
    user: `${projectInfo ? `项目信息：\n${projectInfo}\n\n` : ''}当前角色：${name}\n\n现有角色卡：\n${content || '（尚未填写，请从头生成）'}`,
  }
}

// ─── Component ───────────────────────────────────────

type PromptMode = 'create' | 'complete'
type PendingAction = { type: 'select'; name: string } | { type: 'delete'; name: string }
type AIDraft = { mode: PromptMode; name: string; content: string }

const promptKeys: Record<PromptMode, string> = {
  create: 'character_create',
  complete: 'character_complete',
}

const CharacterPanel = forwardRef<CharacterPanelHandle, Props>(({ projectId, initialCharacter }, ref) => {
  const [files, setFiles] = useState<string[]>([])
  const [order, setOrder] = useState<string[]>([])
  const orderRef = useRef<string[]>([])
  useEffect(() => { orderRef.current = order }, [order])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [newName, setNewName] = useState('')
  const [newGender, setNewGender] = useState<CharacterGender>('未知')
  const [genderFilter, setGenderFilter] = useState<CharacterGender | '全部'>('全部')
  const [genderByFile, setGenderByFile] = useState<Record<string, CharacterGender>>({})
  const [showExample, setShowExample] = useState(false)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingName, setDeletingName] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [promptMode, setPromptMode] = useState<PromptMode>('complete')
  const [prompts, setPrompts] = useState<Record<PromptMode, string>>({ create: '', complete: '' })
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [rewriteState, setRewriteState] = useState<(TextareaSelection & { mode: RewriteMode }) | null>(null)
  const [hasSelection, setHasSelection] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [showUnsavedChanges, setShowUnsavedChanges] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [aiDraft, setAiDraft] = useState<AIDraft | null>(null)
  const rewriteTextareaRef = useRef<HTMLTextAreaElement>(null)
  const loadRequestRef = useRef(0)
  const editAfterLoadRef = useRef<string | null>(null)
  const checkSelection = useCallback(() => {
    const ta = rewriteTextareaRef.current
    if (ta) setHasSelection(ta.selectionStart !== ta.selectionEnd)
  }, [])

  const dirty = content !== savedContent
  const editingPrompt = prompts[promptMode]

  useEffect(() => {
    void Promise.all([loadPrompt(projectId, promptKeys.create), loadPrompt(projectId, promptKeys.complete)])
      .then(([create, complete]) => {
        setPrompts({ create: create ?? '', complete: complete ?? '' })
        setShowPrompt(false)
      })
      .catch(() => {})
  }, [projectId])

  const saveOrder = useCallback(async (names: string[]) => {
    await writeProjectFile(projectId, CHARACTER_SUBDIR, ORDER_FILE, JSON.stringify(names, null, 2))
  }, [projectId])

  const refresh = useCallback(async () => {
    const entries = await listProjectFiles(projectId, CHARACTER_SUBDIR)
    const charNames = entries
      .filter((e) => e.name.endsWith('.md'))
      .map((e) => e.name.replace(/\.md$/i, ''))
    const genders = await Promise.all(charNames.map(async (name) => {
      const card = await readProjectFile(projectId, CHARACTER_SUBDIR, `${name}.md`).catch(() => '')
      return [name, parseCharacterGender(card)] as const
    }))
    setGenderByFile(Object.fromEntries(genders))

    let currentOrder: string[] = []
    try {
      const raw = await readProjectFile(projectId, CHARACTER_SUBDIR, ORDER_FILE)
      if (raw.trim()) {
        const parsed: unknown = JSON.parse(raw)
        currentOrder = Array.isArray(parsed)
          ? parsed.filter((item): item is string => typeof item === 'string')
          : []
      }
    } catch { /* order.json missing or malformed */ }

    const seen = new Set<string>()
    const validOrder = currentOrder.filter((name) => {
      const key = name.toLocaleLowerCase()
      if (!charNames.includes(name) || seen.has(key)) return false
      seen.add(key)
      return true
    })
    const newChars = charNames.filter((n) => !currentOrder.includes(n))
    const mergedOrder = [...validOrder, ...newChars]

    // Persist if order changed (new/deleted chars)
    if (mergedOrder.length !== currentOrder.length || validOrder.length !== currentOrder.length) {
      await writeProjectFile(projectId, CHARACTER_SUBDIR, ORDER_FILE, JSON.stringify(mergedOrder, null, 2))
    }

    setOrder(mergedOrder)
    setFiles(mergedOrder)
    if (initialCharacter && mergedOrder.includes(initialCharacter)) {
      setActiveFile(initialCharacter)
    }
  }, [initialCharacter, projectId])

  useEffect(() => {
    refresh().catch((e: unknown) => { setError(e instanceof Error ? e.message : String(e)) })
  }, [refresh])

  useEffect(() => {
    if (!activeFile) return
    const requestId = ++loadRequestRef.current
    setLoading(true)
    void readProjectFile(projectId, CHARACTER_SUBDIR, `${activeFile}.md`)
      .then((nextContent) => {
        if (requestId !== loadRequestRef.current) return
        const shouldEdit = editAfterLoadRef.current === activeFile
        if (shouldEdit) editAfterLoadRef.current = null
        const normalizedContent = setCharacterGender(nextContent, parseCharacterGender(nextContent))
        setContent(normalizedContent)
        setSavedContent(normalizedContent)
        setEditing(shouldEdit)
      })
      .catch((e: unknown) => {
        if (requestId === loadRequestRef.current) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (requestId === loadRequestRef.current) setLoading(false)
      })
  }, [projectId, activeFile])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!activeFile) return false
    setSaving(true)
    setError(null)
    try {
      await writeProjectFile(projectId, CHARACTER_SUBDIR, `${activeFile}.md`, content)
      setSavedContent(content)
      setEditing(false)
      setNotice('角色卡已保存')
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setSaving(false)
    }
  }, [activeFile, content, projectId])

  const discardChanges = useCallback(() => {
    setContent(savedContent)
    setEditing(false)
    setHasSelection(false)
  }, [savedContent])

  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => dirty,
    saveChanges: handleSave,
    discardChanges,
  }), [dirty, handleSave, discardChanges])

  const selectFile = (name: string) => {
    setActiveFile(name)
    setEditing(false)
    setShowExample(false)
    setError(null)
    setNotice(null)
  }

  const requestSelect = (name: string) => {
    if (name === activeFile) return
    if (dirty) {
      setPendingAction({ type: 'select', name })
      setShowUnsavedChanges(true)
      return
    }
    selectFile(name)
  }

  const continuePendingAction = () => {
    const action = pendingAction
    setPendingAction(null)
    setShowUnsavedChanges(false)
    if (!action) return
    if (action.type === 'select') selectFile(action.name)
    else setDeleteTarget(action.name)
  }

  const handleCreate = async () => {
    const name = normalizeCharacterName(newName)
    const validationError = validateCharacterName(name)
    if (validationError) { setError(validationError); return }
    if (hasDuplicateCharacterName(files, name)) { setError('该角色名已存在'); return }
    setCreating(true)
    setError(null)
    try {
      const initialContent = `角色：${name}\n性别：${newGender}\n`
      await writeProjectFile(projectId, CHARACTER_SUBDIR, `${name}.md`, initialContent)
      await refresh()
      setNewName('')
      editAfterLoadRef.current = name
      setActiveFile(name)
      setContent(initialContent)
      setSavedContent(initialContent)
      setEditing(true)
      setNotice(`已创建角色「${name}」`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  const requestDelete = (name: string) => {
    if (name === activeFile && dirty) {
      setPendingAction({ type: 'delete', name })
      setShowUnsavedChanges(true)
      return
    }
    setDeleteTarget(name)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const name = deleteTarget
    setDeletingName(name)
    setError(null)
    try {
      await deleteProjectFile(projectId, CHARACTER_SUBDIR, `${name}.md`)
      if (activeFile === name) {
        setActiveFile(null)
        setContent('')
        setSavedContent('')
        setEditing(false)
      }
      await refresh()
      setNotice(`已删除角色「${name}」`)
      setDeleteTarget(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeletingName(null)
    }
  }

  const handleRandomName = () => {
    let generated = randomCharacterName()
    let tries = 0
    while (hasDuplicateCharacterName(files, generated.name) && tries < 100) {
      generated = randomCharacterName()
      tries++
    }
    setNewName(generated.name)
    setNewGender(generated.gender)
  }

  const requestAI = async (system: string, user: string): Promise<string> => {
    const config = await loadProviderConfig()
    const provider = config.providers.find(p => p.name === config.active_profile)
    if (!provider) throw new Error('未配置 AI Provider')
    if (!provider.models.analysis) throw new Error('未配置分析模型，请在 AI 配置中设置')

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
    return raw.trim()
  }

  const handleAICreate = async () => {
    const requestedName = normalizeCharacterName(newName)
    const validationError = requestedName ? validateCharacterName(requestedName) : null
    if (validationError) { setError(validationError); return }
    if (requestedName && hasDuplicateCharacterName(files, requestedName)) { setError('该角色名已存在'); return }
    setGenerating(true)
    setError(null)
    try {
      const projectInfo = await buildAIContext(projectId)
      const defaultPrompt = buildAIPrompt(requestedName, projectInfo)
      const raw = await requestAI(
        prompts.create.trim() || defaultPrompt.system,
        prompts.create.trim() ? `${projectInfo}\n\n${requestedName ? `角色名：${requestedName}` : '请为角色起一个合适的名字'}` : defaultPrompt.user,
      )
      const nameMatch = raw.match(/^角色[：:]\s*(.+)/m)
      const charName = normalizeCharacterName(nameMatch?.[1] ?? requestedName)
      if (!charName) throw new Error('未能确定角色名')
      const generatedNameError = validateCharacterName(charName)
      if (generatedNameError) throw new Error(generatedNameError)
      if (hasDuplicateCharacterName(files, charName)) throw new Error(`角色「${charName}」已存在`)
      setAiDraft({ mode: 'create', name: charName, content: raw })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  const handleAIComplete = async () => {
    if (!activeFile) return
    setGenerating(true)
    setError(null)
    try {
      const projectInfo = await buildAIContext(projectId)
      const defaultPrompt = buildAICompletionPrompt(activeFile, content, projectInfo)
      const raw = await requestAI(
        prompts.complete.trim() || defaultPrompt.system,
        prompts.complete.trim() ? `${projectInfo}\n\n当前角色：${activeFile}\n\n现有角色卡：\n${content || '（尚未填写，请从头生成）'}` : defaultPrompt.user,
      )
      setAiDraft({ mode: 'complete', name: activeFile, content: raw })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  const acceptAIDraft = async () => {
    if (!aiDraft) return
    if (aiDraft.mode === 'complete') {
      setContent(aiDraft.content)
      setEditing(true)
      setAiDraft(null)
      setNotice('已将 AI 补全内容放入编辑器，请确认后保存')
      return
    }

    if (hasDuplicateCharacterName(files, aiDraft.name)) {
      setError(`角色「${aiDraft.name}」已存在`)
      return
    }
    setCreating(true)
    setError(null)
    try {
      await writeProjectFile(projectId, CHARACTER_SUBDIR, `${aiDraft.name}.md`, aiDraft.content)
      await refresh()
      setNewName('')
      setActiveFile(aiDraft.name)
      setContent(aiDraft.content)
      setSavedContent(aiDraft.content)
      setEditing(false)
      setAiDraft(null)
      setNotice(`已创建角色「${aiDraft.name}」`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  const isNameDuplicate = newName.trim().length > 0 && hasDuplicateCharacterName(files, newName)
  const visibleFiles = genderFilter === '全部' ? files : files.filter((name) => genderByFile[name] === genderFilter)
  const genderCounts = files.reduce<Record<CharacterGender, number>>((counts, name) => {
    counts[genderByFile[name] ?? '未知']++
    return counts
  }, { 男: 0, 女: 0, 未知: 0 })

  const dragItemRef = useRef<{ index: number; startY: number; currentY: number } | null>(null)
  const [dragPreview, setDragPreview] = useState<{ index: number; offset: number } | null>(null)

  const handleMouseDown = (e: React.MouseEvent, index: number) => {
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

      const itemHeight = rect.height
      const moveStep = Math.round(offset / itemHeight)
      const targetIndex = Math.max(0, Math.min(files.length - 1, dragItemRef.current.index + moveStep))
      
      if (targetIndex !== dragItemRef.current.index) {
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
        void saveOrder(orderRef.current)
          .then(() => setNotice('角色排序已保存'))
          .catch((e: unknown) => {
            setError(e instanceof Error ? e.message : String(e))
            void refresh().catch((refreshError: unknown) => setError(refreshError instanceof Error ? refreshError.message : String(refreshError)))
          })
      }
      dragItemRef.current = null
      setDragPreview(null)
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

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
      <CharacterSidebar
        files={visibleFiles}
        genderByFile={genderByFile}
        genderCounts={genderCounts}
        genderFilter={genderFilter}
        onGenderFilterChange={setGenderFilter}
        activeFile={activeFile}
        newName={newName}
        creating={creating}
        generating={generating}
        deletingName={deletingName}
        error={error}
        notice={notice}
        isNameDuplicate={isNameDuplicate}
        dragPreview={dragPreview}
        onNewNameChange={setNewName}
        onCreate={() => { void handleCreate() }}
        onRandomName={handleRandomName}
        onAICreate={() => { void handleAICreate() }}
        onSelect={requestSelect}
        onDelete={requestDelete}
        onDragStart={(event, index) => { if (genderFilter === '全部') handleMouseDown(event, index) }}
      />
      <CharacterEditor
        activeFile={activeFile}
        content={content}
        gender={parseCharacterGender(content)}
        editing={editing}
        loading={loading}
        saving={saving}
        generating={generating}
        hasSelection={hasSelection}
        rewriteLoading={rewriteState !== null}
        showPrompt={showPrompt}
        promptMode={promptMode}
        editingPrompt={editingPrompt}
        savingPrompt={savingPrompt}
        showExample={showExample}
        example={CHAR_EXAMPLE}
        textareaRef={rewriteTextareaRef}
        onContentChange={setContent}
        onGenderChange={(gender) => setContent((previous) => setCharacterGender(previous, gender))}
        onEdit={() => { setEditing(true) }}
        onSave={() => { void handleSave() }}
        onAIComplete={() => { void handleAIComplete() }}
        onRewrite={() => handleRewriteMode('rewrite')}
        onExpand={() => handleRewriteMode('expand')}
        onPolish={() => handleRewriteMode('polish')}
        onTogglePrompt={() => setShowPrompt(!showPrompt)}
        onPromptModeChange={setPromptMode}
        onPromptChange={(value) => setPrompts((prev) => ({ ...prev, [promptMode]: value }))}
        onResetPrompt={() => {
          setSavingPrompt(true)
          void resetPrompt(projectId, promptKeys[promptMode])
            .then(() => {
              setPrompts((prev) => ({ ...prev, [promptMode]: '' }))
              setNotice('已恢复默认提示词')
            })
            .catch((promptError: unknown) => setError(promptError instanceof Error ? promptError.message : String(promptError)))
            .finally(() => setSavingPrompt(false))
        }}
        onSavePrompt={() => {
          setSavingPrompt(true)
          void savePrompt(projectId, promptKeys[promptMode], editingPrompt)
            .then(() => setNotice('提示词已保存'))
            .catch((promptError: unknown) => setError(promptError instanceof Error ? promptError.message : String(promptError)))
            .finally(() => setSavingPrompt(false))
        }}
        onToggleExample={() => { setShowExample(!showExample) }}
        onSelectionCheck={checkSelection}
        onSelectionContextMenu={(e) => {
          const ta = e.currentTarget
          if (ta.selectionStart !== ta.selectionEnd) {
            e.preventDefault()
            setContextMenu({ x: e.clientX, y: e.clientY })
          }
        }}
      />

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
      {showUnsavedChanges && (
        <CharacterUnsavedChangesDialog
          saving={saving}
          onSave={() => { void handleSave().then((saved) => { if (saved) continuePendingAction() }) }}
          onDiscard={() => { discardChanges(); continuePendingAction() }}
          onCancel={() => { setPendingAction(null); setShowUnsavedChanges(false) }}
        />
      )}
      {deleteTarget && (
        <Modal className="confirm-dialog" onRequestClose={deletingName ? undefined : () => setDeleteTarget(null)}>
          <h2>删除角色</h2>
          <p style={{ margin: '12px 0', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            确定删除角色「{deleteTarget}」吗？角色卡将从当前项目中移除，无法恢复。
          </p>
          <div className="dialog-footer">
            <Button variant="secondary" size="md" disabled={deletingName !== null} onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="danger" size="md" loading={deletingName !== null} disabled={deletingName !== null} onClick={() => { void handleDelete() }}>删除角色</Button>
          </div>
        </Modal>
      )}
      {aiDraft && (
        <Modal className="confirm-dialog" onRequestClose={creating ? undefined : () => setAiDraft(null)}>
          <h2>{aiDraft.mode === 'create' ? `创建角色「${aiDraft.name}」` : `AI 补全「${aiDraft.name}」`}</h2>
          <p style={{ margin: '12px 0', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            {aiDraft.mode === 'create' ? '请确认生成内容。确认后才会创建角色卡。' : '请确认生成内容。确认后会替换编辑器内容，但不会自动保存。'}
          </p>
          <textarea className="prompt-editor-textarea" readOnly value={aiDraft.content} style={{ minHeight: 280 }} />
          <div className="dialog-footer" style={{ marginTop: 14 }}>
            <Button variant="secondary" size="md" disabled={creating} onClick={() => setAiDraft(null)}>取消</Button>
            <Button variant="primary" size="md" loading={creating} disabled={creating} onClick={() => { void acceptAIDraft() }}>
              {aiDraft.mode === 'create' ? '创建角色' : '应用到编辑器'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
})

export default CharacterPanel
