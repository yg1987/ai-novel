import type { ChapterMeta, ChapterRef } from '../../types/chapter'
import type { CharacterAffiliation, OrganizationRecord } from '../../types/character'
import Button from '../Button'

interface Props {
  affiliations: CharacterAffiliation[]
  organizations: OrganizationRecord[]
  chapters: ChapterMeta[]
  onChange: (affiliations: CharacterAffiliation[]) => void
}
const refKey = (reference?: ChapterRef): string => reference ? `${reference.volume}\u0000${reference.chapterId}` : ''

function parseRef(value: string): ChapterRef | undefined {
  if (!value) return undefined
  const [volume, chapterId] = value.split('\u0000')
  return volume && chapterId ? { volume, chapterId } : undefined
}

export default function AffiliationEditor({ affiliations, organizations, chapters, onChange }: Props) {
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]))
  const updateAffiliation = (organizationId: string, update: (item: CharacterAffiliation) => CharacterAffiliation) => {
    onChange(affiliations.map((item) => item.organizationId === organizationId ? update(item) : item))
  }

  return (
    <div className="character-affiliation-history">
      <div className="character-affiliation-heading">
        <strong>归属履历</strong>
        <span>职位变化请结束旧时间段后新增一段</span>
      </div>
      {affiliations.length === 0 ? (
        <p className="panel-empty">选择组织后可填写职位和起止章节</p>
      ) : affiliations.map((affiliation) => {
        const organization = organizationById.get(affiliation.organizationId)
        if (!organization) return null
        return (
          <section key={affiliation.organizationId} className="character-affiliation-group">
            <div className="character-affiliation-group-header">
              <strong>{organization.name}</strong>
              <Button
                variant="text"
                size="xs"
                onClick={() => updateAffiliation(affiliation.organizationId, (item) => ({
                  ...item,
                  periods: [...item.periods, { id: crypto.randomUUID(), role: '', status: 'former', notes: '' }],
                }))}
              >
                + 时间段
              </Button>
            </div>
            {affiliation.periods.length === 0 ? <p className="panel-empty">暂无时间段</p> : affiliation.periods.map((period) => {
              const patchPeriod = (patch: Partial<typeof period>) => updateAffiliation(affiliation.organizationId, (item) => ({
                ...item,
                periods: item.periods.map((candidate) => candidate.id === period.id ? { ...candidate, ...patch } : candidate),
              }))
              return (
                <div key={period.id} className="character-affiliation-period">
                  <label><span>职位</span><input className="notes-input" value={period.role} onChange={(event) => patchPeriod({ role: event.target.value })} /></label>
                  <label>
                    <span>状态</span>
                    <select className="notes-input" value={period.status} onChange={(event) => patchPeriod({ status: event.target.value as typeof period.status })}>
                      <option value="active">当前</option>
                      <option value="former">曾经</option>
                      <option value="hidden">隐藏</option>
                    </select>
                  </label>
                  <label>
                    <span>开始章节</span>
                    <select className="notes-input" value={refKey(period.startChapter)} onChange={(event) => patchPeriod({ startChapter: parseRef(event.target.value) })}>
                      <option value="">未设置</option>
                      {chapters.map((chapter) => <option key={`start-${chapter.volume}-${chapter.id}`} value={refKey({ volume: chapter.volume, chapterId: chapter.id })}>{chapter.volume} · {chapter.title || chapter.id}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>结束章节</span>
                    <select className="notes-input" value={refKey(period.endChapter)} onChange={(event) => patchPeriod({ endChapter: parseRef(event.target.value) })}>
                      <option value="">未设置</option>
                      {chapters.map((chapter) => <option key={`end-${chapter.volume}-${chapter.id}`} value={refKey({ volume: chapter.volume, chapterId: chapter.id })}>{chapter.volume} · {chapter.title || chapter.id}</option>)}
                    </select>
                  </label>
                  <label className="character-affiliation-notes"><span>说明</span><input className="notes-input" value={period.notes} onChange={(event) => patchPeriod({ notes: event.target.value })} /></label>
                  <Button
                    variant="ghost"
                    size="xs"
                    title="删除此时间段"
                    aria-label={`删除 ${organization.name} 的归属时间段`}
                    onClick={() => updateAffiliation(affiliation.organizationId, (item) => ({ ...item, periods: item.periods.filter((candidate) => candidate.id !== period.id) }))}
                  >
                    ×
                  </Button>
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
