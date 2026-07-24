import { useState, type RefObject } from 'react'
import RewriteButtons from '../RewriteButtons'
import Button from '../Button'
import type { CharacterGender } from '../../services/characterProfiles'
import { diagnoseCharacterMarkdown, parseCharacterMarkdown, type CharacterMarkdownField } from '../../services/characterMarkdown'
import { characterNameKey } from '../../services/characterNames'
import type { ChapterMeta } from '../../types/chapter'
import type { ChapterRef } from '../../types/chapter'
import type { CharacterAffiliation, CharacterModuleConfig, OrganizationRecord } from '../../types/character'
import OrganizationManager from '../OrganizationManager'
import AffiliationEditor from './AffiliationEditor'
import CharacterConnectionsView from './CharacterConnectionsView'

interface Props {
  projectId: string
  activeFile: string | null
  characterId?: string
  content: string
  gender: CharacterGender
  editing: boolean
  loading: boolean
  saving: boolean
  generating: boolean
  hasSelection: boolean
  rewriteLoading: boolean
  showPrompt: boolean
  promptMode: 'create' | 'complete'
  editingPrompt: string
  savingPrompt: boolean
  showExample: boolean
  example: string
  config: CharacterModuleConfig
  organizations: OrganizationRecord[]
  affiliations: CharacterAffiliation[]
  chapters: ChapterMeta[]
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onContentChange: (content: string) => void
  onGenderChange: (gender: CharacterGender) => void
  onStructuredFieldChange: (field: CharacterMarkdownField, value: string | string[]) => void
  onOrganizationToggle: (organization: OrganizationRecord, selected: boolean) => void
  onAffiliationsChange: (affiliations: CharacterAffiliation[]) => void
  onOrganizationsChange: (organizations: OrganizationRecord[]) => void
  onOrganizationCreated: (organization: OrganizationRecord) => void
  onNavigateToCharacter?: (characterId: string) => void
  onNavigateToOrganization?: (organizationId: string) => void
  onNavigateToChapter?: (reference: ChapterRef) => void
  onNavigateToForeshadow?: (id: string) => void
  onEdit: () => void
  onSave: () => void
  onAIComplete: () => void
  onRewrite: () => void
  onExpand: () => void
  onPolish: () => void
  onTogglePrompt: () => void
  onPromptModeChange: (mode: 'create' | 'complete') => void
  onPromptChange: (prompt: string) => void
  onResetPrompt: () => void
  onSavePrompt: () => void
  onToggleExample: () => void
  onSelectionCheck: () => void
  onSelectionContextMenu: (event: React.MouseEvent<HTMLTextAreaElement>) => void
}

