import { atomicWriteProjectFile, readProjectFile } from '../api/tauri'
import type { OrganizationRecord, OrganizationStore } from '../types/character'
import { characterNameKey } from './characterNames'
import { isRecord } from '../utils/unknown'

const DIRECTORY = 'worldview'
const FILE = 'organizations.json'

function isOrganization(value: unknown): value is OrganizationRecord {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
    && Array.isArray(value.aliases) && value.aliases.every((item) => typeof item === 'string')
    && typeof value.kindId === 'string' && (value.parentId === undefined || typeof value.parentId === 'string')
    && typeof value.description === 'string' && (value.status === 'active' || value.status === 'dissolved')
    && typeof value.createdAt === 'string' && typeof value.updatedAt === 'string'
}

export function isOrganizationStore(value: unknown): value is OrganizationStore {
  return isRecord(value) && value.schemaVersion === 1 && typeof value.revision === 'number'
    && Array.isArray(value.organizations) && value.organizations.every(isOrganization) && typeof value.updatedAt === 'string'
}

export function validateOrganizationStore(store: OrganizationStore): void {
  const ids = new Set(store.organizations.map((item) => item.id))
  const nameOwners = new Map<string, string>()
  for (const organization of store.organizations) {
    for (const value of [organization.name, ...organization.aliases]) {
      const key = characterNameKey(value)
      const owner = nameOwners.get(key)
      if (owner && owner !== organization.id) throw new Error(`组织名称或别名冲突：${value}`)
      nameOwners.set(key, organization.id)
    }
    if (organization.parentId && !ids.has(organization.parentId)) throw new Error(`组织「${organization.name}」的父组织不存在。`)
    const visited = new Set([organization.id])
    let parentId = organization.parentId
    while (parentId) {
      if (visited.has(parentId)) throw new Error(`组织「${organization.name}」的层级形成了循环。`)
      visited.add(parentId)
      parentId = store.organizations.find((item) => item.id === parentId)?.parentId
    }
  }
}

export async function loadOrganizations(projectId: string): Promise<OrganizationStore> {
  const raw = await readProjectFile(projectId, DIRECTORY, FILE)
  if (!raw.trim()) return { schemaVersion: 1, revision: 0, organizations: [], updatedAt: '' }
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('组织目录不是有效的 JSON，原文件已保留。') }
  if (!isOrganizationStore(parsed)) throw new Error('组织目录字段不完整或版本不受支持，原文件已保留。')
  validateOrganizationStore(parsed)
  return parsed
}

export async function saveOrganizations(projectId: string, store: OrganizationStore, expectedRevision: number): Promise<OrganizationStore> {
  const current = await loadOrganizations(projectId)
  if (current.revision !== expectedRevision) throw new Error('组织目录已被其他页面修改，请刷新后重试。')
  validateOrganizationStore(store)
  const next: OrganizationStore = { ...store, schemaVersion: 1, revision: expectedRevision + 1, updatedAt: new Date().toISOString() }
  await atomicWriteProjectFile(projectId, DIRECTORY, FILE, JSON.stringify(next, null, 2))
  return next
}
