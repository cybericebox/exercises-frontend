import { describe, it, expect, vi } from 'vitest'

vi.mock('@/api/client')

import * as client from '@/api/client'
import { getVariantStats } from './stats'

describe('getVariantStats', () => {
  it('requests /api/exercises/<id>/variant-stats and returns the list', async () => {
    const list = [{ VersionID: 'v1', Status: 'published', CreatedAt: '2026-09-01T10:00:00Z', PublishedAt: null, Variants: [] }]
    vi.mocked(client.apiGet).mockResolvedValueOnce(list)
    const result = await getVariantStats('ex-1')
    expect(vi.mocked(client.apiGet).mock.calls[0][0]).toBe('/api/exercises/ex-1/variant-stats')
    expect(result).toEqual(list)
  })
})
