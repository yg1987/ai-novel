import { useState, useEffect } from 'react'
import { readProjectFile, writeProjectFile } from '../api/tauri'

interface Props {
  projectId: string
}

interface SubField {
  key: string
  label: string
  hint: string
}

interface SectionDef {
  key: string
  label: string
  file: string
  subs: SubField[]
  hint: string
}

const SECTIONS: SectionDef[] = [
  {
    key: 'world',
    label: '世界背景',
    file: 'world.md',
    hint: '描述这个世界的基本设定，让读者对故事发生的世界有个大致印象',
    subs: [
      { key: '世界概况', label: '世界概况', hint: '这个世界是什么样子的？时代背景、地理格局、整体氛围' },
      { key: '历史事件', label: '历史事件', hint: '有哪些重要的历史事件？战争、灾难、传奇人物的陨落等' },
      { key: '特殊规则', label: '特殊规则', hint: '这个世界有哪些独有规则？修炼体系、自然法则、社会禁忌等' },
    ],
  },
  {
    key: 'forces',
    label: '势力组织',
    file: 'forces.md',
    hint: '列出故事中的主要势力，简单描述其立场和相互关系',
    subs: [
      { key: '势力列表', label: '势力列表', hint: '列出主要势力、宗派、家族，每行写一个，附一句话描述' },
    ],
  },
  {
    key: 'locations',
    label: '重要地点',
    file: 'locations.md',
    hint: '列出世界中的重要地点，简单描述其特点',
    subs: [],
  },
  {
    key: 'power-system',
    label: '力量体系',
    file: 'power-system.md',
    hint: '描述力量体系的核心规则',
    subs: [
      { key: '境界划分', label: '境界划分', hint: '修炼境界的等级名称和特征，从低到高排列' },
    ],
  },
  {
    key: 'timeline',
    label: '全局时间线',
    file: 'timeline.md',
    hint: '按时间顺序列出故事世界中的重要事件节点',
    subs: [],
  },
]

// ─── Examples ──────────────────────────────────────────

/** 可复制参考示例，按 sectionKey → subKey → 示例文本 */
const EXAMPLES: Record<string, Record<string, string>> = {
  world: {
    '世界概况': `这是一个以武道为尊的世界。凡人如蝼蚁，强者可断江搬山。
大陆分为东荒、南岭、西漠、北原、中州五域，修炼之风盛行。

→ 可以改成你自己的：修仙、魔法、星际、末日，随便什么类型都行，两三句话说明白就好。`,
    '历史事件': `三千年前，天帝斩落天外邪魔，肉身化作封印镇守天渊。
一千年前，玄天宗覆灭，镇宗至宝"玄天鉴"下落不明。
百年前，北原魔教崛起，五域格局大变。

→ 按时间顺序列 2-3 个重大事件就够了，不用太详细。`,
    '特殊规则': `修炼境界：淬体 → 开元 → 金丹 → 元婴 → 化神
魂力天生，无法通过修炼增长。
天渊封印每百年衰弱一次，届时邪魔余孽会冲击封印。

→ 有什么跟现实不一样的设定？列出来。`,
  },
  forces: {
    '势力列表': `玄天宗：正道之首，坐落于中州天玄峰，以剑修闻名，门规森严。
血煞教：北原魔教，擅长傀儡术，行事诡秘，近年势力扩张迅速。
天机阁：中立情报组织，遍布五域，阁主身份成谜。

→ 每行写一个势力，冒号后面跟一句话描述。`,
  },
  'power-system': {
    '境界划分': `淬体境：锤炼肉身，力能扛鼎。
开元境：开辟丹田，真气外放。
金丹境：凝聚金丹，寿元大增。
元婴境：元婴出窍，神识千里。
化神境：天人合一，掌控法则。

→ 从低到高排列，每行一个境界，附简短特征。`,
  },
  locations: {
    _default: `东荒：蛮荒之地，妖兽横行，资源贫瘠但机缘众多。
天渊秘境：上古战场遗迹，每百年开启一次，危机与机遇并存。
中州：大陆中心，灵气充沛，各大宗派云集之地。

→ 地名加冒号，跟一句话描述。`,
  },
  timeline: {
    _default: `纪元前 3000 年：天帝斩天外邪魔，封印天渊。
纪元前 1000 年：玄天宗覆灭，玄天鉴失踪。
纪元元年：天渊封印完成，纪元开启。
纪元 980 年：北原魔教崛起。

→ 按时间顺序，每行一个事件。`,
  },
}

// ─── Markdown helpers ───────────────────────────────────

/** Parse ## 小节 heading + content from Markdown */
function parseSubs(content: string, definedKeys: string[]): Record<string, string> {
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

  // Ensure all defined keys exist (even if empty)
  for (const k of definedKeys) {
    if (!(k in result)) result[k] = ''
  }

  return result
}

/** Build Markdown from section title and sub-field values */
function buildContent(title: string, subs: Record<string, string>): string {
  const parts = [`# ${title}`]
  for (const [key, text] of Object.entries(subs)) {
    parts.push('', `## ${key}`, '')
    if (text.trim()) {
      parts.push(text.trim())
    }
  }
  return parts.join('\n')
}

