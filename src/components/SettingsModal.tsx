import { useState, useEffect, useCallback } from 'react'
import {
  loadSettings,
  saveSettings,
  type AppSettings,
  SETTINGS_REGISTRY,
  getSettingDefault,
  type SettingDef,
} from '../services/settings'
import Button from './Button'

interface Props {
  visible: boolean
  onClose: () => void
}

export default function SettingsModal({ visible, onClose }: Props) {
  const [values, setValues] = useState<Record<string, number | string | boolean>>({})
  const [originals, setOriginals] = useState<Record<string, number | string | boolean>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load all registered settings on open
  useEffect(() => {
    if (!visible) return
    loadSettings()
      .then((saved) => {
        const resolved: Record<string, number | string | boolean> = {}
        for (const def of SETTINGS_REGISTRY) {
          const savedVal = (saved as unknown as Record<string, unknown>)[def.key]
          resolved[def.key] = savedVal != null ? (savedVal as string | number | boolean) : def.default
        }
        setValues(resolved)
        setOriginals({ ...resolved })
        setError(null)
      })
      .catch((e: unknown) => { setError(String(e)) })
  }, [visible])

  const update = useCallback((key: string, value: number | string | boolean) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveSettings(values as unknown as AppSettings)
      setOriginals({ ...values })
      onClose()
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setValues({ ...originals })
    onClose()
  }

  const hasChanges = SETTINGS_REGISTRY.some((def) => values[def.key] !== originals[def.key])

  if (!visible) return null

  return (
    <div className="dialog-overlay">
      <div className="dialog" onClick={(e) => { e.stopPropagation() }}>
        <div className="dialog-header">
          <h2>🛠 系统设置</h2>
          <Button variant="ghost" size="sm" onClick={handleCancel}>✕</Button>
        </div>

        {error && (
          <div style={{ padding: '8px 12px', marginBottom: 16, background: 'var(--bg-card)', borderLeft: '3px solid var(--danger)', color: 'var(--danger)', fontSize: '0.85rem', borderRadius: 4 }}>
            {error}
          </div>
        )}

        {SETTINGS_REGISTRY.map((def) => (
          <SettingField
            key={def.key}
            def={def}
            value={values[def.key] ?? getSettingDefault(def.key)}
            onChange={(v) => { update(def.key, v) }}
          />
        ))}

        <div className="dialog-footer">
          <Button variant="secondary" size="md" onClick={handleCancel} disabled={saving}>取消</Button>
          <Button variant="primary" size="md" onClick={() => { void handleSave() }} disabled={saving || !hasChanges}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Setting field renderer ──────────────────────────────

function SettingField({
  def,
  value,
  onChange,
}: {
  def: SettingDef
  value: number | string | boolean
  onChange: (v: number | string | boolean) => void
}) {
  return (
    <div className="form-field">
      <label>{def.label}</label>
      <p className="setting-description">{def.description}</p>

      {def.type === 'boolean' ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => { onChange(e.target.checked) }}
          />
          <span style={{ fontSize: '0.85rem' }}>{def.label}</span>
        </label>
      ) : def.type === 'select' && def.options ? (
        <select
          value={String(value)}
          onChange={(e) => { onChange(e.target.value) }}
        >
          {def.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type={def.type === 'number' ? 'number' : 'text'}
            style={{ width: def.suffix ? 120 : '100%' }}
            value={String(value)}
            min={def.min}
            max={def.max}
            step={def.step}
            onChange={(e) => {
              if (def.type === 'number') {
                const n = parseInt(e.target.value, 10)
                if (!isNaN(n)) {
                  const clamped = def.min != null && n < def.min ? def.min
                    : def.max != null && n > def.max ? def.max
                    : n
                  onChange(clamped)
                }
              } else {
                onChange(e.target.value)
              }
            }}
          />
          {def.suffix && (
            <span className="setting-suffix">{def.suffix}</span>
          )}
        </div>
      )}
    </div>
  )
}
