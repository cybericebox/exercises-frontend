/**
 * versions.test.ts — lifecycle route paths and normalize for version/variant.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/client')

import * as client from '@/api/client'
import {
  listVersions,
  getVersion,
  saveDraft,
  publishDraft,
  getDraft,
  saveDraftKeepalive,
  EMPTY_VERSION_ID,
  isStoredVersionId,
  createCheckpoint,
  restoreVersion,
  normalizeVariant,
  type VariantDTO,
} from './versions'

const mockApiGet = vi.mocked(client.apiGet)
const mockApiPost = vi.mocked(client.apiPost)
const mockApiPut = vi.mocked(client.apiPut)
const mockKeepalive = vi.mocked(client.apiKeepalive)

const EX_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const VER_ID = 'ffffffff-0000-1111-2222-333333333333'
const DEV_ID = '99999999-8888-7777-6666-555555555555'

const rawVersion = {
  ID: VER_ID,
  ExerciseID: EX_ID,
  Status: 'draft' as const,
  AdminNote: 'wip',
  Variants: null,
  CreatedAt: '2026-01-01T00:00:00Z',
  CreatedBy: null,
  PublishedAt: null,
}

describe('versions API paths', () => {
  beforeEach(() => vi.clearAllMocks())

  it('listVersions GETs /:id/versions and normalises null to []', async () => {
    mockApiGet.mockResolvedValueOnce(null)
    const result = await listVersions(EX_ID)
    expect(mockApiGet.mock.calls[0][0]).toBe(`/api/exercises/${EX_ID}/versions`)
    expect(result).toEqual([])
  })

  it('getVersion GETs /:id/versions/:versionID', async () => {
    mockApiGet.mockResolvedValueOnce(rawVersion)
    const result = await getVersion(EX_ID, VER_ID)
    expect(mockApiGet.mock.calls[0][0]).toBe(`/api/exercises/${EX_ID}/versions/${VER_ID}`)
    expect(result.Variants).toEqual([])
  })

  it('saveDraft PUTs the snapshot to /:id/draft', async () => {
    mockApiPut.mockResolvedValueOnce(rawVersion)
    const input = { AdminNote: '', Variants: [] }
    await saveDraft(EX_ID, input)
    expect(mockApiPut.mock.calls[0][0]).toBe(`/api/exercises/${EX_ID}/draft`)
    expect(mockApiPut.mock.calls[0][1]).toBe(input)
  })

  it('publishDraft POSTs to /:id/publish', async () => {
    mockApiPost.mockResolvedValueOnce(rawVersion)
    await publishDraft(EX_ID)
    expect(mockApiPost.mock.calls[0][0]).toBe(`/api/exercises/${EX_ID}/publish`)
  })

  it('restores a historical version while preserving the current draft', async () => {
    mockApiPost.mockResolvedValueOnce(rawVersion)
    await restoreVersion(EX_ID, VER_ID)
    expect(mockApiPost.mock.calls[0][0]).toBe(`/api/exercises/${EX_ID}/versions/${VER_ID}/restore`)
  })

  it('reads the working copy from GET /:id/draft and fills Label', async () => {
    mockApiGet.mockResolvedValueOnce(rawVersion)
    const draft = await getDraft(EX_ID)
    expect(mockApiGet.mock.calls[0][0]).toBe(`/api/exercises/${EX_ID}/draft`)
    expect(draft.Label).toBe('')
  })

  it('recognises the empty working copy by its zero ID', () => {
    expect(isStoredVersionId(EMPTY_VERSION_ID)).toBe(false)
    expect(isStoredVersionId('')).toBe(false)
    expect(isStoredVersionId(VER_ID)).toBe(true)
  })

  it('creates a checkpoint with an optional trimmed note', async () => {
    mockApiPost.mockResolvedValue({ ...rawVersion, Status: 'checkpoint', Label: 'Before rework' })
    await createCheckpoint(EX_ID, '  Before rework ')
    expect(mockApiPost.mock.calls[0]).toEqual([`/api/exercises/${EX_ID}/checkpoints`, { Note: 'Before rework' }])
    await createCheckpoint(EX_ID)
    expect(mockApiPost.mock.calls[1]).toEqual([`/api/exercises/${EX_ID}/checkpoints`, {}])
  })

  it('sends the working copy with keepalive on page unload', () => {
    mockKeepalive.mockReturnValueOnce(true)
    const input = { AdminNote: '', Variants: [] }
    expect(saveDraftKeepalive(EX_ID, input)).toBe(true)
    expect(mockKeepalive).toHaveBeenCalledWith('PUT', `/api/exercises/${EX_ID}/draft`, input)
  })
})

describe('normalizeVariant', () => {
  it('fills every optional field with a concrete default', () => {
    const raw: VariantDTO = {
      Index: 1,
      Tasks: [{ Name: 'Find the flag', Difficulty: 'easy' }],
      Topology: {
        VPN: { Enabled: true, DHCP: true },
        Internet: { Enabled: false, DHCP: false },
        Devices: [{ ID: DEV_ID, Name: 'web', Type: 'container' }],
        Connections: [{ Endpoints: [{ Kind: 'vpn', Interface: 'eth0' }, { Kind: 'device', DeviceID: DEV_ID, Interface: 'eth0' }] }],
      },
    }
    const v = normalizeVariant(raw)
    expect(v.ID).toBe('')
    expect(v.Tasks[0]).toEqual({
      ID: '',
      Name: 'Find the flag',
      Description: null,
      Difficulty: 'easy',
      Flag: [],
      LinkedDeviceID: '',
      DeviceFlagVar: '',
      Attachments: [],
      Placeholders: [],
      Hints: [],
    })
    expect(v.Topology.Devices[0]).toEqual({
      ID: DEV_ID,
      Name: 'web',
      Type: 'container',
      SecurityPreset: '',
      Image: '', ResourcePreset: '',
      Resources: { CPURequest: '', MemoryRequest: '', CPULimit: '', MemoryLimit: '' },
      Interfaces: [],
      EnvVars: [],
      External: null, Persistence: null,
    })
    expect(v.Topology.Connections[0].Endpoints[0]).toEqual({ Kind: 'vpn', DeviceID: '', Interface: 'eth0' })
    expect(v.Topology.Connections[0].Endpoints[1]).toEqual({ Kind: 'device', DeviceID: DEV_ID, Interface: 'eth0' })
  })

  it('normalises a secret env var (empty Value, HasValue=true)', () => {
    const raw: VariantDTO = {
      Index: 1,
      Tasks: [],
      Topology: {
        VPN: { Enabled: false, DHCP: false },
        Internet: { Enabled: false, DHCP: false },
        Devices: [{
          ID: DEV_ID, Name: 'db', Type: 'container',
          EnvVars: [{ Name: 'DB_PASS', Secret: true, HasValue: true }],
        }],
        Connections: [],
      },
    }
    const v = normalizeVariant(raw)
    expect(v.Topology.Devices[0].EnvVars[0]).toEqual({ Name: 'DB_PASS', Value: '', Secret: true, HasValue: true })
  })
})

describe('version resources', () => {
  it('reads the server-counted resources and the latest elevation of a version response', async () => {
    mockApiGet.mockResolvedValueOnce({
      ID: 'v', ExerciseID: 'e', Status: 'draft', AdminNote: '', CreatedAt: '', CreatedBy: null, PublishedAt: null, Variants: [],
      Resources: { Min: { Devices: 1, CPUMillicores: 25, MemoryBytes: 1 }, Max: { Devices: 1, CPUMillicores: 25, MemoryBytes: 1 }, Variants: null, SpreadPercent: 0, VariantsDiffer: false, Outside: null, ResourceHeavy: true },
      Elevation: { ID: 'r', Status: 'pending', Requested: null },
    })
    const version = await getDraft('e')
    expect(version.Resources?.Outside).toEqual([])
    expect(version.Resources?.ResourceHeavy).toBe(true)
    expect(version.Elevation?.Status).toBe('pending')
    expect(version.Elevation?.Requested).toEqual([])
  })
})
