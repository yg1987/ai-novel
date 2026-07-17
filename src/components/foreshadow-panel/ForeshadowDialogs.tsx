import type { ReactNode } from 'react'
import Button from '../Button'
import Modal from '../Modal'
import type { ForeshadowCategory, ForeshadowEntry } from '../../types/novel'
import type { ChapterMeta } from '../../types/chapter'
import {
  CATEGORY_LABELS,
  IMPORTANCE_OPTIONS,
  getChapterLabel,
  type ForeshadowFormData,
} from './foreshadowPanelUtils'

interface Props {
  showInspireModal: boolean
  inspireVolume: string
  volumes: string[]
  inspireError: string | null
  inspireLoading: boolean
  onInspireVolumeChange: (value: string) => void
  onCloseInspire: () => void
  onConfirmInspire: () => void | Promise<void>

  showForm: boolean
  editingId: string | null
  form: ForeshadowFormData
  showAdvanced: boolean
  showCharDropdown: boolean
  characterNames: string[]
  renderChapterSelect: (value: string, onChange: (value: string) => void) => ReactNode
  onFormChange: (form: ForeshadowFormData) => void
  onToggleAdvanced: () => void
  onToggleCharacter: (name: string) => void
  onToggleCharDropdown: () => void
  onCloseForm: () => void
  onSaveForm: () => void | Promise<void>

  advancePrompt: { entryId: string; desc: string } | null
  onAdvancePromptChange: (value: { entryId: string; desc: string }) => void
  onCloseAdvance: () => void
  onConfirmAdvance: () => void | Promise<void>

  deleteTarget: ForeshadowEntry | null
  chapters: ChapterMeta[]
  onCloseDelete: () => void
  onConfirmDelete: () => void | Promise<void>
}

