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
    <div className="dialog-overlay" onClick={onClose}>
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
      <div className="provider-models">
        <div className="provider-field">
          <label>写作模型</label>
          <input value={entry.models.writing} onChange={(e) => { onModelChange('writing', e.target.value) }} placeholder="gpt-4o" />
        </div>
        <div className="provider-field">
          <label>分析模型</label>
          <input value={entry.models.analysis} onChange={(e) => { onModelChange('analysis', e.target.value) }} placeholder="gpt-4o-mini" />
        </div>
        <div className="provider-field">
          <label>审查模型</label>
          <input value={entry.models.review} onChange={(e) => { onModelChange('review', e.target.value) }} placeholder="gpt-4o-mini" />
        </div>
        <div className="provider-field">
          <label>Embedding</label>
          <input value={entry.models.embedding} onChange={(e) => { onModelChange('embedding', e.target.value) }} placeholder="text-embedding-3-small" />
        </div>
      </div>
    </div>
  )
}
