import { describe, expect, it } from 'vitest'
import { defaultCharacterModuleConfig, validateCharacterModuleConfig } from '../characterConfig'

describe('characterConfig', () => {
  it('rejects duplicate stable option IDs', () => {
    const config = defaultCharacterModuleConfig()
    config.stances = [...config.stances, { ...config.stances[0]!, label: '重复项' }]
    expect(() => validateCharacterModuleConfig(config)).toThrow('重复 ID')
  })

  it('requires every preset group to retain an option', () => {
    const config = defaultCharacterModuleConfig()
    config.organizationKinds = []
    expect(() => validateCharacterModuleConfig(config)).toThrow('至少保留一个')
  })
})
