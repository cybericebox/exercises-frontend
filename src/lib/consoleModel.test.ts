/**
 * The console model (console and serial ports of a device, console cables), the seats of the opponents and the defender block
 * through the editor: a load and a save keep what the server sent, the form edits them, and the browser buffer holds them like
 * any other field (an older buffer takes them from the server), never a credential value in the clear.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))

import { draftSchema, toDraftFormValues, toSaveDraftInput, type DraftFormValues } from './exerciseSchemas'
import { collectPendingSecrets, mergePendingDraft, sanitizePendingDraft } from './exercisePendingBuffer'
import { ensureClientKeys } from './clientKeys'
import { capturedDraftIds, savedSecretUpdates } from './serverIdUpdates'
import { normalizeVariant, type DefenderDTO, type VariantDTO, type Version } from '@/api/exercises/versions'

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
const defender: DefenderDTO = {
  Seat: 'pc', Topology: 'operates', OffLimits: [],
  Credentials: [{ Device: 'router', Port: 'console0', User: 'admin', Value: '', Secret: true }, { Device: 'router', User: 'guest', Value: 'guest' }],
}

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
    ...(withConsole ? { Opponents: opponents, Defender: defender } : {}),
  }
}

function version(variant: VariantDTO): Version {
  return {
    Resources: null, Elevation: null, ID: 'v1', ExerciseID: 'e1', Status: 'draft', AdminNote: '', Label: '',
    CreatedAt: '2026-01-01T00:00:00Z', CreatedBy: null, PublishedAt: null, Tags: [],
    Variants: [normalizeVariant(variant)],
  } as unknown as Version
}

describe('console model round trip', () => {
  it('a load and a save keep the ports, the connection kind, the opponents and the defender block', () => {
    const sent = toSaveDraftInput(toDraftFormValues(version(wireVariant(true)))).Variants[0]
    expect(sent.Topology.Devices?.[0].ConsolePorts).toEqual(consolePorts)
    expect(sent.Topology.Devices?.[0]).not.toHaveProperty('SerialPorts')
    expect(sent.Topology.Devices?.[1].SerialPorts).toEqual(serialPorts)
    expect(sent.Topology.Devices?.[1]).not.toHaveProperty('ConsolePorts')
    expect(sent.Topology.Connections?.[0]).not.toHaveProperty('Kind')
    expect(sent.Topology.Connections?.[1]).toEqual({ Kind: 'console', Endpoints: [{ Kind: 'device', DeviceID: PC, Interface: 'serial0' }, { Kind: 'device', DeviceID: ROUTER, Interface: 'console0' }] })
    expect(sent.Opponents).toEqual(opponents)
    // The stored secret goes back blank (= keep), the plain value as loaded; an empty off-limits list is not sent.
    expect(sent.Defender).toEqual({ Seat: 'pc', Topology: 'operates', Credentials: defender.Credentials })
  })

  it('the form reads a console port as its mode: a program, stdio or tcp', () => {
    const form = toDraftFormValues(version(wireVariant(true))).Variants[0]
    expect(form.Topology.Devices[0].ConsolePorts).toEqual([
      { Name: 'console0', Mode: 'program', Command: ['/usr/bin/vtysh'], User: 'frr', Port: '' },
      { Name: 'aux0', Mode: 'tcp', Command: [], User: '', Port: '2601' },
    ])
    expect(form.Topology.Devices[1].SerialPorts).toEqual([{ Name: 'serial0', Path: '' }, { Name: 'serial1', Path: '/dev/ttyS1' }])
    expect(form.Defender?.Credentials[0]).toMatchObject({ Secret: true, HasValue: true, Value: '' })
    expect(form.Defender?.Credentials[1]).toMatchObject({ Secret: false, HasValue: false, Value: 'guest' })
  })

  it('a port switched to stdio drops its command and user on the wire; one switched back to a program keeps them', () => {
    const form = toDraftFormValues(version(wireVariant(true)))
    form.Variants[0].Topology.Devices[0].ConsolePorts[0].Mode = 'stdio'
    expect(toSaveDraftInput(form).Variants[0].Topology.Devices?.[0].ConsolePorts?.[0]).toEqual({ Name: 'console0', Native: { Kind: 'stdio' } })
    form.Variants[0].Topology.Devices[0].ConsolePorts[0].Mode = 'program'
    expect(toSaveDraftInput(form).Variants[0].Topology.Devices?.[0].ConsolePorts?.[0]).toEqual(consolePorts[0])
  })

  it('a typed secret goes out; turning the block off removes it from the request', () => {
    const form = toDraftFormValues(version(wireVariant(true)))
    form.Variants[0].Defender!.Credentials[0].Value = 'n3w'
    expect(toSaveDraftInput(form).Variants[0].Defender?.Credentials?.[0]).toEqual({ Device: 'router', Port: 'console0', User: 'admin', Value: 'n3w', Secret: true })
    form.Variants[0].Defender = null
    expect(toSaveDraftInput(form).Variants[0]).not.toHaveProperty('Defender')
  })

  it('a second round trip gives the same request', () => {
    const first = toSaveDraftInput(toDraftFormValues(version(wireVariant(true))))
    const second = toSaveDraftInput(toDraftFormValues(version(first.Variants[0])))
    expect(second).toEqual(first)
  })

  it('a topology without them goes out without them (no keys added)', () => {
    const sent = toSaveDraftInput(toDraftFormValues(version(wireVariant(false)))).Variants[0]
    expect(sent).not.toHaveProperty('Opponents')
    expect(sent).not.toHaveProperty('Defender')
    for (const device of sent.Topology.Devices ?? []) {
      expect(device).not.toHaveProperty('ConsolePorts')
      expect(device).not.toHaveProperty('SerialPorts')
    }
    expect(sent.Topology.Connections).toEqual([{ Endpoints: [{ Kind: 'device', DeviceID: ROUTER, Interface: 'eth0' }, { Kind: 'device', DeviceID: PC, Interface: 'eth0' }] }])
  })

  it('the form validation accepts the whole console model (the attacker\'s foothold "sw" is not in this topology)', () => {
    const result = draftSchema.safeParse(toDraftFormValues(version(wireVariant(true))))
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))).toEqual(['Variants.0.Opponents'])
  })
})

/** A buffer written before the console model was edited: no Defender key, no ports, no cable kind, no opponents. */
function oldFormatBuffer(server: DraftFormValues): DraftFormValues {
  return JSON.parse(JSON.stringify(server, (key, value: unknown) => key === 'ConsolePorts' || key === 'SerialPorts' || key === 'Opponents' || key === 'Defender' || key === 'Kind' && typeof value === 'string' && value === 'console' ? undefined : value))
}

