import { useState, useEffect } from 'react'
import type { ReviewRules, BannedWordRule, ConsistencyThresholds, ReviewDimensionConfig } from '../services/reviewRules'
import { loadReviewRules, saveReviewRules, writeDefaultReviewRules } from '../services/reviewRules'

interface Props {
  projectId: string
  onClose: () => void
  onSaved: () => void
}

type TabId = 'banned' | 'thresholds' | 'dimensions'

const TABS: { id: TabId; label: string }[] = [
  { id: 'banned', label: '禁用词' },
  { id: 'thresholds', label: '一致性阈值' },
  { id: 'dimensions', label: '审查维度' },
]

const SEVERITY_LABELS: Record<number, string> = {
  1: '轻微', 2: '轻度', 3: '中度', 4: '重度', 5: '极重',
}

const SEVERITY_COLORS: Record<number, string> = {
  1: '#27ae60',
  2: '#2980b9',
  3: '#e67e22',
  4: '#e74c3c',
  5: '#8b1a1a',
}

const THRESHOLD_FIELDS: {
  key: keyof ConsistencyThresholds
  label: string
  desc: string
}[] = [
  { key: 'dormantForeshadowWarn', label: '伏笔沉寂警告(章)', desc: '伏笔沉寂超过 N 章时触发警告' },
  { key: 'dormantForeshadowAlert', label: '伏笔沉寂警报(章)', desc: '伏笔沉寂超过 N 章时触发警报' },
  { key: 'dormantForeshadowCritical', label: '伏笔沉寂严重(章)', desc: '伏笔沉寂超过 N 章时标记为严重' },
  { key: 'overdueHighImportance', label: '高优先级超期(章)', desc: '重要伏笔超过 N 章未回收' },
  { key: 'overdueDefault', label: '默认超期(章)', desc: '普通伏笔超过 N 章未回收' },
]

function emptyBannedRule(): BannedWordRule {
  return { pattern: '', severity: 1, label: '', suggestion: '' }
}

function emptyDimension(): ReviewDimensionConfig {
  return { id: '', label: '', description: '' }
}

const inputStyle: React.CSSProperties = {
  padding: '5px 8px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-card)',
  color: 'var(--text)',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
  outline: 'none',
  width: '100%',
}

const inputSmallStyle: React.CSSProperties = {
  ...inputStyle,
  width: 72,
  textAlign: 'center',
  padding: '5px 4px',
}

