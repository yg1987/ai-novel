import Button from '../Button'
import type { SectionDef } from '../../services/worldviewConfig'

interface Props {
  sections: SectionDef[]
  activeSectionKey: string
  editingSectionId: string | null
  editingSectionLabel: string
  showAddSection: boolean
  newSectionName: string
  onSelectSection: (section: SectionDef) => void
  onStartRenameSection: (section: SectionDef) => void
  onRenameLabelChange: (value: string) => void
  onCommitRenameSection: (sectionId: string) => void
  onCancelRenameSection: () => void
  onDeleteSection: (sectionId: string) => void
  onNewSectionNameChange: (value: string) => void
  onAddSection: () => void
  onToggleAddSection: (show: boolean) => void
  onOpenResetConfirm: () => void
}

export default function WorldviewSidebar({
  sections,
  activeSectionKey,
  editingSectionId,
  editingSectionLabel,
  showAddSection,
  newSectionName,
  onSelectSection,
  onStartRenameSection,
  onRenameLabelChange,
  onCommitRenameSection,
  onCancelRenameSection,
  onDeleteSection,
  onNewSectionNameChange,
  onAddSection,
  onToggleAddSection,
  onOpenResetConfirm,
}: Props) {
  return (
    <div className="panel-sidebar">
      <div className="panel-sidebar-header">
        <h3>世界观</h3>
      </div>
      <div className="panel-list">
        {sections.map((section) => (
          <div key={section.key}>
            {editingSectionId === section.key ? (
              <div className="panel-item">
                <input
                  className="notes-input"
                  style={{ flex: 1, fontSize: '0.82rem' }}
                  value={editingSectionLabel}
                  onChange={(e) => onRenameLabelChange(e.target.value)}
                  onBlur={() => onCommitRenameSection(section.key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onCommitRenameSection(section.key)
                    if (e.key === 'Escape') onCancelRenameSection()
                  }}
                  autoFocus
                />
              </div>
            ) : (
              <div
                className={`panel-item${section.key === activeSectionKey ? ' active' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectSection(section)}
                onDoubleClick={() => onStartRenameSection(section)}
              >
                <span style={{ flex: 1 }}>{section.label}</span>
                <Button
                  variant="ghost"
                  size="xs"
                  title="删除栏目"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteSection(section.key)
                  }}
                >
                  ✕
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ padding: '8px', borderTop: '1px solid var(--border)' }}>
        {showAddSection ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              className="notes-input"
              style={{ flex: 1, fontSize: '0.8rem' }}
              value={newSectionName}
              onChange={(e) => onNewSectionNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) onAddSection()
                if (e.key === 'Escape') onToggleAddSection(false)
              }}
              placeholder="栏目名称…"
              autoFocus
            />
            <Button variant="text" size="sm" onClick={onAddSection} disabled={!newSectionName.trim()}>✓</Button>
            <Button variant="text" size="sm" onClick={() => onToggleAddSection(false)}>✕</Button>
          </div>
        ) : (
          <Button variant="text" size="sm" style={{ width: '100%' }} onClick={() => onToggleAddSection(true)}>
            + 添加栏目
          </Button>
        )}
        <Button variant="text" size="sm" style={{ width: '100%', marginTop: 8, borderTop: '1px solid var(--border)' }} onClick={onOpenResetConfirm}>
          重置为品类默认
        </Button>
      </div>
    </div>
  )
}
