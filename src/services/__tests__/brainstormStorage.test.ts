import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrainstormSession } from '../../types/brainstorm'

const tauri = vi.hoisted(() => ({
  deleteProjectFile: vi.fn(),
  listProjectFiles: vi.fn(),
  readProjectFile: vi.fn(),
  writeProjectFile: vi.fn(),
}))

vi.mock('../../api/tauri', () => tauri)

import { deleteBrainstormSession, getBrainstormSessionImpact, listBrainstormSessions } from '../brainstormStorage'

function session(id: string, createdAt: string): BrainstormSession {
  return {
    schemaVersion: 1,
    id,
    projectId: 'project-1',
    createdAt,
    request: {
      projectId: 'project-1',
      mode: 'plot_twist',
      problem: '',
      scope: { type: 'whole_project' },
      relatedCharacters: [],
      creativityLevel: 'balanced',
      desiredTone: '',
      mustKeep: [],
      avoid: [],
      resultCount: 3,
      enabledContextSources: [],
    },
    response: { summary: '', ideas: [] },
    contextManifest: [],
    contextWarnings: [],
    generation: { promptVersion: 1, providerName: 'test', model: 'test', durationMs: 1 },
  }
}

describe('brainstorm session history storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sorts valid sessions and preserves corrupted or newer schemas as read-only entries', async () => {
    tauri.listProjectFiles.mockResolvedValue([
      { name: 'old.json' },
      { name: 'new.json' },
      { name: 'future.json' },
      { name: 'broken.json' },
    ])
    const files: Record<string, string> = {
      'old.json': JSON.stringify(session('old', '2026-07-19T09:00:00.000Z')),
      'new.json': JSON.stringify(session('new', '2026-07-20T09:00:00.000Z')),
      'future.json': JSON.stringify({ schemaVersion: 2, id: 'future', createdAt: '2026-07-21T09:00:00.000Z' }),
      'broken.json': '{not json',
    }
    tauri.readProjectFile.mockImplementation((_projectId: string, _directory: string, filename: string) => Promise.resolve(files[filename] ?? ''))

    const entries = await listBrainstormSessions('project-1')

    expect(entries.map((entry) => entry.kind)).toEqual(['newer_schema', 'valid', 'valid', 'corrupted'])
    expect(entries.filter((entry) => entry.kind === 'valid').map((entry) => entry.session.id)).toEqual(['new', 'old'])
    expect(tauri.writeProjectFile).not.toHaveBeenCalled()
  })

  it('deletes only the selected session file', async () => {
    await deleteBrainstormSession('project-1', 'session-1')

    expect(tauri.deleteProjectFile).toHaveBeenCalledWith('project-1', 'brainstorm/sessions', 'session-1.json')
  })

  it('counts child sessions and notes before deletion', async () => {
    const child = session('child', '2026-07-20T10:00:00.000Z')
    child.request.derivation = { operation: 'deepen', parentSessionId: 'parent', parentIdeaIds: ['idea-1'], feedback: '' }
    tauri.listProjectFiles.mockImplementation((_projectId: string, directory: string) => Promise.resolve(
      directory === 'brainstorm/sessions' ? [{ name: 'child.json' }] : [{ name: 'note-1.json' }, { name: 'note-2.json' }],
    ))
    tauri.readProjectFile.mockImplementation((_projectId: string, directory: string, filename: string) => {
      if (directory === 'brainstorm/sessions') return Promise.resolve(JSON.stringify(child))
      return Promise.resolve(JSON.stringify({ source: { type: 'brainstorm', sessionId: filename === 'note-1.json' ? 'parent' : 'other' } }))
    })

    await expect(getBrainstormSessionImpact('project-1', 'parent')).resolves.toEqual({ childSessionCount: 1, noteCount: 1 })
  })
})