export default function ForeshadowDialogs({
  showInspireModal,
  inspireVolume,
  volumes,
  inspireError,
  inspireLoading,
  onInspireVolumeChange,
  onCloseInspire,
  onConfirmInspire,
  showForm,
  editingId,
  form,
  showAdvanced,
  showCharDropdown,
  characterNames,
  renderChapterSelect,
  onFormChange,
  onToggleAdvanced,
  onToggleCharacter,
  onToggleCharDropdown,
  onCloseForm,
  onSaveForm,
  advancePrompt,
  onAdvancePromptChange,
  onCloseAdvance,
  onConfirmAdvance,
  deleteTarget,
  chapters,
  onCloseDelete,
  onConfirmDelete,
}: Props) {
  return (
    <>
      {showInspireModal && (
        <Modal>
          <div style={{ minWidth: 300 }}>
            <h3 style={{ marginBottom: 12 }}>AI 伏笔灵感分析</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 500 }}>分析范围</label>
              <select value={inspireVolume} onChange={(e) => onInspireVolumeChange(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: '0.85rem' }}>
                <option value="all">全篇（所有章节）</option>
                {volumes.map((volume) => (<option key={volume} value={volume}>{volume}</option>))}
              </select>
            </div>
            {inspireError && <div style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: 8, padding: '6px', background: 'var(--bg-sidebar)', borderRadius: 4 }}>{inspireError}</div>}
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>AI 将通读所选范围章节，分析伏笔缺口、可呼应元素和密度分布。</div>
            <div className="dialog-footer">
              <Button variant="text" size="sm" onClick={onCloseInspire}>取消</Button>
              <Button variant="primary" size="md" onClick={() => { void onConfirmInspire() }} disabled={inspireLoading}>{inspireLoading ? '⏳ 分析中…' : '开始分析'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {showForm && (
        <Modal className="foreshadow-form">
          <h3>{editingId ? '编辑伏笔' : '新增伏笔'}</h3>
          <div className="modal-scroll-body">
            <div className="form-group">
              <label>名称 *</label>
              <input value={form.name} onChange={(e) => onFormChange({ ...form, name: e.target.value })} placeholder="伏笔名称" maxLength={50} />
            </div>
            <div className="form-group">
              <label>描述 *</label>
              <textarea value={form.description} onChange={(e) => onFormChange({ ...form, description: e.target.value })} placeholder="详细描述这个伏笔" rows={3} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>分类</label>
                <select value={form.category} onChange={(e) => onFormChange({ ...form, category: e.target.value as ForeshadowCategory })}>
                  {(Object.entries(CATEGORY_LABELS) as [ForeshadowCategory, string][]).map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
                </select>
              </div>
              <div className="form-group">
                <label>重要度</label>
                <select value={form.importance} onChange={(e) => onFormChange({ ...form, importance: Number(e.target.value) })}>
                  {IMPORTANCE_OPTIONS.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>埋设章节</label>
              {renderChapterSelect(form.plantedChapterId, (value) => onFormChange({ ...form, plantedChapterId: value }))}
            </div>

            <div className="advanced-toggle" onClick={onToggleAdvanced}>
              <span className={`arrow${showAdvanced ? ' open' : ''}`}>▶</span>
              高级设置
              {(form.targetChapterId || form.resolutionPlan || form.relatedCharacters.length > 0 || form.notes) && (
                <span style={{ color: 'var(--accent)', marginLeft: 4 }}>（已填写）</span>
              )}
            </div>

            {showAdvanced && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label>计划回收章节</label>
                    {renderChapterSelect(form.targetChapterId, (value) => onFormChange({ ...form, targetChapterId: value }))}
                  </div>
                  <div className="form-group">
                    <label>回收方式</label>
                    <select value={form.resolutionPlan} onChange={(e) => onFormChange({ ...form, resolutionPlan: e.target.value })}>
                      <option value="">未设置</option>
                      <option value="揭示">揭示</option>
                      <option value="反转">反转</option>
                      <option value="呼应">呼应收束</option>
                      <option value="放弃">放弃</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>关联角色</label>
                  {characterNames.length === 0 ? (
                    <p className="form-hint">暂无角色记录，请在角色面板中创建</p>
                  ) : (
                    <>
                      <button type="button" className="character-dropdown-btn" onClick={onToggleCharDropdown}>
                        已选 {form.relatedCharacters.length} 个角色 ▾
                      </button>
                      {showCharDropdown && (
                        <div className="character-dropdown-panel">
                          {characterNames.map((name) => (
                            <label key={name} className="character-dropdown-item">
                              <input type="checkbox" checked={form.relatedCharacters.includes(name)} onChange={() => onToggleCharacter(name)} />
                              {name}
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="character-chips">
                        {form.relatedCharacters.map((name) => (
                          <span key={name} className="character-chip">{name} <button type="button" onClick={() => onToggleCharacter(name)}>×</button></span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="form-group">
                  <label>📋 推进轨迹</label>
                  <div className="clues-editor">
                    {form.clues.map((clue, index) => (
                      <div key={index} className="clue-row">
                        {renderChapterSelect(clue.chapterId, (value) => {
                          const next = [...form.clues]
                          next[index] = { ...next[index]!, chapterId: value }
                          onFormChange({ ...form, clues: next })
                        })}
                        <input value={clue.description} onChange={(e) => {
                          const next = [...form.clues]
                          next[index] = { ...next[index]!, description: e.target.value }
                          onFormChange({ ...form, clues: next })
                        }} placeholder="推进描述（如：在第5章通过对话暗示...）" />
                        <Button variant="text" size="sm" onClick={() => {
                          onFormChange({ ...form, clues: form.clues.filter((_, clueIndex) => clueIndex !== index) })
                        }}>删除</Button>
                      </div>
                    ))}
                    <Button variant="text" size="sm" onClick={() => {
                      onFormChange({ ...form, clues: [...form.clues, { chapterId: '', description: '', timestamp: new Date().toISOString() }] })
                    }}>+ 添加推进记录</Button>
                  </div>
                </div>
                <div className="form-group">
                  <label>备注</label>
                  <textarea value={form.notes} onChange={(e) => onFormChange({ ...form, notes: e.target.value })} placeholder="补充说明" rows={2} />
                </div>
              </>
            )}
          </div>
          <div className="dialog-footer">
            <Button variant="text" size="sm" onClick={onCloseForm}>取消</Button>
            <Button variant="primary" size="md" disabled={!form.name.trim() || !form.description.trim()} onClick={() => { void onSaveForm() }}>保存</Button>
          </div>
        </Modal>
      )}

      {advancePrompt && (
        <Modal className="foreshadow-advance-modal">
          <h3>推进伏笔</h3>
          <p>记录推进内容（可选）：</p>
          <textarea
            value={advancePrompt.desc}
            onChange={(e) => onAdvancePromptChange({ ...advancePrompt, desc: e.target.value })}
            placeholder="如：在第N章通过角色对话暗示..."
            rows={3}
            autoFocus
          />
          <div className="dialog-footer">
            <Button variant="text" size="sm" onClick={onCloseAdvance}>取消</Button>
            <Button variant="primary" size="md" onClick={() => { void onConfirmAdvance() }}>确认推进</Button>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal className="foreshadow-delete-modal">
          <h3>删除伏笔</h3>
          <p>
            确定删除「{deleteTarget.name}」？
            <br />
            <small>埋设于 {getChapterLabel(deleteTarget.plantedChapterId, chapters)}</small>
          </p>
          <div className="dialog-footer">
            <Button variant="text" size="sm" onClick={onCloseDelete}>取消</Button>
            <Button variant="danger" size="md" onClick={() => { void onConfirmDelete() }}>确定删除</Button>
          </div>
        </Modal>
      )}
    </>
  )
}
