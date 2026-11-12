import { describe, expect, it } from 'vitest'
import { parseEnvFile, parseEnvImport, planEnvImport, planVariableImport } from './envImport'

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

describe('planEnvImport', () => {
  const rows = [
    { Name: 'MODE', Value: 'old', Secret: false, HasValue: false },
    { Name: 'DB_PASS', Value: '', Secret: true, HasValue: true },
  ]
  it('adds new names as secrets and updates the existing ones', () => {
    const plan = planEnvImport(rows, parseEnvFile('MODE=new\nTOKEN=x').entries)
    expect(plan.added).toEqual([{ Name: 'TOKEN', Value: 'x', Secret: true, HasValue: false }])
    expect(plan.updated).toEqual([{ index: 0, name: 'MODE', value: 'new' }])
  })

  it('replaces a saved secret only by a non-empty value; an empty one keeps it', () => {
    expect(planEnvImport(rows, parseEnvFile('DB_PASS=fresh').entries).updated).toEqual([{ index: 1, name: 'DB_PASS', value: 'fresh' }])
    const kept = planEnvImport(rows, parseEnvFile('DB_PASS=').entries)
    expect(kept.updated).toEqual([])
    expect(kept.kept).toEqual(['DB_PASS'])
  })

  it('counts invalid lines and keeps the first of repeated names', () => {
    const parsed = parseEnvFile('A=1\nA=2\nbad line\nB=3')
    expect(parsed.entries.map((entry) => entry.Value)).toEqual(['1', '3'])
    expect(parsed.invalid).toBe(1)
  })
})

describe('planVariableImport', () => {
  it('corrects the names to the rule of schema variables and says what changed', () => {
    const plan = planVariableImport([], parseEnvFile('DB_PASS=a\n_TOKEN=b\nok_name=c').entries)
    expect(plan.added.map((entry) => entry.Name)).toEqual(['db_pass', 'var_token', 'ok_name'])
    expect(plan.fixed.map((fix) => [fix.from, fix.to])).toEqual([['DB_PASS', 'db_pass'], ['_TOKEN', 'var_token']])
  })

  it('updates an existing variable and skips a name equal to another after the correction', () => {
    const plan = planVariableImport([{ Name: 'mode' }], parseEnvFile('MODE=x\nmode=y').entries)
    expect(plan.updated).toEqual([{ index: 0, name: 'mode', value: 'x' }])
    expect(plan.skipped).toEqual([{ name: 'mode', because: 'same' }])
  })

  it('skips names that cannot be used', () => {
    expect(planVariableImport([], parseEnvFile(`${'A'.repeat(40)}=1`).entries).skipped[0].because).toBe('long')
  })
})