export default function ReviewRulesEditor({ projectId, onClose, onSaved }: Props) {
  const [rules, setRules] = useState<ReviewRules | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('banned')
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    loadReviewRules(projectId).then(setRules).catch(console.error)
  }, [projectId])

  if (!rules) return null

  const busy = saving || resetting

  // ─── Banned words handlers ──────────────────────
  const updateBannedRule = (index: number, field: keyof BannedWordRule, value: string | number) => {
    setRules((prev) => {
      if (!prev) return prev
      const words = [...prev.bannedWords]
      words[index] = { ...words[index], [field]: value }
      return { ...prev, bannedWords: words }
    })
  }

  const addBannedRule = () => {
    setRules((prev) => prev ? { ...prev, bannedWords: [...prev.bannedWords, emptyBannedRule()] } : prev)
  }

  const removeBannedRule = (index: number) => {
    setRules((prev) => prev ? { ...prev, bannedWords: prev.bannedWords.filter((_, i) => i !== index) } : prev)
  }

  // ─── Thresholds handlers ────────────────────────
  const updateThreshold = (key: keyof ConsistencyThresholds, value: number) => {
    setRules((prev) => prev ? {
      ...prev,
      consistency: { ...prev.consistency, [key]: value },
    } : prev)
  }

  // ─── Dimensions handlers ────────────────────────
  const updateDimension = (index: number, field: keyof ReviewDimensionConfig, value: string) => {
    setRules((prev) => {
      if (!prev) return prev
      const dims = [...prev.reviewDimensions]
      dims[index] = { ...dims[index], [field]: value }
      return { ...prev, reviewDimensions: dims }
    })
  }

  const addDimension = () => {
    setRules((prev) => prev ? { ...prev, reviewDimensions: [...prev.reviewDimensions, emptyDimension()] } : prev)
  }

  const removeDimension = (index: number) => {
    setRules((prev) => prev ? { ...prev, reviewDimensions: prev.reviewDimensions.filter((_, i) => i !== index) } : prev)
  }

  // ─── Save / Reset ───────────────────────────────
  const handleSave = async () => {
    if (!rules) return
    setSaving(true)
    try {
      await saveReviewRules(projectId, rules)
      onSaved()
      onClose()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setResetting(true)
    try {
      await writeDefaultReviewRules(projectId)
      const fresh = await loadReviewRules(projectId)
      setRules(fresh)
    } catch (e) {
      console.error(e)
    } finally {
      setResetting(false)
    }
  }

  // ─── Tab content renderers ──────────────────────
  const renderBannedTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rules!.bannedWords.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '20px 0', textAlign: 'center' }}>
          暂无禁用词规则
        </p>
      )}
      {rules!.bannedWords.map((rule, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 10px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-card)',
          }}
        >
          {/* Severity badge + select */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <select
              value={rule.severity}
              onChange={(e) => updateBannedRule(i, 'severity', Number(e.target.value))}
              disabled={busy}
              style={{
                ...inputSmallStyle,
                appearance: 'none',
                cursor: 'pointer',
                color: 'transparent',
                caretColor: 'transparent',
              }}
              title={SEVERITY_LABELS[rule.severity]}
            >
              {[1, 2, 3, 4, 5].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <span
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                fontSize: '0.72rem',
                fontWeight: 600,
                color: SEVERITY_COLORS[rule.severity] ?? '#999',
                background: SEVERITY_COLORS[rule.severity] ?? '#999',
                color: '#fff',
                borderRadius: 10,
                padding: '1px 7px',
                lineHeight: '16px',
                whiteSpace: 'nowrap',
              }}
            >
              {rule.severity}
            </span>
          </div>

          {/* Pattern */}
          <input
            type="text"
            value={rule.pattern}
            onChange={(e) => updateBannedRule(i, 'pattern', e.target.value)}
            placeholder="正则表达式"
            disabled={busy}
            style={{ ...inputStyle, flex: 2, fontFamily: 'monospace', fontSize: '0.8rem' }}
          />

          {/* Label */}
          <input
            type="text"
            value={rule.label}
            onChange={(e) => updateBannedRule(i, 'label', e.target.value)}
            placeholder="标签"
            disabled={busy}
            style={{ ...inputStyle, flex: 1.2 }}
          />

          {/* Suggestion */}
          <input
            type="text"
            value={rule.suggestion ?? ''}
            onChange={(e) => updateBannedRule(i, 'suggestion', e.target.value)}
            placeholder="建议（可选）"
            disabled={busy}
            style={{ ...inputStyle, flex: 1.2 }}
          />

          {/* Delete */}
          <button
            className="btn-icon"
            onClick={() => removeBannedRule(i)}
            disabled={busy}
            title="删除"
            style={{ flexShrink: 0, color: 'var(--danger)', padding: '2px 6px', fontSize: '1rem' }}
          >
            ✕
          </button>
        </div>
      ))}

      <button
        className="btn-text"
        onClick={addBannedRule}
        disabled={busy}
        style={{ alignSelf: 'flex-start', marginTop: 4 }}
      >
        ＋ 添加规则
      </button>
    </div>
  )

  const renderThresholdsTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {THRESHOLD_FIELDS.map(({ key, label, desc }) => (
        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text)' }}>
            {label}
          </label>
          <input
            type="number"
            min={1}
            max={50}
            value={rules!.consistency[key]}
            onChange={(e) => updateThreshold(key, Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            disabled={busy}
            style={{ ...inputStyle, width: 120 }}
          />
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {desc}
          </span>
        </div>
      ))}
    </div>
  )

  const renderDimensionsTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rules!.reviewDimensions.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '20px 0', textAlign: 'center' }}>
          暂无审查维度
        </p>
      )}
      {rules!.reviewDimensions.map((dim, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '10px 12px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="text"
              value={dim.id}
              onChange={(e) => updateDimension(i, 'id', e.target.value)}
              placeholder="ID"
              disabled={busy}
              style={{ ...inputStyle, flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }}
            />
            <input
              type="text"
              value={dim.label}
              onChange={(e) => updateDimension(i, 'label', e.target.value)}
              placeholder="名称"
              disabled={busy}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              className="btn-icon"
              onClick={() => removeDimension(i)}
              disabled={busy}
              title="删除"
              style={{ flexShrink: 0, color: 'var(--danger)', padding: '2px 6px', fontSize: '1rem' }}
            >
              ✕
            </button>
          </div>
          <input
            type="text"
            value={dim.description}
            onChange={(e) => updateDimension(i, 'description', e.target.value)}
            placeholder="描述"
            disabled={busy}
            style={inputStyle}
          />
        </div>
      ))}

      <button
        className="btn-text"
        onClick={addDimension}
        disabled={busy}
        style={{ alignSelf: 'flex-start', marginTop: 4 }}
      >
        ＋ 添加维度
      </button>
    </div>
  )

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius)',
          padding: 0,
          maxWidth: 680,
          width: '90vw',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px 0',
            flexShrink: 0,
          }}
        >
          <h2 style={{ fontSize: '1.15rem', margin: 0 }}>⚙ 审查规则配置</h2>
          <button
            className="btn-text"
            onClick={onClose}
            disabled={busy}
            style={{ fontSize: '1.1rem', color: 'var(--text-muted)', padding: '2px 6px' }}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 0,
            padding: '0 20px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
            marginTop: 12,
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.id
                  ? '2px solid var(--accent)'
                  : '2px solid transparent',
                padding: '8px 14px',
                fontSize: '0.88rem',
                fontFamily: 'inherit',
                cursor: 'pointer',
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: activeTab === tab.id ? 600 : 400,
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            minHeight: 0,
          }}
        >
          {activeTab === 'banned' && renderBannedTab()}
          {activeTab === 'thresholds' && renderThresholdsTab()}
          {activeTab === 'dimensions' && renderDimensionsTab()}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            flexShrink: 0,
            background: 'var(--bg-sidebar)',
          }}
        >
          <button
            className="btn-secondary"
            onClick={handleReset}
            disabled={busy}
          >
            {resetting ? '恢复中…' : '恢复默认'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-secondary"
              onClick={onClose}
              disabled={busy}
            >
              取消
            </button>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={busy}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
