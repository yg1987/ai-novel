import { describe, expect, it } from 'vitest'
import { checkForUpdate, LATEST_RELEASE_API_URL } from '../updateCheck'

function latestRelease(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tag_name: 'v0.2.0',
    name: 'AI Novel Writer v0.2.0',
    body: '新增版本检查。\n修复若干问题。',
    html_url: 'https://github.com/yg1987/ai-novel/releases/tag/v0.2.0',
    published_at: '2026-07-22T08:00:00Z',
    ...overrides,
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('checkForUpdate', () => {
  it('normalizes a v prefix and recognizes newer minor, patch and prerelease releases', async () => {
    const fetchFn: typeof fetch = async (input) => {
      expect(input).toBe(LATEST_RELEASE_API_URL)
      return jsonResponse(latestRelease())
    }

    for (const currentVersion of ['0.1.9', '0.2.0-alpha.1', '0.2.0-rc.1']) {
      const result = await checkForUpdate({ currentVersion, fetchFn })
      expect(result).toMatchObject({ status: 'update-available', release: { version: '0.2.0' } })
    }

    const patchResult = await checkForUpdate({
      currentVersion: '0.2.0',
      fetchFn: async () => jsonResponse(latestRelease({ tag_name: 'v0.2.1' })),
    })
    expect(patchResult.status).toBe('update-available')

    const majorResult = await checkForUpdate({
      currentVersion: '0.2.1',
      fetchFn: async () => jsonResponse(latestRelease({ tag_name: 'v1.0.0' })),
    })
    expect(majorResult.status).toBe('update-available')
  })

  it('treats equal versions with different build metadata as current', async () => {
    const result = await checkForUpdate({
      currentVersion: '0.2.0+local.8',
      fetchFn: async () => jsonResponse(latestRelease({ tag_name: 'v0.2.0+release.1' })),
    })

    expect(result).toEqual({ status: 'up-to-date' })
  })

  it('rejects invalid release data without opening untrusted links', async () => {
    const result = await checkForUpdate({
      currentVersion: '0.1.0',
      fetchFn: async () => jsonResponse(latestRelease({ tag_name: 'release-0.2.0' })),
    })

    expect(result).toEqual({ status: 'error', message: '更新服务返回了无效的版本信息。' })
  })

  it('maps no release and API limits to understandable feedback', async () => {
    const notFound = await checkForUpdate({
      currentVersion: '0.1.0',
      fetchFn: async () => new Response(null, { status: 404 }),
    })
    const forbidden = await checkForUpdate({
      currentVersion: '0.1.0',
      fetchFn: async () => new Response(null, { status: 403 }),
    })
    const tooManyRequests = await checkForUpdate({
      currentVersion: '0.1.0',
      fetchFn: async () => new Response(null, { status: 429 }),
    })

    expect(notFound.status).toBe('unavailable')
    expect(forbidden.status).toBe('limited')
    expect(tooManyRequests.status).toBe('limited')
  })

  it('handles malformed JSON, network failures and timeouts', async () => {
    const malformed = await checkForUpdate({
      currentVersion: '0.1.0',
      fetchFn: async () => new Response('not-json', { status: 200 }),
    })
    const offline = await checkForUpdate({
      currentVersion: '0.1.0',
      fetchFn: async () => { throw new Error('offline') },
    })
    const timeoutFetch: typeof fetch = (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { reject(new Error('aborted')) })
    })
    const timeout = await checkForUpdate({ currentVersion: '0.1.0', fetchFn: timeoutFetch, timeoutMs: 1 })

    expect(malformed.status).toBe('error')
    expect(offline).toEqual({ status: 'error', message: '无法连接 GitHub，请检查网络后重试。' })
    expect(timeout).toEqual({ status: 'error', message: '检查更新超时，请稍后重试。' })
  })
})
