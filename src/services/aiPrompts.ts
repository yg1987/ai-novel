import { readProjectFile, writeProjectFile } from '../api/tauri'
import { isRecord } from '../utils/unknown'

const PROMPTS_FILE = 'ai-prompts.json'
const PROMPTS_DIR = 'memory'

interface PromptStore {
  version: 1
  prompts: Record<string, string>
}

function parsePromptStore(raw: string): PromptStore | null {
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed) || !isRecord(parsed.prompts)) return null
  const prompts = Object.fromEntries(
    Object.entries(parsed.prompts).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
  return { version: 1, prompts }
}

/** Load a saved prompt for the given key, or null if none saved */
export async function loadPrompt(projectId: string, key: string): Promise<string | null> {
  try {
    const raw = await readProjectFile(projectId, PROMPTS_DIR, PROMPTS_FILE)
    if (!raw.trim()) return null
    const store = parsePromptStore(raw)
    return store?.prompts[key] ?? null
  } catch {
    return null
  }
}

/** Save a custom prompt for the given key */
export async function savePrompt(projectId: string, key: string, prompt: string): Promise<void> {
  let store: PromptStore
  try {
    const raw = await readProjectFile(projectId, PROMPTS_DIR, PROMPTS_FILE)
    store = raw.trim() ? (parsePromptStore(raw) ?? { version: 1, prompts: {} }) : { version: 1, prompts: {} }
  } catch {
    store = { version: 1, prompts: {} }
  }
  store.prompts[key] = prompt
  await writeProjectFile(projectId, PROMPTS_DIR, PROMPTS_FILE, JSON.stringify(store, null, 2))
}

/** Remove a saved custom prompt, falling back to default */
export async function resetPrompt(projectId: string, key: string): Promise<void> {
  try {
    const raw = await readProjectFile(projectId, PROMPTS_DIR, PROMPTS_FILE)
    if (!raw.trim()) return
    const store = parsePromptStore(raw)
    if (!store) return
    delete store.prompts?.[key]
    await writeProjectFile(projectId, PROMPTS_DIR, PROMPTS_FILE, JSON.stringify(store, null, 2))
  } catch {
    // ignore
  }
}
