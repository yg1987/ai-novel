const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const MAX_CHARACTER_NAME_LENGTH = 80

export function normalizeCharacterName(value: string): string {
  return value.normalize('NFC').trim()
}

export function characterNameKey(value: string): string {
  return normalizeCharacterName(value).toLocaleLowerCase()
}

export function validateCharacterName(value: string): string | null {
  const name = normalizeCharacterName(value)
  if (!name) return '请输入角色名'
  if (name === '.' || name === '..') return '角色名不能使用 . 或 ..'
  if (name.length > MAX_CHARACTER_NAME_LENGTH) return `角色名不能超过 ${MAX_CHARACTER_NAME_LENGTH} 个字符`
  if (INVALID_FILENAME_CHARS.test(name)) return '角色名不能包含以下字符：< > : " / \\ | ? *'
  if (/[.\s]$/.test(name)) return '角色名不能以空格或句点结尾'
  if (WINDOWS_RESERVED_NAMES.test(name)) return '角色名不能使用 Windows 保留名称'
  return null
}

export function hasDuplicateCharacterName(existingNames: string[], candidate: string, except?: string): boolean {
  const candidateKey = characterNameKey(candidate)
  const exceptKey = except ? characterNameKey(except) : null
  return existingNames.some((name) => {
    const key = characterNameKey(name)
    return key === candidateKey && key !== exceptKey
  })
}
