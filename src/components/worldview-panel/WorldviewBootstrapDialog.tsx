import { useState } from 'react'
import Button from '../Button'
import Modal from '../Modal'

export type WorldviewBootstrapSource = 'outline' | 'characters' | 'foreshadows' | 'worldview'

interface SourceOption {
  key: WorldviewBootstrapSource
  label: string
  description: string
}

const SOURCE_OPTIONS: SourceOption[] = [
  { key: 'outline', label: '大纲', description: '帮助设定服务于后续剧情和冲突。' },
  { key: 'characters', label: '主要角色', description: '让世界规则、势力和地点与人物动机贴合。' },
  { key: 'foreshadows', label: '未回收伏笔', description: '避免首版设定和已埋线索冲突。' },
  { key: 'worldview', label: '已有世界观', description: '补全空白内容，不自动覆盖已有设定。' },
]

interface Props {
  generating: boolean
  error: string | null
  onGenerate: (sources: WorldviewBootstrapSource[], direction: string) => void
  onClose: () => void
}

export default function WorldviewBootstrapDialog({ generating, error, onGenerate, onClose }: Props) {
  const [sources, setSources] = useState<WorldviewBootstrapSource[]>(SOURCE_OPTIONS.map((option) => option.key))
  const [direction, setDirection] = useState('')

  const toggle = (source: WorldviewBootstrapSource) => {
    setSources((previous) => previous.includes(source)
      ? previous.filter((item) => item !== source)
      : [...previous, source])
  }

  return (
    <Modal className="worldview-bootstrap-modal" onRequestClose={generating ? undefined : onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 'min(700px, 84vh)' }}>
        <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>生成世界观草案</h2>
          <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            项目名称、类型和简介会始终作为基础输入。下面资料仅在存在时参与生成；未找到时不会阻止你继续。
          </p>
        </div>

        <div style={{ overflowY: 'auto', padding: '16px 24px', minHeight: 0 }}>
          <strong style={{ fontSize: '0.9rem' }}>可选参考资料</strong>
          {SOURCE_OPTIONS.map((option) => (
            <label key={option.key} style={{ display: 'flex', gap: 10, padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <input type="checkbox" checked={sources.includes(option.key)} onChange={() => { toggle(option.key) }} />
              <span>
                <strong>{option.label}</strong>
                <span style={{ display: 'block', marginTop: 3, color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.5 }}>{option.description}</span>
              </span>
            </label>
          ))}

          <label style={{ display: 'block', marginTop: 18 }}>
            <strong style={{ fontSize: '0.9rem' }}>本次创作方向（可选）</strong>
            <span style={{ display: 'block', marginTop: 4, color: 'var(--text-muted)', fontSize: '0.82rem' }}>项目简介为空时，可在这里补充一句想写的故事方向。</span>
            <textarea
              className="notes-input"
              style={{ width: '100%', minHeight: 100, marginTop: 8, resize: 'vertical', lineHeight: 1.6 }}
              value={direction}
              onChange={(event) => { setDirection(event.target.value) }}
              placeholder="例如：一个失去魔法的少年，必须穿越五座城邦找回被封印的记忆。"
            />
          </label>
          {error && <p style={{ margin: '12px 0 0', color: 'var(--danger)', lineHeight: 1.5 }}>AI 辅助不可用：{error}。你仍可继续手工编辑。</p>}
        </div>

        <div className="dialog-footer" style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <Button variant="secondary" size="md" disabled={generating} onClick={onClose}>取消</Button>
          <Button variant="primary" size="md" loading={generating} onClick={() => { onGenerate(sources, direction) }}>
            {generating ? '生成中…' : '生成草案'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
