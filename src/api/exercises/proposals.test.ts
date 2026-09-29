import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/client')

import * as client from '@/api/client'
import { approveProposal, listProposals, proposeExercise, rejectProposal } from './proposals'

const mockGet = vi.mocked(client.apiGet)
const mockPost = vi.mocked(client.apiPost)

describe('proposals client', () => {
  beforeEach(() => vi.clearAllMocks())

  it('proposes an exercise with a trimmed note', async () => {
    mockPost.mockResolvedValueOnce({ ID: 'p1', ExerciseID: 'e1', Status: 'pending' })
    const proposal = await proposeExercise('e1', '  good one ')
    expect(mockPost).toHaveBeenCalledWith('/api/exercises/e1/proposals', { Note: 'good one' })
    expect(proposal).toMatchObject({ ID: 'p1', Status: 'pending', CatalogExerciseID: null, DecisionNote: '' })
  })

  it('lists proposals by status', async () => {
    mockGet.mockResolvedValueOnce(null)
    expect(await listProposals()).toEqual([])
    expect(mockGet).toHaveBeenCalledWith('/api/exercises/proposals?status=pending')
  })

  it('approves with a name override and access events only for «selected»', async () => {
    mockPost.mockResolvedValue({ ID: 'p1', Status: 'approved', CatalogExerciseID: 'c9' })
    await approveProposal('p1', { Name: ' ', AccessLevel: 'own', EventIDs: ['ev1'], Note: '' })
    expect(mockPost).toHaveBeenLastCalledWith('/api/exercises/proposals/p1/approve', { AccessLevel: 'own', EventIDs: [], Note: '' })
    const approved = await approveProposal('p1', { Name: 'Web 2', AccessLevel: 'selected', EventIDs: ['ev1'], Note: 'ok' })
    expect(mockPost).toHaveBeenLastCalledWith('/api/exercises/proposals/p1/approve', { Name: 'Web 2', AccessLevel: 'selected', EventIDs: ['ev1'], Note: 'ok' })
    expect(approved.CatalogExerciseID).toBe('c9')
  })

  it('rejects with a note', async () => {
    mockPost.mockResolvedValueOnce({ ID: 'p1', Status: 'rejected' })
    await rejectProposal('p1', 'duplicate')
    expect(mockPost).toHaveBeenCalledWith('/api/exercises/proposals/p1/reject', { Note: 'duplicate' })
  })
})
