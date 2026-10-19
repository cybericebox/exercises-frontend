import { describe, expect, it, vi } from 'vitest'

vi.mock('@/api/client')

import * as client from '@/api/client'
import { getExerciseAccess, normalizeAccess } from './access'

describe('exercise access', () => {
  it('reads GET /api/exercises/access and fills missing fields', async () => {
    vi.mocked(client.apiGet).mockResolvedValueOnce({ IsAdmin: false, Events: [{ ID: 'ev1', Name: 'CTF', CanWrite: true }] })
    const access = await getExerciseAccess()
    expect(client.apiGet).toHaveBeenCalledWith('/api/exercises/access')
    expect(access).toEqual({
      IsAdmin: false, CanCreateCatalog: false, CanPublish: false, CanDelete: false, CanExport: false, CanImport: false,
      Events: [{ ID: 'ev1', Name: 'CTF', Tag: '', CanWrite: true, InfrastructureAllowed: false }],
    })
  })

  it('takes CanImport from the server, else from the catalog right of an older API', () => {
    expect(normalizeAccess({ CanImport: true, CanCreateCatalog: false }).CanImport).toBe(true)
    expect(normalizeAccess({ CanCreateCatalog: true }).CanImport).toBe(true)
  })

  it('treats an empty body as no rights', () => {
    expect(normalizeAccess(null)).toMatchObject({ IsAdmin: false, Events: [] })
    expect(normalizeAccess({ Events: null })).toMatchObject({ Events: [] })
  })
})
