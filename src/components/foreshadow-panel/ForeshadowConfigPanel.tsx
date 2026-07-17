import Button from '../Button'
import { DEFAULT_FORESHADOW_CONFIG, type ForeshadowConfig } from '../../types/novel'

interface Props {
  configForm: ForeshadowConfig
  savedConfig: ForeshadowConfig
  onChange: (config: ForeshadowConfig) => void
  onCancel: () => void
  onSave: () => void
}

export default function ForeshadowConfigPanel({ configForm, savedConfig, onChange, onCancel, onSave }: Props) {
  return (
    <div className="foreshadow-config-panel">
      <div className="form-group">
        <label>沉寂阈值（章）</label>
        <input type="number" min={5} max={50} step={1} value={configForm.dormantThreshold} onChange={(e) => onChange({ ...configForm, dormantThreshold: Number(e.target.value) })} />
        <div className="config-hint">多少章无活动视为沉寂</div>
      </div>
      <div className="form-group">
        <label>近期预警窗口（章）</label>
        <input type="number" min={3} max={30} step={1} value={configForm.upcomingWindow} onChange={(e) => onChange({ ...configForm, upcomingWindow: Number(e.target.value) })} />
        <div className="config-hint">未来多少章内视为即将到期</div>
      </div>
      <div className="form-group">
        <label>密度警告阈值</label>
        <input type="number" min={0.1} max={1.0} step={0.05} value={configForm.densityWarningThreshold} onChange={(e) => onChange({ ...configForm, densityWarningThreshold: Number(e.target.value) })} />
        <div className="config-hint">活跃伏笔/总章节超过此值显示警告</div>
      </div>
      <div className="form-group">
        <label>密度偏低阈值</label>
        <input type="number" min={0.01} max={0.2} step={0.01} value={configForm.densityLowThreshold} onChange={(e) => onChange({ ...configForm, densityLowThreshold: Number(e.target.value) })} />
        <div className="config-hint">低于此值建议增加伏笔（仅&gt;20章时）</div>
      </div>
      <div className="foreshadow-config-actions">
        <Button variant="secondary" size="sm" onClick={() => onChange(DEFAULT_FORESHADOW_CONFIG)}>恢复默认</Button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={() => { onChange(savedConfig); onCancel() }}>取消</Button>
          <Button variant="primary" size="sm" onClick={onSave}>保存</Button>
        </div>
      </div>
    </div>
  )
}
