import { getVersion } from '@tauri-apps/api/app'
import { clean, gt } from 'semver'

export const REPOSITORY_URL = 'https://github.com/yg1987/ai-novel'
export const RELEASES_URL = `${REPOSITORY_URL}/releases`
export const LATEST_RELEASE_API_URL = 'https://api.github.com/repos/yg1987/ai-novel/releases/latest'

const REQUEST_TIMEOUT_MS = 10_000

export interface ReleaseInfo {
  version: string
  name: string | null
  notes: string
  releaseUrl: string
  publishedAt: string
}

export type UpdateCheckResult =
  | { status: 'up-to-date' }
  | { status: 'update-available'; release: ReleaseInfo }
  | { status: 'unavailable'; message: string }
  | { status: 'limited'; message: string }
  | { status: 'error'; message: string }

export interface UpdateCheckOptions {
  currentVersion?: string
  fetchFn?: typeof fetch
  timeoutMs?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseRelease(value: unknown): ReleaseInfo | null {
  if (!isRecord(value)) return null

  const { tag_name: tagName, name, body, html_url: releaseUrl, published_at: publishedAt } = value
  const version = typeof tagName === 'string' ? clean(tagName) : null
  if (
    !version
    || typeof releaseUrl !== 'string'
    || typeof publishedAt !== 'string'
    || Number.isNaN(Date.parse(publishedAt))
  ) {
    return null
  }

  try {
    const url = new URL(releaseUrl)
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.startsWith('/yg1987/ai-novel/releases/')) {
      return null
    }
  } catch {
    return null
  }

  return {
    version,
    name: typeof name === 'string' && name.trim() ? name : null,
    notes: typeof body === 'string' ? body : '',
    releaseUrl,
    publishedAt,
  }
}

export async function getCurrentAppVersion(): Promise<string> {
  return getVersion()
}

export async function checkForUpdate(options: UpdateCheckOptions = {}): Promise<UpdateCheckResult> {
  try {
    const currentVersion = options.currentVersion ?? await getCurrentAppVersion()
    const normalizedCurrentVersion = clean(currentVersion)
    if (!normalizedCurrentVersion) {
      return { status: 'error', message: '当前应用版本无效，无法检查更新。' }
    }

    const controller = new AbortController()
    let didTimeout = false
    const timeout = globalThis.setTimeout(() => {
      didTimeout = true
      controller.abort()
    }, options.timeoutMs ?? REQUEST_TIMEOUT_MS)

    try {
      const response = await (options.fetchFn ?? fetch)(LATEST_RELEASE_API_URL, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal,
      })

      if (response.status === 404) {
        return { status: 'unavailable', message: '暂未找到可用版本。' }
      }
      if (response.status === 403 || response.status === 429) {
        return { status: 'limited', message: '请求受限，请稍后重试。' }
      }
      if (!response.ok) {
        return { status: 'error', message: '暂时无法检查更新，请稍后重试。' }
      }

      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        return { status: 'error', message: '更新服务返回了无法识别的数据。' }
      }

      const release = parseRelease(payload)
      if (!release) {
        return { status: 'error', message: '更新服务返回了无效的版本信息。' }
      }

      return gt(release.version, normalizedCurrentVersion)
        ? { status: 'update-available', release }
        : { status: 'up-to-date' }
    } catch {
      return didTimeout
        ? { status: 'error', message: '检查更新超时，请稍后重试。' }
        : { status: 'error', message: '无法连接 GitHub，请检查网络后重试。' }
    } finally {
      globalThis.clearTimeout(timeout)
    }
  } catch {
    return { status: 'error', message: '无法读取当前应用版本。' }
  }
}
