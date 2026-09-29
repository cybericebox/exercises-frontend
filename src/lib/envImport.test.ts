import { describe, expect, it } from 'vitest'
import { parseEnvImport } from './envImport'

describe('parseEnvImport', () => {
  it('reads common dotenv syntax and marks every imported value secret', () => {
    const result = parseEnvImport('\uFEFF# database\nexport DB_PASS="a=b # kept"\nMODE=training # note\nEMPTY=\n')
    expect(result.imported).toEqual([
      { Name: 'DB_PASS', Value: 'a=b # kept', Secret: true, HasValue: false },
      { Name: 'MODE', Value: 'training', Secret: true, HasValue: false },
      { Name: 'EMPTY', Value: '', Secret: true, HasValue: false },
    ])
    expect(result.duplicates).toBe(0)
    expect(result.invalid).toBe(0)
  })

  it('skips existing names, task flag bindings, and later duplicates without overwriting', () => {
    const result = parseEnvImport('DB_PASS=old\nFLAG=wrong\nNEW=first\nNEW=second', new Set(['DB_PASS', 'FLAG']))
    expect(result.imported.map((entry) => entry.Name)).toEqual(['NEW'])
    expect(result.imported[0].Value).toBe('first')
    expect(result.duplicates).toBe(3)
  })

  it('skips invalid lines without putting their values in the report', () => {
    const result = parseEnvImport('INVALID-NAME=x\nGOOD=ok\nBROKEN="unterminated\njust words')
    expect(result.imported.map((entry) => entry.Name)).toEqual(['GOOD'])
    expect(result.invalid).toBe(3)
    expect(JSON.stringify({ duplicates: result.duplicates, invalid: result.invalid })).not.toContain('unterminated')
  })
})
