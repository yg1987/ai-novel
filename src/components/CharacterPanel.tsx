import { useState, useEffect, useCallback } from 'react'
import { listProjectFiles, readProjectFile, writeProjectFile, deleteProjectFile, loadProviderConfig } from '../api/tauri'

interface Props {
  projectId: string
}

const CHARACTER_SUBDIR = 'characters'

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

export default function CharacterPanel({ projectId }: Props) {
  const [files, setFiles] = useState<string[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [newName, setNewName] = useState('')
  const [showExample, setShowExample] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const entries = await listProjectFiles(projectId, CHARACTER_SUBDIR)
    setFiles(entries.map((e) => e.name.replace(/\.md$/i, '')))
  }, [projectId])

  useEffect(() => {
    refresh().catch((e: unknown) => { console.error(e) })
  }, [refresh])

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
      .then(() => {
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

      // Read project info
      let projectInfo = ''
      try {
        const metaRaw = await readProjectFile(projectId, '', 'project.json')
        const meta = JSON.parse(metaRaw) as { name?: string; genre?: string; description?: string }
        projectInfo = `小说名称：${meta.name ?? ''}\n类型：${meta.genre ?? ''}\n简介：${meta.description ?? ''}`
      } catch { /* ignore */ }

      const { system, user } = buildAIPrompt(newName, projectInfo)

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
          {files.map((f) => (
            <div key={f} className={`panel-item${f === activeFile ? ' active' : ''}`}>
              <span onClick={() => { setActiveFile(f); setEditing(false) }}>{f}</span>
              <button className="btn-text" onClick={() => { handleDelete(f) }} style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>✕</button>
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
                  <button
                    className="btn-text"
                    onClick={() => { void handleAICreate() }}
                    disabled={generating}
                    style={{ fontSize: '0.85rem' }}
                  >
                    {generating ? '⏳ 生成中…' : '✨ AI 辅助'}
                  </button>
                )}
                {editing ? (
                  <button className="btn-primary" onClick={() => { handleSave() }}>保存</button>
                ) : (
                  <button className="btn-secondary" onClick={() => { setEditing(true) }}>编辑</button>
                )}
              </div>
            </div>
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
                    className="sub-field-textarea"
                    style={{ minHeight: 350 }}
                    value={content}
                    onChange={(e) => { setContent(e.target.value) }}
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
    </div>
  )
}
