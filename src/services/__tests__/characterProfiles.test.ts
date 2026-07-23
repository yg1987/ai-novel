import { describe, expect, it } from 'vitest'
import { characterNameCombinationCount, parseCharacterGender, randomCharacterName, setCharacterGender } from '../characterProfiles'

describe('characterProfiles', () => {
  it('provides at least one million combinations for each gender', () => {
    expect(characterNameCombinationCount('男')).toBeGreaterThanOrEqual(1_000_000)
    expect(characterNameCombinationCount('女')).toBeGreaterThanOrEqual(1_000_000)
  })

  it('returns a generated name with a binary random gender', () => {
    const result = randomCharacterName()
    expect(result.name.length).toBeGreaterThanOrEqual(3)
    expect(['男', '女']).toContain(result.gender)
  })

  it('reads and writes the gender field', () => {
    expect(parseCharacterGender('角色：林烬\n性别：女')).toBe('女')
    expect(setCharacterGender('角色：林烬\n身份：剑修', '男')).toContain('性别：男')
  })
})
