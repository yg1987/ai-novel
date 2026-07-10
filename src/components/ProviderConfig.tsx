import { useEffect, useState } from 'react'
import type { ProviderConfig, ProviderEntry } from '../types/provider'
import { loadProviderConfig, saveProviderConfig } from '../api/tauri'

interface Props {
  onClose: () => void
}

const DEFAULT_MODELS = {
  writing: '',
  analysis: '',
  review: '',
  embedding: '',
}

export default function ProviderConfigPanel({ onClose }: Props) {
  const [config, setConfig] = useState<ProviderConfig | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadProviderConfig()
      .then(setConfig)
      .catch((e: unknown) => { console.error('Failed to load config:', e) })
  }, [])

  const updateProvider = (index: number, field: string, value: string) => {
    setConfig((prev) => {
      if (!prev) return prev
      const providers = [...prev.providers]
      const entry = { ...providers[index] }
      ;(entry as Record<string, string>)[field] = value
      providers[index] = entry as ProviderEntry
      return { ...prev, providers }
    })
  }

  const updateModel = (index: number, field: string, value: string) => {
    setConfig((prev) => {
      if (!prev) return prev
      const providers = [...prev.providers]
      const entry = { ...providers[index] }
      const models = { ...entry.models }
      ;(models as Record<string, string>)[field] = value
      entry.models = models as typeof entry.models
      providers[index] = entry as ProviderEntry
      return { ...prev, providers }
    })
  }

  const addProvider = () => {
    setConfig((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        providers: [...prev.providers, { name: '', base_url: '', api_key: '', models: { ...DEFAULT_MODELS } }],
      }
    })
  }

  const removeProvider = (index: number) => {
    setConfig((prev) => {
      if (!prev) return prev
      const providers = prev.providers.filter((_, i) => i !== index)
      return { ...prev, providers }
    })
  }

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    try {
      await saveProviderConfig(config)
      onClose()
    } catch (e) {
      console.error('Failed to save config:', e)
    } finally {
      setSaving(false)
    }
  }

  if (!config) {
    return <div className="dialog-overlay"><div className="dialog">加载中…</div></div>
  }

  return (
    <div className="dialog-overlay">
      <div className="dialog dialog-wide" onClick={(e) => { e.stopPropagation() }}>
        <div className="dialog-header">
          <h2>AI Provider 配置</h2>
          <button className="btn-text" onClick={onClose}>✕</button>
        </div>

        <div className="provider-list">
          {config.providers.map((p, i) => (
            <ProviderForm
              key={i}
              entry={p}
              isActive={config.active_profile === p.name}
              onChange={(field, value) => { updateProvider(i, field, value) }}
              onModelChange={(field, value) => { updateModel(i, field, value) }}
              onSetActive={() => { setConfig((prev) => prev ? { ...prev, active_profile: p.name } : prev) }}
              onRemove={() => { removeProvider(i) }}
            />
          ))}
        </div>

        <button className="btn-secondary" onClick={addProvider} style={{ marginTop: 12 }}>
          + 添加 Provider
        </button>

        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={() => { void handleSave() }} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProviderForm({
  entry,
  isActive,
  onChange,
  onModelChange,
  onSetActive,
  onRemove,
}: {
  entry: ProviderEntry
  isActive: boolean
  onChange: (field: string, value: string) => void
  onModelChange: (field: string, value: string) => void
  onSetActive: () => void
  onRemove: () => void
}) {
  const [models, setModels] = useState<string[] | null>(null)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [customFields, setCustomFields] = useState<Set<string>>(new Set())

  const canFetch = entry.base_url.trim().length > 0 && entry.api_key.trim().length > 0

  const fetchModels = async () => {
    if (!canFetch) return
    setFetching(true)
    setFetchError(null)
    try {
      const base = entry.base_url.replace(/\/+$/, '')
      const headers = { Authorization: `Bearer ${entry.api_key}` }

      // Try /models first, fall back to /v1/models
      let resp = await fetch(`${base}/models`, { headers })
      if (!resp.ok) {
        resp = await fetch(`${base}/v1/models`, { headers })
      }
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
      }

      const json = await resp.json() as { data?: Array<{ id: string }> }
      const ids = (json.data ?? []).map(m => m.id).filter(Boolean)
      if (ids.length === 0) {
        throw new Error('未找到可用模型')
      }
      setModels(ids)
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e))
    } finally {
      setFetching(false)
    }
  }

  const renderModelField = (field: keyof typeof entry.models, label: string, placeholder: string) => {
    const value = entry.models[field]
    const showSelect = models !== null && !customFields.has(field)

    return (
      <div className="provider-field">
        <label>{label}</label>
        {showSelect ? (
          <select
            value={models.includes(value) ? value : '__custom__'}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                setCustomFields(prev => new Set(prev).add(field))
              } else {
                onModelChange(field, e.target.value)
              }
            }}
          >
            {!models.includes(value) && value && (
              <option value={value}>{value}（当前）</option>
            )}
            {models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
            <option value="__custom__">✏ 手动输入</option>
          </select>
        ) : (
          <div className="model-input-row">
            <input
              value={value}
              onChange={(e) => { onModelChange(field, e.target.value) }}
              placeholder={placeholder}
            />
            {models && (
              <button
                className="btn-text"
                onClick={() => setCustomFields(prev => { const n = new Set(prev); n.delete(field); return n })}
                title="从列表选择"
              >
                选择
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="provider-form">
      <div className="provider-form-header">
        <input
          className="provider-name-input"
          value={entry.name}
          onChange={(e) => { onChange('name', e.target.value) }}
          placeholder="Provider 名称"
        />
        <div className="provider-form-actions">
          {isActive ? (
            <span className="active-badge">当前</span>
          ) : (
            <button className="btn-text" onClick={onSetActive}>设为默认</button>
          )}
          <button className="btn-text" onClick={onRemove} style={{ color: 'var(--danger)' }}>删除</button>
        </div>
      </div>
      <div className="provider-field">
        <label>API 地址</label>
        <input value={entry.base_url} onChange={(e) => { onChange('base_url', e.target.value) }} placeholder="https://api.openai.com/v1" />
      </div>
      <div className="provider-field">
        <label>API Key</label>
        <input type="password" value={entry.api_key} onChange={(e) => { onChange('api_key', e.target.value) }} placeholder="sk-..." />
      </div>

      <div className="fetch-models-row">
        <button className="fetch-models-btn" onClick={fetchModels} disabled={fetching || !canFetch}>
          {fetching ? '获取中…' : '🔍 获取模型列表'}
        </button>
        {models && !fetchError && (
          <span className="fetch-models-info ok">已获取 {models.length} 个模型</span>
        )}
      </div>
      {fetchError && (
        <div className="fetch-models-info err" style={{ marginBottom: 6 }}>获取失败: {fetchError}</div>
      )}
      {models && models.length > 0 && (
        <div className="fetch-models-detail">
          {models.map(m => (
            <span key={m} title="点击复制模型名">{m}</span>
          ))}
        </div>
      )}

      <div className="provider-models">
        {renderModelField('writing', '写作模型', 'gpt-4o')}
        {renderModelField('analysis', '分析模型', 'gpt-4o-mini')}
        {renderModelField('review', '审查模型', 'gpt-4o-mini')}
        {renderModelField('embedding', 'Embedding', 'text-embedding-3-small')}
      </div>
    </div>
  )
}
