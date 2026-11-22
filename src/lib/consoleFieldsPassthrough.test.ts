/**
 * The console model of the backend (console and serial ports of a device, console cables, the seat of an opponent) is
 * not edited in the editor yet. These tests prove that a load and a save carry it through unchanged and that a
 * topology without it goes out exactly as before.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))

import { draftSchema, toDraftFormValues, toSaveDraftInput } from './exerciseSchemas'
import { normalizeVariant, type VariantDTO, type Version } from '@/api/exercises/versions'

const ROUTER = '11111111-2222-3333-4444-555555555555'
const PC = '66666666-7777-8888-9999-000000000000'

const consolePorts = [
  { Name: 'console0', Command: ['/usr/bin/vtysh'], User: 'frr' },
  { Name: 'aux0', Native: { Kind: 'tcp', Port: 2601 } },
]
const serialPorts = [{ Name: 'serial0' }, { Name: 'serial1', Path: '/dev/ttyS1' }]
const opponents = [
  { Role: 'defense', Band: 2, Goal: ['scan'], Operates: ['router'], Seat: 'pc' },
  { Role: 'attack', Band: 1, Goal: ['scan'], StartAfter: 'scan', Foothold: 'sw', Brief: 'go' },
]

function wireVariant(withConsole: boolean): VariantDTO {
  const node = (id: string, name: string) => ({
    ID: id, Name: name, Type: 'node' as const, Image: 'alpine:3',
    Interfaces: [{ Name: 'eth0', IP: { Type: 'static' as const, Addresses: [id === ROUTER ? '10.0.0.1/24' : '10.0.0.2/24'] } }],
  })
  return {
    ID: 'var1', Index: 1,
    Tasks: [{ ID: 'task1', Key: 'scan', Name: 'Scan', Difficulty: 'medium', Check: { Answer: { Type: 'flag', Values: ['ICE{x}'] } } }],
    Topology: {
      Devices: [
        withConsole ? { ...node(ROUTER, 'router'), ConsolePorts: consolePorts } : node(ROUTER, 'router'),
        withConsole ? { ...node(PC, 'pc'), SerialPorts: serialPorts } : node(PC, 'pc'),
      ],
      Connections: [
        { Endpoints: [{ Kind: 'device', DeviceID: ROUTER, Interface: 'eth0' }, { Kind: 'device', DeviceID: PC, Interface: 'eth0' }] },
        ...(withConsole ? [{ Kind: 'console', Endpoints: [{ Kind: 'device' as const, DeviceID: PC, Interface: 'serial0' }, { Kind: 'device' as const, DeviceID: ROUTER, Interface: 'console0' }] }] : []),
      ],
    },
    ...(withConsole ? { Opponents: opponents } : {}),
  }
}

function version(variant: VariantDTO): Version {
  return {
    Resources: null, Elevation: null, ID: 'v1', ExerciseID: 'e1', Status: 'draft', AdminNote: '', Label: '',
    CreatedAt: '2026-01-01T00:00:00Z', CreatedBy: null, PublishedAt: null, Tags: [],
    Variants: [normalizeVariant(variant)],
  } as unknown as Version
}

describe('console model pass-through', () => {
  it('a load and a save keep ConsolePorts, SerialPorts, the connection Kind and the opponents (Seat included) unchanged', () => {
    const sent = toSaveDraftInput(toDraftFormValues(version(wireVariant(true)))).Variants[0]
    expect(sent.Topology.Devices?.[0].ConsolePorts).toEqual(consolePorts)
    expect(sent.Topology.Devices?.[0]).not.toHaveProperty('SerialPorts')
    expect(sent.Topology.Devices?.[1].SerialPorts).toEqual(serialPorts)
    expect(sent.Topology.Devices?.[1]).not.toHaveProperty('ConsolePorts')
    expect(sent.Topology.Connections?.[0]).not.toHaveProperty('Kind')
    expect(sent.Topology.Connections?.[1]).toEqual({ Kind: 'console', Endpoints: [{ Kind: 'device', DeviceID: PC, Interface: 'serial0' }, { Kind: 'device', DeviceID: ROUTER, Interface: 'console0' }] })
    expect(sent.Opponents).toEqual(opponents)
    expect(sent.Opponents?.[0].Seat).toBe('pc')
  })

  it('a second round trip gives the same request', () => {
    const first = toSaveDraftInput(toDraftFormValues(version(wireVariant(true))))
    const second = toSaveDraftInput(toDraftFormValues(version(first.Variants[0])))
    expect(second).toEqual(first)
  })

  it('a topology without them goes out without them (no keys added)', () => {
    const sent = toSaveDraftInput(toDraftFormValues(version(wireVariant(false)))).Variants[0]
    expect(sent).not.toHaveProperty('Opponents')
    for (const device of sent.Topology.Devices ?? []) {
      expect(device).not.toHaveProperty('ConsolePorts')
      expect(device).not.toHaveProperty('SerialPorts')
    }
    expect(sent.Topology.Connections).toHaveLength(1)
    expect(sent.Topology.Connections?.[0]).toEqual({ Endpoints: [{ Kind: 'device', DeviceID: ROUTER, Interface: 'eth0' }, { Kind: 'device', DeviceID: PC, Interface: 'eth0' }] })
  })

  it('the carried fields add nothing else: the same variant with and without them differs only by them', () => {
    const strip = (variant: VariantDTO): unknown => JSON.parse(JSON.stringify(variant, (key, value: unknown) => key === 'ConsolePorts' || key === 'SerialPorts' || key === 'Opponents' ? undefined : value))
    const withConsole = toSaveDraftInput(toDraftFormValues(version(wireVariant(true)))).Variants[0]
    const without = toSaveDraftInput(toDraftFormValues(version(wireVariant(false)))).Variants[0]
    const plain = strip(withConsole) as VariantDTO
    plain.Topology.Connections = plain.Topology.Connections?.filter((connection) => connection.Kind !== 'console')
    expect(plain).toEqual(strip(without))
  })

  it('the form validation accepts a console cable between a serial and a console port', () => {
    const result = draftSchema.safeParse(toDraftFormValues(version(wireVariant(true))))
    const connectionIssues = result.success ? [] : result.error.issues.filter((issue) => issue.path.includes('Connections'))
    expect(connectionIssues).toEqual([])
  })
})