describe('pending buffer and the console model', () => {
  const server = () => ensureClientKeys(toDraftFormValues(version(wireVariant(true))))

  it('an old-format buffer gets the opponents, the ports, the cable and the defender block back from the server', () => {
    const buffered = oldFormatBuffer(server())
    buffered.Variants[0].Note = 'typed offline'
    const merged = mergePendingDraft(server(), buffered).Variants[0]
    expect(merged.Note).toBe('typed offline')
    expect(merged.Opponents).toEqual(opponents)
    expect(merged.Topology.Devices[0].ConsolePorts).toEqual(server().Variants[0].Topology.Devices[0].ConsolePorts)
    expect(merged.Topology.Connections[1].Kind).toBe('console')
    expect(merged.Defender?.Seat).toBe('pc')
    expect(toSaveDraftInput({ ...server(), Variants: [merged] })).toEqual(toSaveDraftInput({ ...server(), Variants: [{ ...server().Variants[0], Note: 'typed offline' }] }))
  })

  it('a buffer written by this editor keeps the author\'s edits of the ports, cables, seats and defender block', () => {
    const buffered = sanitizePendingDraft(server())
    buffered.Variants[0].Topology.Devices[1].SerialPorts.push({ Name: 'serial2', Path: '' })
    buffered.Variants[0].Topology.Connections = buffered.Variants[0].Topology.Connections.filter((connection) => connection.Kind !== 'console')
    buffered.Variants[0].Opponents = [{ ...opponents[0], Seat: 'router' }]
    buffered.Variants[0].Defender = { ...buffered.Variants[0].Defender!, Topology: 'none' }
    const merged = mergePendingDraft(server(), buffered).Variants[0]
    expect(merged.Topology.Devices[1].SerialPorts.map((port) => port.Name)).toEqual(['serial0', 'serial1', 'serial2'])
    expect(merged.Topology.Connections.some((connection) => connection.Kind === 'console')).toBe(false)
    expect(merged.Opponents?.[0].Seat).toBe('router')
    expect(merged.Defender?.Topology).toBe('none')
  })

  it('a buffer that removed the block keeps it removed', () => {
    const buffered = sanitizePendingDraft(server())
    buffered.Variants[0].Defender = null
    expect(mergePendingDraft(server(), buffered).Variants[0].Defender).toBeNull()
  })

  it('never buffers a credential value; a plain one comes back from the server, a stored secret stays blank (= keep)', () => {
    const typed = server()
    typed.Variants[0].Defender!.Credentials[0].Value = 'typed-secret'
    const buffered = sanitizePendingDraft(typed)
    expect(JSON.stringify(buffered)).not.toContain('typed-secret')
    expect(JSON.stringify(buffered)).not.toContain('"guest"' + ',"Secret"')
    expect(buffered.Variants[0].Defender!.Credentials.map((credential) => credential.Value)).toEqual(['', ''])
    const merged = mergePendingDraft(server(), buffered).Variants[0].Defender!
    expect(merged.Credentials[0]).toMatchObject({ Value: '', HasValue: true, Secret: true })
    expect(merged.Credentials[1]).toMatchObject({ Value: 'guest', HasValue: false })
  })

  it('a credential value typed before a reload is sealed by its client key and restored from the sealed part', () => {
    const typed = server()
    typed.Variants[0].Defender!.Credentials[0].Value = 'typed-secret'
    const secrets = collectPendingSecrets(typed)
    expect(Object.values(secrets.env)).toContain('typed-secret')
    const merged = mergePendingDraft(server(), sanitizePendingDraft(typed), secrets).Variants[0].Defender!
    expect(merged.Credentials[0]).toMatchObject({ Value: 'typed-secret', HasValue: true })
  })

  it('a credential whose device and user were renamed still gets its stored value back (its row, not its fields, is its identity)', () => {
    const buffered = sanitizePendingDraft(server())
    const credentials = buffered.Variants[0].Defender!.Credentials
    credentials[1] = { ...credentials[1], Device: 'r1-new', User: 'guest2' }
    // A row added in this browser before it has nothing to take from the server.
    credentials.unshift({ Device: 'router', Port: '', User: 'ops', Value: '', Secret: false, HasValue: false })
    const merged = mergePendingDraft(server(), buffered).Variants[0].Defender!.Credentials
    expect(merged[2]).toMatchObject({ Device: 'r1-new', User: 'guest2', Value: 'guest' })
    expect(merged[1]).toMatchObject({ Secret: true, HasValue: true, Value: '' })
    expect(merged[0]).toMatchObject({ Value: '', HasValue: false })
  })
})

describe('after an acknowledged save', () => {
  it('each credential takes its place in the answer as its identity, and a secret sent from the editor becomes stored', () => {
    const form = ensureClientKeys(toDraftFormValues(version(wireVariant(true))))
    const rows = form.Variants[0].Defender!.Credentials
    rows.reverse()
    rows[1].Value = 'typed'
    const sent = capturedDraftIds(form)
    const saved = version(toSaveDraftInput(form).Variants[0])
    const updates = savedSecretUpdates(sent, saved, form)
    expect(updates).toEqual(expect.arrayContaining([
      { path: 'Variants.0.Defender.Credentials.0.Origin', value: 0 },
      { path: 'Variants.0.Defender.Credentials.1.Origin', value: 1 },
      { path: 'Variants.0.Defender.Credentials.1.Value', value: '' },
      { path: 'Variants.0.Defender.Credentials.1.HasValue', value: true },
    ]))
  })
})