// ─── Component ──────────────────────────────────────────

export default function WorldviewPanel({ projectId }: Props) {
  const [activeSection, setActiveSection] = useState(SECTIONS[0]!)
  const [content, setContent] = useState('')
  const [subValues, setSubValues] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [showExample, setShowExample] = useState<string | null>(null)

  const hasSubs = activeSection.subs.length > 0
  const isFreeform = !hasSubs

  useEffect(() => {
    readProjectFile(projectId, 'worldview', activeSection.file)
      .then((c) => {
        setContent(c)
        setSubValues(parseSubs(c, activeSection.subs.map(s => s.key)))
        setDirty(false)
      })
      .catch(console.error)
  }, [projectId, activeSection])

  const handleSave = async () => {
    if (hasSubs) {
      const md = buildContent(activeSection.label, subValues)
      await writeProjectFile(projectId, 'worldview', activeSection.file, md)
    } else {
      await writeProjectFile(projectId, 'worldview', activeSection.file, content)
    }
    setEditing(false)
    setDirty(false)
  }

  const handleStartEdit = () => {
    setSubValues(parseSubs(content, activeSection.subs.map(s => s.key)))
    setEditing(true)
  }

  const updateSubField = (key: string, value: string) => {
    setSubValues(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const previewContent = hasSubs
    ? buildContent(activeSection.label, subValues)
    : content

  return (
    <div className="panel-layout">
      <div className="panel-sidebar">
        <div className="panel-sidebar-header">
          <h3>世界观</h3>
        </div>
        <div className="panel-list">
          {SECTIONS.map((s) => (
            <div
              key={s.key}
              className={`panel-item${s.key === activeSection.key ? ' active' : ''}`}
              onClick={() => { setActiveSection(s); setEditing(false) }}
            >
              {s.label}
            </div>
          ))}
        </div>
      </div>
      <div className="panel-editor">
        <div className="panel-editor-header">
          <h3>{activeSection.label}</h3>
          <div>
            {dirty && <span style={{ color: 'var(--danger)', fontSize: '0.85rem', marginRight: 8 }}>未保存</span>}
            {editing ? (
              <button className="btn-primary" onClick={() => { void handleSave() }}>保存</button>
            ) : (
              <button className="btn-secondary" onClick={handleStartEdit}>编辑</button>
            )}
          </div>
        </div>
        {editing ? (
          isFreeform ? (
            <div className="panel-editor-inner">
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                💡 {activeSection.hint}
              </p>
              <div className="sub-field">
                <div className="sub-field-label-row">
                  <label className="sub-field-label">{activeSection.label}</label>
                  {(() => {
                    const ex = EXAMPLES[activeSection.key]?._default
                    const showThis = showExample === '__freeform__'
                    return ex ? (
                      <button
                        className="btn-text"
                        style={{ fontSize: '0.78rem' }}
                        onClick={() => { setShowExample(showThis ? null : '__freeform__') }}
                      >
                        {showThis ? '收起示例' : '📖 看示例'}
                      </button>
                    ) : null
                  })()}
                </div>
                {showExample === '__freeform__' && (() => {
                  const ex = EXAMPLES[activeSection.key]?._default
                  return ex ? (
                    <div className="sub-field-example">
                      <pre>{ex}</pre>
                    </div>
                  ) : null
                })()}
                <textarea
                  className="sub-field-textarea"
                  style={{ minHeight: 300 }}
                  value={content}
                  onChange={(e) => { setContent(e.target.value); setDirty(true) }}
                  placeholder={activeSection.hint + '…'}
                />
              </div>
            </div>
          ) : (
            <div className="panel-editor-inner">
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                💡 {activeSection.hint}
              </p>
              {activeSection.subs.map((sub) => {
                const example = EXAMPLES[activeSection.key]?.[sub.key]
                const showThis = showExample === sub.key
                return (
                  <div key={sub.key} className="sub-field">
                    <div className="sub-field-label-row">
                      <label className="sub-field-label">{sub.label}</label>
                      {example && (
                        <button
                          className="btn-text"
                          style={{ fontSize: '0.78rem' }}
                          onClick={() => { setShowExample(showThis ? null : sub.key) }}
                        >
                          {showThis ? '收起示例' : '📖 看示例'}
                        </button>
                      )}
                    </div>
                    <span className="sub-field-hint">{sub.hint}</span>
                    {showThis && (
                      <div className="sub-field-example">
                        <pre>{example}</pre>
                      </div>
                    )}
                    <textarea
                      className="sub-field-textarea"
                      value={subValues[sub.key] ?? ''}
                      onChange={(e) => { updateSubField(sub.key, e.target.value) }}
                      placeholder="在这里填写…"
                    />
                  </div>
                )
              })}
            </div>
          )
        ) : (
          <div className="panel-preview">
            {previewContent.trim() || (
              <span style={{ color: 'var(--text-muted)' }}>
                暂无内容，点击编辑添加
                {activeSection.subs.length > 0 && '（可填写 ' + activeSection.subs.map(s => s.label).join('、') + '）'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