export default function CharacterEditor({
  projectId,
  activeFile,
  characterId,
  content,
  gender,
  editing,
  loading,
  saving,
  generating,
  hasSelection,
  rewriteLoading,
  showPrompt,
  promptMode,
  editingPrompt,
  savingPrompt,
  showExample,
  example,
  config,
  organizations,
  affiliations,
  chapters,
  textareaRef,
  onContentChange,
  onGenderChange,
  onStructuredFieldChange,
  onOrganizationToggle,
  onAffiliationsChange,
  onOrganizationsChange,
  onOrganizationCreated,
  onNavigateToCharacter,
  onNavigateToOrganization,
  onNavigateToChapter,
  onNavigateToForeshadow,
  onEdit,
  onSave,
  onAIComplete,
  onRewrite,
  onExpand,
  onPolish,
  onTogglePrompt,
  onPromptModeChange,
  onPromptChange,
  onResetPrompt,
  onSavePrompt,
  onToggleExample,
  onSelectionCheck,
  onSelectionContextMenu,
}: Props) {
  const [showOrganizationManager, setShowOrganizationManager] = useState(false)
  const [detailView, setDetailView] = useState<'card' | 'profile' | 'relationships' | 'connections'>('card')
  const [organizationQuery, setOrganizationQuery] = useState('')
  const projection = parseCharacterMarkdown(content)
  const diagnostics = diagnoseCharacterMarkdown(content, config, organizations)
  const diagnosticMessages = [
    diagnostics.duplicateFields.length > 0 ? `存在重复标准字段：${diagnostics.duplicateFields.join('、')}。请在正文中只保留一处。` : '',
    diagnostics.invalidStance ? `立场“${diagnostics.invalidStance}”不在当前项目预设中。` : '',
    diagnostics.invalidStatus ? `角色状态“${diagnostics.invalidStatus}”不在当前项目预设中。` : '',
    diagnostics.unknownOrganizations.length > 0 ? `未确认组织：${diagnostics.unknownOrganizations.join('、')}。保存时需要先确认创建。` : '',
  ].filter(Boolean)
  const selectedStance = config.stances.find((item) => item.id === projection.stance || item.label === projection.stance)?.label ?? projection.stance
  const selectedStatus = config.statuses.find((item) => item.id === projection.status || item.label === projection.status)?.label ?? projection.status
  const normalizedOrganizationQuery = characterNameKey(organizationQuery.trim())
  const visibleOrganizations = normalizedOrganizationQuery
    ? organizations.filter((organization) => [organization.name, ...organization.aliases].some((name) => characterNameKey(name).includes(normalizedOrganizationQuery)))
    : organizations

  return (
    <div className="panel-editor">
      {activeFile ? (
        <>
          <div className="panel-editor-header">
            <h3>{activeFile}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {editing && (
                <>
                  <Button variant="text" size="sm" onClick={onAIComplete} disabled={generating || loading || saving} loading={generating}>
                    {generating ? '生成中…' : '✨ AI 补全'}
                  </Button>
                  <RewriteButtons enabled={hasSelection} loading={rewriteLoading} onRewrite={onRewrite} onExpand={onExpand} onPolish={onPolish} />
                  <Button variant="text" size="sm" onClick={onTogglePrompt}>
                    {showPrompt ? '关闭提示词' : '✎ 提示词'}
                  </Button>
                </>
              )}
              {editing ? (
                <Button variant="primary" size="md" onClick={onSave} disabled={loading || saving} loading={saving}>保存</Button>
              ) : (
                <Button variant="secondary" size="md" onClick={onEdit} disabled={loading}>编辑</Button>
              )}
            </div>
          </div>
          {showPrompt && editing && (
            <div className="prompt-editor">
              <div className="prompt-editor-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>提示词（修改后保存到本项目的提示词库）</span>
                  <Button variant={promptMode === 'create' ? 'secondary' : 'text'} size="xs" onClick={() => onPromptModeChange('create')}>创建角色</Button>
                  <Button variant={promptMode === 'complete' ? 'secondary' : 'text'} size="xs" onClick={() => onPromptModeChange('complete')}>补全角色</Button>
                </div>
                <Button variant="text" size="sm" onClick={onResetPrompt}>恢复默认</Button>
              </div>
              <textarea
                className="prompt-editor-textarea"
                value={editingPrompt}
                onChange={(e) => { onPromptChange(e.target.value) }}
                placeholder="在此编写自定义提示词…"
              />
              <div className="prompt-editor-footer">
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {editingPrompt.trim() ? '已保存自定义提示词' : '留空时 AI 将使用内置默认提示词'}
                </span>
                <Button variant="primary" size="sm" disabled={savingPrompt} onClick={onSavePrompt}>{savingPrompt ? '保存中…' : '保存提示词'}</Button>
              </div>
            </div>
          )}
          <div className="character-detail-tabs">
            <button type="button" className={detailView === 'card' ? 'active' : ''} onClick={() => setDetailView('card')}>角色卡</button>
            <button type="button" className={detailView === 'profile' ? 'active' : ''} onClick={() => setDetailView('profile')}>结构化资料</button>
            <button type="button" className={detailView === 'relationships' ? 'active' : ''} onClick={() => setDetailView('relationships')}>关系</button>
            <button type="button" className={detailView === 'connections' ? 'active' : ''} onClick={() => setDetailView('connections')}>跨模块关联</button>
          </div>
          {editing && (detailView === 'card' || detailView === 'profile') && diagnosticMessages.map((message) => (
            <p className="character-field-conflict" role="alert" key={message}>{message}</p>
          ))}
          {loading ? (
            <div className="panel-placeholder"><p>正在加载角色资料…</p></div>
          ) : (detailView === 'relationships' || detailView === 'connections') && characterId ? (
            <CharacterConnectionsView
              projectId={projectId}
              characterId={characterId}
              view={detailView}
              onNavigateToCharacter={onNavigateToCharacter}
              onNavigateToOrganization={onNavigateToOrganization}
              onNavigateToChapter={onNavigateToChapter}
              onNavigateToForeshadow={onNavigateToForeshadow}
            />
          ) : editing ? (
            <div className="panel-editor-inner">
              <div className="sub-field" style={{ marginBottom: 0 }}>
                <div className="sub-field-label-row">
                  <label className="sub-field-label">角色信息</label>
                  <select className="notes-input" value={gender} onChange={(event) => onGenderChange(event.target.value as CharacterGender)}>
                    <option value="男">男</option>
                    <option value="女">女</option>
                    <option value="未知">未知</option>
                  </select>
                  <Button variant="text" size="sm" onClick={onToggleExample}>
                    {showExample ? '收起示例' : '📖 看示例'}
                  </Button>
                </div>
                {showExample && (
                  <div className="sub-field-example">
                    <pre>{example}</pre>
                  </div>
                )}
                {detailView === 'profile' && <details open className="character-structured-fields">
                  <summary>结构化资料</summary>
                  <div className="character-structured-grid">
                    <label>
                      <span>身份/职业</span>
                      <input className="notes-input" value={projection.identity} onChange={(event) => onStructuredFieldChange('身份/职业', event.target.value)} />
                    </label>
                    <label>
                      <span>立场</span>
                      <select className="notes-input" value={selectedStance} onChange={(event) => onStructuredFieldChange('立场', event.target.value)}>
                        <option value="">未设置</option>
                        {config.stances.slice().sort((left, right) => left.order - right.order).map((item) => <option key={item.id} value={item.label}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>角色状态</span>
                      <select className="notes-input" value={selectedStatus} onChange={(event) => onStructuredFieldChange('角色状态', event.target.value)}>
                        <option value="">未设置</option>
                        {config.statuses.slice().sort((left, right) => left.order - right.order).map((item) => <option key={item.id} value={item.label}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>标签</span>
                      <input className="notes-input" value={projection.tags.join('，')} onChange={(event) => onStructuredFieldChange('标签', event.target.value.split(/[，,]/).map((item) => item.trim()).filter(Boolean))} />
                    </label>
                  </div>
                  <div className="character-organization-heading">
                    <span>所属组织</span>
                    <div className="character-organization-tools">
                      <input className="notes-input" value={organizationQuery} onChange={(event) => setOrganizationQuery(event.target.value)} placeholder="搜索组织" aria-label="搜索组织" />
                      <Button variant="text" size="xs" onClick={() => setShowOrganizationManager(true)}>+ 添加组织</Button>
                    </div>
                  </div>
                  <fieldset className="character-organization-options">
                    {organizations.length === 0 ? <span className="panel-empty">暂无组织</span> : visibleOrganizations.length === 0 ? <span className="panel-empty">没有匹配的组织</span> : visibleOrganizations.map((organization) => (
                      <label key={organization.id}>
                        <input
                          type="checkbox"
                          checked={projection.organizations.some((name) => [organization.name, ...organization.aliases].some((candidate) => characterNameKey(candidate) === characterNameKey(name)))}
                          onChange={(event) => onOrganizationToggle(organization, event.target.checked)}
                        />
                        <span>{organization.name}{organization.status === 'dissolved' ? '（已解散）' : ''}</span>
                      </label>
                    ))}
                  </fieldset>
                  <AffiliationEditor affiliations={affiliations} organizations={organizations} chapters={chapters} onChange={onAffiliationsChange} />
                </details>}
                {detailView === 'card' && <textarea
                  ref={textareaRef}
                  className="sub-field-textarea"
                  style={{ minHeight: 350 }}
                  value={content}
                  onChange={(e) => { onContentChange(e.target.value) }}
                  onMouseUp={onSelectionCheck}
                  onKeyUp={onSelectionCheck}
                  onContextMenu={onSelectionContextMenu}
                  placeholder={`角色：${activeFile}\n身份/职业：\n外貌特征：\n性格特点：\n背景经历：\n动机目标：\n说话风格：\n标签：[标签1, 标签2, ...]\n\n💡 每行填一项就行，不确定的可以空着，或者点 ✨ AI 补全生成草稿`}
                />}
              </div>
            </div>
          ) : detailView === 'profile' ? (
            <div className="panel-preview character-profile-preview">
              <div><strong>性别</strong><span>{projection.gender}</span></div>
              <div><strong>身份/职业</strong><span>{projection.identity || '未设置'}</span></div>
              <div><strong>立场</strong><span>{selectedStance || '未设置'}</span></div>
              <div><strong>角色状态</strong><span>{selectedStatus || '未设置'}</span></div>
              <div><strong>标签</strong><span>{projection.tags.join('、') || '未设置'}</span></div>
              <div><strong>所属组织</strong><span>{projection.organizations.join('、') || '未设置'}</span></div>
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
      {showOrganizationManager && (
        <OrganizationManager
          projectId={projectId}
          modal
          onClose={() => setShowOrganizationManager(false)}
          onChange={onOrganizationsChange}
          onCreated={(organization) => {
            onOrganizationCreated(organization)
            setShowOrganizationManager(false)
          }}
        />
      )}
    </div>
  )
}
