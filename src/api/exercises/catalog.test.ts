/**
 * catalog.test.ts — paths, query params and normalize for the catalog client.
 * vi.mock('@/api/client') intercepts all HTTP calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/client')

import * as client from '@/api/client'
import {
  listExercises,
  listExercisesPage,
  listExerciseTags,
  getExercise,
  createExercise,
  updateExercise,
  deleteExercise,
  archiveExercise,
  unarchiveExercise,
  getExerciseUsage,
  updateExerciseKeepalive,
} from './catalog'

const mockApiGet = vi.mocked(client.apiGet)
const mockApiPost = vi.mocked(client.apiPost)
const mockApiPatch = vi.mocked(client.apiPatch)
const mockApiDelete = vi.mocked(client.apiDelete)
const mockKeepalive = vi.mocked(client.apiKeepalive)

const EX_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const rawListItem = {
  ID: EX_ID,
  Name: 'SQLi basics',
  Description: 'Intro',
  Tags: ['web', 'sql'],
  HasDraft: true,
  HasPublished: false,
  CreatedAt: '2026-01-01T00:00:00Z',
  UpdatedAt: '2026-01-02T00:00:00Z',
}

const rawExercise = {
  ID: EX_ID,
  Name: 'SQLi basics',
  Description: 'Intro',
  Tags: ['web'],
  DraftVersionID: null,
  PublishedVersionID: null,
  CreatedAt: '2026-01-01T00:00:00Z',
  CreatedBy: null,
  UpdatedAt: '2026-01-02T00:00:00Z',
  UpdatedBy: null,
}

describe('listExercises', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls apiGet with the bare base path when no filter', async () => {
    mockApiGet.mockResolvedValueOnce({ Items: [], Total: 0 })
    await listExercises()
    expect(mockApiGet.mock.calls[0][0]).toBe('/api/exercises')
  })

  it('builds search, repeated tags, cursor and pageSize params', async () => {
    mockApiGet.mockResolvedValueOnce({ Items: [], Total: 0 })
    await listExercises({ search: 'sql', tags: ['web', 'crypto'], cursor: EX_ID, pageSize: 50 })
    const [path] = mockApiGet.mock.calls[0]
    expect(path).toBe(`/api/exercises?search=sql&tags=web&tags=crypto&cursor=${EX_ID}&pageSize=50`)
  })

  it('normalises null Exercises and null Tags', async () => {
    mockApiGet.mockResolvedValueOnce({ Items: null, Total: 0 })
    const empty = await listExercises()
    expect(empty.Items).toEqual([])

    mockApiGet.mockResolvedValueOnce({
      Items: [{ ...rawListItem, Tags: null }],
      Total: 1,
    })
    const result = await listExercises()
    expect(result.Items[0].Tags).toEqual([])
  })
})

describe('listExercisesPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends offset, sort and filters and normalizes tags', async () => {
    mockApiGet.mockResolvedValueOnce({ Items: [{ ...rawListItem, Tags: null }], Total: 51, Page: 2, PageSize: 25 })
    const page = await listExercisesPage({ search: 'sql', tags: ['web'], status: 'draft_only', page: 2, pageSize: 25, sortBy: 'name', sortDir: 'asc' })
    expect(mockApiGet).toHaveBeenCalledWith('/api/exercises?search=sql&tags=web&status=draft_only&page=2&pageSize=25&sortBy=name&sortDir=asc')
    expect(page).toMatchObject({ Total: 51, Page: 2, PageSize: 25, Items: [{ Tags: [], Status: null }] })
  })

  it('keeps the server status, owner event and access event names', async () => {
    mockApiGet.mockResolvedValueOnce({ Items: [{ ...rawListItem, Status: 'changed', AccessLevel: 'selected',
      OwnerEvent: null, AccessEvents: [{ ID: 'ev1', Name: 'Winter CTF' }], AccessEventIDs: null }], Total: 1, Page: 1, PageSize: 50 })
    const page = await listExercisesPage({ page: 1, pageSize: 50, sortBy: 'updated', sortDir: 'desc' })
    expect(page.Items[0]).toMatchObject({ Status: 'changed', AccessEvents: [{ ID: 'ev1', Name: 'Winter CTF' }], AccessEventIDs: ['ev1'] })
  })
})

describe('listExerciseTags', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks for the most used tags with an empty prefix and a limit', async () => {
    mockApiGet.mockResolvedValueOnce([{ Tag: 'web', Count: 40 }])
    await listExerciseTags('', 20)
    expect(mockApiGet).toHaveBeenCalledWith('/api/exercises/tags?prefix=&limit=20')
  })

  it('requests prefix-matching catalog tags and keeps their exercise counts', async () => {
    mockApiGet.mockResolvedValueOnce([{ Tag: 'crypto', Count: 12 }])
    expect(await listExerciseTags('cr')).toEqual([{ Tag: 'crypto', Count: 12 }])
    expect(mockApiGet).toHaveBeenCalledWith('/api/exercises/tags?prefix=cr')
  })
})

describe('getExercise', () => {
  beforeEach(() => vi.clearAllMocks())

  it('GETs /:id and normalises null Tags', async () => {
    mockApiGet.mockResolvedValueOnce({ ...rawExercise, Tags: null })
    const result = await getExercise(EX_ID)
    expect(mockApiGet.mock.calls[0][0]).toBe(`/api/exercises/${EX_ID}`)
    expect(result.Tags).toEqual([])
  })
})

describe('createExercise', () => {
  beforeEach(() => vi.clearAllMocks())

  it('POSTs the identity body to the base path', async () => {
    mockApiPost.mockResolvedValueOnce(rawExercise)
    await createExercise({ Name: 'SQLi basics', Description: 'Intro', Tags: ['web'] })
    expect(mockApiPost.mock.calls[0][0]).toBe('/api/exercises')
    expect(mockApiPost.mock.calls[0][1]).toEqual({ Name: 'SQLi basics', Description: 'Intro', Tags: ['web'] })
  })
})

describe('updateExercise', () => {
  beforeEach(() => vi.clearAllMocks())

  it('PATCHes /:id with the identity body', async () => {
    mockApiPatch.mockResolvedValueOnce(rawExercise)
    await updateExercise(EX_ID, { Name: 'New', Description: '', Tags: [] })
    expect(mockApiPatch.mock.calls[0][0]).toBe(`/api/exercises/${EX_ID}`)
    expect(mockApiPatch.mock.calls[0][1]).toEqual({ Name: 'New', Description: '', Tags: [] })
  })
})

describe('deleteExercise', () => {
  beforeEach(() => vi.clearAllMocks())

  it('DELETEs /:id', async () => {
    mockApiDelete.mockResolvedValueOnce(undefined)
    await deleteExercise(EX_ID)
    expect(mockApiDelete.mock.calls[0][0]).toBe(`/api/exercises/${EX_ID}`)
  })
})

describe('archive, usage and working-copy status', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('normalizes missing archive/change flags on list items and exercises', async () => {
    mockApiGet.mockResolvedValueOnce({ Items: [rawListItem], Total: 1, Page: 1, PageSize: 50 })
    const page = await listExercisesPage({ page: 1, pageSize: 50, sortBy: 'updated', sortDir: 'desc' })
    expect(page.Items[0].ArchivedAt).toBeNull()
    mockApiGet.mockResolvedValueOnce(rawExercise)
    const exercise = await getExercise(EX_ID)
    expect(exercise).toMatchObject({ ArchivedAt: null, HasChanges: false })
  })

  it('asks only for archived exercises with archived=only', async () => {
    mockApiGet.mockResolvedValueOnce({ Items: [], Total: 0, Page: 1, PageSize: 50 })
    await listExercisesPage({ page: 1, pageSize: 50, sortBy: 'updated', sortDir: 'desc', archived: 'only' })
    expect(new URL(mockApiGet.mock.calls[0][0] as string, 'https://x').searchParams.get('archived')).toBe('only')
  })

  it('archives and unarchives through dedicated routes', async () => {
    mockApiPost.mockResolvedValueOnce({ ...rawExercise, ArchivedAt: '2026-09-20T00:00:00Z', HasChanges: true })
    expect(await archiveExercise(EX_ID)).toMatchObject({ ArchivedAt: '2026-09-20T00:00:00Z', HasChanges: true })
    expect(mockApiPost.mock.calls[0][0]).toBe(`/api/exercises/${EX_ID}/archive`)
    mockApiPost.mockResolvedValueOnce(rawExercise)
    await unarchiveExercise(EX_ID)
    expect(mockApiPost.mock.calls[1][0]).toBe(`/api/exercises/${EX_ID}/unarchive`)
  })

  it('reads the events using the exercise', async () => {
    mockApiGet.mockResolvedValueOnce({ Events: [{ ID: 'ev1', Name: 'Cybershield', Archived: false }] })
    expect(await getExerciseUsage(EX_ID)).toEqual({ Events: [{ ID: 'ev1', Name: 'Cybershield', Archived: false }] })
    expect(mockApiGet.mock.calls[0][0]).toBe(`/api/exercises/${EX_ID}/usage`)
    mockApiGet.mockResolvedValueOnce({ Events: null })
    expect(await getExerciseUsage(EX_ID)).toEqual({ Events: [] })
  })

  it('sends identity edits with keepalive on page unload', () => {
    mockKeepalive.mockReturnValueOnce(true)
    expect(updateExerciseKeepalive(EX_ID, { Name: 'SQLi', Description: '', Tags: [] })).toBe(true)
    expect(mockKeepalive).toHaveBeenCalledWith('PATCH', `/api/exercises/${EX_ID}`, { Name: 'SQLi', Description: '', Tags: [] })
  })
})
