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
      IsAdmin: false, CanCreateCatalog: false, CanPublish: false, CanDelete: false, CanExport: false,
      Events: [{ ID: 'ev1', Name: 'CTF', Tag: '', CanWrite: true, InfrastructureAllowed: false }],
    })
  })

  it('treats an empty body as no rights', () => {
    expect(normalizeAccess(null)).toMatchObject({ IsAdmin: false, Events: [] })
    expect(normalizeAccess({ Events: null })).toMatchObject({ Events: [] })
  })
})
