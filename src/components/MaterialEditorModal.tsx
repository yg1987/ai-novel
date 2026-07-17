import { useMemo, useState } from 'react'
import type { ProjectMeta } from '../types/project'
import type {
  MaterialCategory,
  MaterialItem,
  MaterialKindDefinition,
  MaterialScope,
  MaterialSourceType,
  MaterialWriteInput,
} from '../types/material'
import Button from './Button'
import Modal from './Modal'

interface Props {
  projectId: string
  material?: MaterialItem | null
  categories: MaterialCategory[]
  kinds: MaterialKindDefinition[]
  projects: ProjectMeta[]
  onSave: (input: MaterialWriteInput) => Promise<void>
  onClose: () => void
}

const SOURCE_OPTIONS: Array<{ value: MaterialSourceType; label: string }> = [
  { value: 'original', label: '原创 / 手动整理' },
  { value: 'book', label: '书籍资料' },
  { value: 'web', label: '网页' },
  { value: 'file', label: '文件' },
  { value: 'image', label: '图片参考' },
]

function categoryLabel(category: MaterialCategory, categories: MaterialCategory[]) {
  const parent = category.parentId
    ? categories.find((candidate) => candidate.id === category.parentId)
    : null
  return parent ? `${parent.name} / ${category.name}` : category.name
}

export default function MaterialEditorModal({
  projectId,
  material,
  categories,
  kinds,
  projects,
  onSave,
  onClose,
}: Props) {
  const activeKinds = useMemo(
    () => kinds.filter((kind) => !kind.archived || kind.id === material?.kindId)
      .sort((a, b) => a.order - b.order),
    [kinds, material?.kindId],
  )
  const inbox = categories.find((category) => category.systemKey === 'inbox')
  const defaultKind = activeKinds.find((kind) => kind.presetKey === 'inspiration') ?? activeKinds[0]
  const [title, setTitle] = useState(material?.title ?? '')
  const [kindId, setKindId] = useState(material?.kindId ?? defaultKind?.id ?? '')
  const [content, setContent] = useState(material?.content ?? '')
  const [summary, setSummary] = useState(material?.summary ?? '')
  const [sourceType, setSourceType] = useState<MaterialSourceType>(material?.sourceType ?? 'original')
  const [sourceName, setSourceName] = useState(material?.sourceName ?? '')
  const [sourceUrl, setSourceUrl] = useState(material?.sourceUrl ?? '')
  const [categoryId, setCategoryId] = useState(material?.categoryId ?? inbox?.id ?? categories[0]?.id ?? '')
  const [tags, setTags] = useState(material?.tags.join('，') ?? '')
  const [scope, setScope] = useState<MaterialScope>(material?.scope ?? 'projects')
  const [projectIds, setProjectIds] = useState<string[]>(material?.scope === 'projects'
    ? material.projectIds
    : [projectId])
  const [favorite, setFavorite] = useState(material?.favorite ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleProject = (id: string) => {
    setProjectIds((current) => current.includes(id)
      ? current.filter((candidate) => candidate !== id)
      : [...current, id])
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('请输入素材标题')
      return
    }
    if (!kindId || !categoryId) {
      setError('请选择素材类型和分类')
      return
    }
    if (scope === 'projects' && projectIds.length === 0) {
      setError('项目素材至少关联一个项目')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({
        title: title.trim(),
        kindId,
        content,
        contentFormat: material?.contentFormat ?? 'plain_text',
        summary: summary.trim(),
        sourceType,
        sourceName: sourceName.trim(),
        sourceUrl: sourceUrl.trim(),
        categoryId,
        tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
        scope,
        projectIds: scope === 'global' ? [] : projectIds,
        favorite,
      })
    } catch (cause) {
      setError(String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal className="material-editor-modal">
      <div className="material-modal-header">
        <div>
          <h2>{material ? '编辑素材' : '新建素材'}</h2>
          <p>{material ? '更新内容和整理信息' : '先保存，再慢慢整理'}</p>
        </div>
        <Button variant="text" size="sm" onClick={onClose} title="关闭">×</Button>
      </div>

      <div className="modal-scroll-body material-form-body">
        {error && <div className="material-error" role="alert">{error}</div>}
        <label className="material-field material-field-wide">
          <span>标题</span>
          <input value={title} onChange={(event) => { setTitle(event.target.value); }} autoFocus maxLength={200} />
        </label>

        <div className="material-form-grid">
          <label className="material-field">
            <span>类型</span>
            <select value={kindId} onChange={(event) => { setKindId(event.target.value); }}>
              {activeKinds.map((kind) => <option key={kind.id} value={kind.id}>{kind.name}</option>)}
            </select>
          </label>
          <label className="material-field">
            <span>分类</span>
            <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); }}>
              {[...categories].sort((a, b) => a.order - b.order).map((category) => (
                <option key={category.id} value={category.id}>{categoryLabel(category, categories)}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="material-field material-field-wide">
          <span>正文</span>
          <textarea className="material-content-input" value={content} onChange={(event) => { setContent(event.target.value); }} />
        </label>
        <label className="material-field material-field-wide">
          <span>摘要</span>
          <textarea value={summary} onChange={(event) => { setSummary(event.target.value); }} rows={3} placeholder="可选：写下这条素材为什么有用" />
        </label>

        <div className="material-form-grid">
          <label className="material-field">
            <span>来源类型</span>
            <select value={sourceType} onChange={(event) => { setSourceType(event.target.value as MaterialSourceType); }}>
              {SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="material-field">
            <span>来源名称</span>
            <input value={sourceName} onChange={(event) => { setSourceName(event.target.value); }} placeholder="书名、网站或资料名称" />
          </label>
        </div>
        <label className="material-field material-field-wide">
          <span>来源链接</span>
          <input value={sourceUrl} onChange={(event) => { setSourceUrl(event.target.value); }} placeholder="https://" />
        </label>
        <label className="material-field material-field-wide">
          <span>标签</span>
          <input value={tags} onChange={(event) => { setTags(event.target.value); }} placeholder="用逗号分隔多个标签" />
        </label>

        <fieldset className="material-scope-field">
          <legend>可见范围</legend>
          <div className="material-segmented">
            <button type="button" className={scope === 'projects' ? 'active' : ''} onClick={() => { setScope('projects'); }}>指定项目</button>
            <button type="button" className={scope === 'global' ? 'active' : ''} onClick={() => { setScope('global'); }}>全局素材</button>
          </div>
          {scope === 'projects' && (
            <div className="material-project-options">
              {projects.map((project) => (
                <label key={project.id}>
                  <input type="checkbox" checked={projectIds.includes(project.id)} onChange={() => { toggleProject(project.id); }} />
                  <span>{project.name}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <label className="material-checkbox-row">
          <input type="checkbox" checked={favorite} onChange={(event) => { setFavorite(event.target.checked); }} />
          <span>加入收藏</span>
        </label>
      </div>

      <div className="material-modal-footer">
        <Button variant="secondary" size="md" onClick={onClose}>取消</Button>
        <Button variant="primary" size="md" loading={saving} onClick={() => { void handleSubmit() }}>保存素材</Button>
      </div>
    </Modal>
  )
}
