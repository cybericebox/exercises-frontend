/** catalogW4.test.ts — W4 scope/ownership fields, filters, access and create owner. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/client')

import * as client from '@/api/client'
import { createExercise, getExercise, listExercisesPage, normalizeOwnership, setExerciseAccess } from './catalog'

const mockApiGet = vi.mocked(client.apiGet)
const mockApiPost = vi.mocked(client.apiPost)
const mockApiPut = vi.mocked(client.apiPut)

const base = { ID: 'e1', Name: 'Web', Description: '', Tags: null, DraftVersionID: null, PublishedVersionID: null, CreatedAt: '', CreatedBy: null, UpdatedAt: '', UpdatedBy: null }

describe('normalizeOwnership', () => {
  it('defaults an old payload to a plain catalog exercise without server permissions', () => {
    expect(normalizeOwnership({})).toEqual({
      Scope: 'catalog', OwnerEventID: null, OwnerEventName: '', OwnerEvent: null, AccessLevel: '', AccessEventIDs: [], AccessEvents: [],
      OriginEventID: null, ForkedFrom: null, Infrastructure: false, ResourceHeavy: false, PendingProposalID: null, Permissions: null,
    })
  })

  it('drops the access level of event-scoped exercises', () => {
    expect(normalizeOwnership({ Scope: 'event', OwnerEventID: 'ev1', AccessLevel: 'all', AccessEventIDs: null }))
      .toMatchObject({ Scope: 'event', OwnerEventID: 'ev1', AccessLevel: '', AccessEventIDs: [] })
  })
})

describe('W4 catalog client', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends scope, several events and infrastructure filters', async () => {
    mockApiGet.mockResolvedValueOnce({ Items: [], Total: 0, Page: 1, PageSize: 50 })
    await listExercisesPage({ scope: 'event', events: ['ev1', 'ev2'], infrastructure: 'yes', page: 1, pageSize: 50, sortBy: 'updated', sortDir: 'desc' })
    expect(mockApiGet).toHaveBeenCalledWith('/api/exercises?scope=event&event=ev1&event=ev2&infrastructure=yes&page=1&pageSize=50&sortBy=updated&sortDir=desc')
  })

  it('keeps ownership, fork and permissions from the card', async () => {
    const permissions = { CanRead: true, CanEdit: true, CanPublish: true, CanDelete: false, CanManageAccess: false, CanPropose: true, CanExport: false }
    mockApiGet.mockResolvedValueOnce({
      ...base, Scope: 'event', OwnerEventID: 'ev1', OwnerEventName: 'CTF', Infrastructure: true, PendingProposalID: 'p1',
      ForkedFrom: { ExerciseID: 'c1', ExerciseName: 'Base', VersionID: 'v1' }, Permissions: permissions,
    })
    const exercise = await getExercise('e1')
    expect(exercise).toMatchObject({
      Scope: 'event', OwnerEventName: 'CTF', Infrastructure: true, PendingProposalID: 'p1',
      ForkedFrom: { ExerciseName: 'Base' }, Permissions: permissions, Tags: [],
    })
  })

  it('creates an event exercise with its owner event', async () => {
    mockApiPost.mockResolvedValueOnce({ ...base, Scope: 'event', OwnerEventID: 'ev1' })
    await createExercise({ Name: 'Web', Description: '', Tags: [], OwnerEventID: 'ev1' })
    expect(mockApiPost).toHaveBeenCalledWith('/api/exercises', { Name: 'Web', Description: '', Tags: [], OwnerEventID: 'ev1' })
  })

  it('sends event IDs only for the selected access level', async () => {
    mockApiPut.mockResolvedValue({ ...base, AccessLevel: 'all' })
    await setExerciseAccess('e1', { AccessLevel: 'all', EventIDs: ['ev1'] })
    expect(mockApiPut).toHaveBeenLastCalledWith('/api/exercises/e1/access', { AccessLevel: 'all', EventIDs: [] })
    await setExerciseAccess('e1', { AccessLevel: 'selected', EventIDs: ['ev1', 'ev2'] })
    expect(mockApiPut).toHaveBeenLastCalledWith('/api/exercises/e1/access', { AccessLevel: 'selected', EventIDs: ['ev1', 'ev2'] })
  })
})
