import { useState, useEffect, useCallback } from 'react'
import { open } from '@tauri-apps/plugin-shell'
import {
  loadSettings,
  saveSettings,
  type AppSettings,
  SETTINGS_REGISTRY,
  getSettingDefault,
  type SettingDef,
} from '../services/settings'
import Button from './Button'
import Modal from './Modal'
import {
  checkForUpdate,
  getCurrentAppVersion,
  RELEASES_URL,
  REPOSITORY_URL,
  type UpdateCheckResult,
} from '../services/updateCheck'

interface Props {
  visible: boolean
  onClose: () => void
}

export default function SettingsModal({ visible, onClose }: Props) {
  const [values, setValues] = useState<Record<string, number | string | boolean>>({})
  const [originals, setOriginals] = useState<Record<string, number | string | boolean>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'general' | 'about'>('general')
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const [checkingForUpdate, setCheckingForUpdate] = useState(false)
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null)
  const [aboutError, setAboutError] = useState<string | null>(null)

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

    void getCurrentAppVersion()
      .then((version) => { setCurrentVersion(version) })
      .catch(() => { setCurrentVersion(null) })
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

  const handleOpenExternal = (url: string) => {
    setAboutError(null)
    void open(url).catch(() => { setAboutError('无法打开系统默认浏览器，请复制链接后重试。') })
  }

  const handleCheckForUpdate = async () => {
    setCheckingForUpdate(true)
    setUpdateResult(null)
    try {
      const result = await checkForUpdate()
      setUpdateResult(result)
    } catch {
      setUpdateResult({ status: 'error', message: '检查更新时发生未知错误，请稍后重试。' })
    } finally {
      setCheckingForUpdate(false)
    }
  }

  const hasChanges = SETTINGS_REGISTRY.some((def) => values[def.key] !== originals[def.key])

  if (!visible) return null

  return (
    <Modal className="settings-modal" onRequestClose={handleCancel}>
      <div className="settings-dialog">
        <div className="dialog-header">
          <h2>🛠 系统设置</h2>
        </div>

        <div className="settings-tabs" role="tablist" aria-label="系统设置分区">
          <button
            type="button"
            className={`settings-tab${activeTab === 'general' ? ' active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'general'}
            onClick={() => { setActiveTab('general') }}
          >
            通用
          </button>
          <button
            type="button"
            className={`settings-tab${activeTab === 'about' ? ' active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'about'}
            onClick={() => { setActiveTab('about') }}
          >
            关于
          </button>
        </div>

        {activeTab === 'general' && <div className="settings-tab-panel" role="tabpanel">
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
        </div>}

        {activeTab === 'about' && <div className="settings-tab-panel about-panel" role="tabpanel">
          <p className="about-intro">查看版本信息与更新状态。</p>

          <section className="about-summary" aria-label="应用信息">
            <div>
              <h3>AI Novel Writer</h3>
              <p>版本 {currentVersion ? `v${currentVersion}` : '读取中…'}</p>
            </div>
            <div className="about-actions">
              <button type="button" className="about-link-button" onClick={() => { handleOpenExternal(REPOSITORY_URL) }}>↗ GitHub</button>
              <button type="button" className="about-link-button" onClick={() => { handleOpenExternal(RELEASES_URL) }}>↗ 更新日志</button>
              <Button variant="primary" size="sm" onClick={() => { void handleCheckForUpdate() }} disabled={checkingForUpdate}>
                {checkingForUpdate ? '检查中…' : '检查更新'}
              </Button>
            </div>
          </section>

          {aboutError && <p className="about-status error" role="status">{aboutError}</p>}
          {updateResult && <UpdateResultView result={updateResult} onDownload={() => { handleOpenExternal(updateResult.status === 'update-available' ? updateResult.release.releaseUrl : RELEASES_URL) }} />}

          <div className="about-meta">
            <p>开发者：yg1987</p>
            <p>Copyright (c) 2026 yg1987 · MIT License</p>
          </div>
        </div>}
      </div>
    </Modal>
  )
}

function UpdateResultView({ result, onDownload }: { result: UpdateCheckResult; onDownload: () => void }) {
  if (result.status === 'update-available') {
    const publishedAt = new Date(result.release.publishedAt).toLocaleDateString('zh-CN')
    return (
      <section className="update-result available" aria-live="polite">
        <strong>发现新版本 v{result.release.version}</strong>
        <p>{result.release.name ?? 'AI Novel Writer 更新'} · 发布于 {publishedAt}</p>
        {result.release.notes && <pre className="update-notes">{result.release.notes}</pre>}
        <Button variant="primary" size="sm" onClick={onDownload}>前往下载</Button>
      </section>
    )
  }

  const className = result.status === 'up-to-date' ? 'current' : 'error'
  const message = result.status === 'up-to-date' ? '当前已是最新版本。' : result.message
  return <p className={`about-status ${className}`} role="status">{message}</p>
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
