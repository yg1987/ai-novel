import { describe, expect, it } from 'vitest'
import { characterNameKey, hasDuplicateCharacterName, normalizeCharacterName, validateCharacterName } from '../characterNames'

describe('characterNames', () => {
  it('normalizes whitespace and Unicode before generating a comparison key', () => {
    expect(normalizeCharacterName('  林烬  ')).toBe('林烬')
    expect(characterNameKey('Alice')).toBe(characterNameKey('alice'))
    expect(characterNameKey('e\u0301')).toBe(characterNameKey('é'))
  })

  it('rejects unsafe character names', () => {
    expect(validateCharacterName('')).toBe('请输入角色名')
    expect(validateCharacterName('..')).toBe('角色名不能使用 . 或 ..')
    expect(validateCharacterName('阿/明')).toContain('不能包含')
    expect(validateCharacterName('Alice.')).toContain('不能以空格或句点结尾')
    expect(validateCharacterName('CON')).toContain('Windows 保留名称')
  })

  it('detects duplicate names with case-insensitive comparison', () => {
    expect(hasDuplicateCharacterName(['Alice', '林烬'], 'alice')).toBe(true)
    expect(hasDuplicateCharacterName(['Alice', '林烬'], ' 林烬 ')).toBe(true)
    expect(hasDuplicateCharacterName(['Alice'], 'Alice', 'Alice')).toBe(false)
  })
})
