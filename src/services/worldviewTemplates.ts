import { readProjectFile, writeProjectFile } from '../api/tauri'
import type { SectionDef, SubField } from './worldviewConfig'
import { asString, isRecord } from '../utils/unknown'

const DIR = 'worldview'
const FILE = '_worldview_templates.json'

export interface WorldviewTemplate {
  id: string
  name: string
  createdAt: string
  sections: SectionDef[]
}

interface WorldviewTemplateStore {
  schemaVersion: 1
  templates: WorldviewTemplate[]
}

function parseSubField(value: unknown): SubField | null {
  if (!isRecord(value)) return null
  const key = asString(value.key).trim()
  if (!key) return null
  return {
    key,
    label: asString(value.label, key),
    hint: asString(value.hint),
  }
}

function parseSection(value: unknown): SectionDef | null {
  if (!isRecord(value)) return null
  const key = asString(value.key).trim()
  const file = asString(value.file).trim()
  if (!key || !file) return null
  const subs = Array.isArray(value.subs)
    ? value.subs.map(parseSubField).filter((sub): sub is SubField => sub !== null)
    : []
  return {
    key,
    label: asString(value.label, key),
    file,
    hint: asString(value.hint),
    subs,
  }
}

function parseSections(value: unknown): SectionDef[] | null {
  if (!Array.isArray(value)) return null
  const sections = value.map(parseSection).filter((section): section is SectionDef => section !== null)
  if (sections.length === 0) return null
  const keys = new Set(sections.map((section) => section.key))
  const files = new Set(sections.map((section) => section.file))
  return keys.size === sections.length && files.size === sections.length ? sections : null
}

function parseTemplate(value: unknown): WorldviewTemplate | null {
  if (!isRecord(value)) return null
  const id = asString(value.id).trim()
  const name = asString(value.name).trim()
  const createdAt = asString(value.createdAt).trim()
  const sections = parseSections(value.sections)
  if (!id || !name || !createdAt || !sections) return null
  return { id, name, createdAt, sections }
}

function cloneSections(sections: SectionDef[]): SectionDef[] {
  return sections.map((section) => ({ ...section, subs: section.subs.map((sub) => ({ ...sub })) }))
}

export async function loadWorldviewTemplates(projectId: string): Promise<WorldviewTemplate[]> {
  let raw: string
  try {
    raw = await readProjectFile(projectId, DIR, FILE)
  } catch {
    return []
  }
  if (!raw.trim()) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new Error('世界观模板数据不是有效的 JSON')
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.templates)) {
    throw new Error('世界观模板数据版本或结构不受支持')
  }
  const templates = parsed.templates.map(parseTemplate)
  if (templates.some((template) => template === null)) throw new Error('世界观模板包含无效栏目结构')
  return templates.map((template) => ({ ...template!, sections: cloneSections(template!.sections) }))
}

async function saveStore(projectId: string, templates: WorldviewTemplate[]): Promise<void> {
  const store: WorldviewTemplateStore = {
    schemaVersion: 1,
    templates: templates.map((template) => ({ ...template, sections: cloneSections(template.sections) })),
  }
  await writeProjectFile(projectId, DIR, FILE, JSON.stringify(store, null, 2))
}

export async function createWorldviewTemplate(projectId: string, name: string, sections: SectionDef[]): Promise<WorldviewTemplate> {
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error('请输入模板名称')
  if (trimmedName.length > 50) throw new Error('模板名称最多 50 个字符')
  const parsedSections = parseSections(sections)
  if (!parsedSections) throw new Error('当前栏目结构无效，无法保存为模板')
  const templates = await loadWorldviewTemplates(projectId)
  const template: WorldviewTemplate = {
    id: `template_${String(Date.now())}`,
    name: trimmedName,
    createdAt: new Date().toISOString(),
    sections: cloneSections(parsedSections),
  }
  await saveStore(projectId, [...templates, template])
  return template
}

export async function deleteWorldviewTemplate(projectId: string, templateId: string): Promise<void> {
  const templates = await loadWorldviewTemplates(projectId)
  await saveStore(projectId, templates.filter((template) => template.id !== templateId))
}
