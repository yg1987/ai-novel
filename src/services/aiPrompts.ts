import { readProjectFile, writeProjectFile } from '../api/tauri'

const PROMPTS_FILE = 'ai-prompts.json'
const PROMPTS_DIR = 'memory'

interface PromptStore {
  version: 1
  prompts: Record<string, string>
}

/** Load a saved prompt for the given key, or null if none saved */
export async function loadPrompt(projectId: string, key: string): Promise<string | null> {
  try {
    const raw = await readProjectFile(projectId, PROMPTS_DIR, PROMPTS_FILE)
    if (!raw.trim()) return null
    const store = JSON.parse(raw) as PromptStore
    return store.prompts?.[key] ?? null
  } catch {
    return null
  }
}

/** Save a custom prompt for the given key */
export async function savePrompt(projectId: string, key: string, prompt: string): Promise<void> {
  let store: PromptStore
  try {
    const raw = await readProjectFile(projectId, PROMPTS_DIR, PROMPTS_FILE)
    store = raw.trim() ? JSON.parse(raw) : { version: 1, prompts: {} }
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
    const store = JSON.parse(raw) as PromptStore
    delete store.prompts?.[key]
    await writeProjectFile(projectId, PROMPTS_DIR, PROMPTS_FILE, JSON.stringify(store, null, 2))
  } catch {
    // ignore
  }
}
