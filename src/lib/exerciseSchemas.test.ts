/**
 * exerciseSchemas.test.ts — table-driven tests for the domain's zod mirror.
 * t is mocked as "key → key": we don't check message language, only that an error occurred.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))

import {
  DNS_LABEL_RE,
  containerNameError,
  MAC_RE,
  isValidCIDR,
  isValidIPv4,
  identitySchema,
  draftSchema,
  emptyDraft,
  emptyVariant,
  emptyTask,
  emptyDevice,
  emptyGateway,
  gatewayNetworkConflicts,
  gatewayClashOfLink,
  gatewaysOverLimit,
  emptyAccess,
  emptyBootstrap,
  toDraftFormValues,
  toSaveDraftInput,
  type DraftFormValues,
} from './exerciseSchemas'
import { normalizeVariant, type Version } from '@/api/exercises/versions'
import { normalizedDevice } from '@/test/editorFixtures'

// ── Regexes and parsers ──────────────────────────────────────────────────────────

describe('DNS_LABEL_RE', () => {
  it.each([
    ['web', true],
    ['a', true],
    ['web-01', true],
    ['a'.repeat(35), true],
    ['a-'.repeat(17) + 'a', true],
    ['', false],
    ['-web', false],
    ['web-', false],
    ['Web', false],
    ['web_01', false],
    ['a'.repeat(36), false],
    ['a'.repeat(63), false],
  ])('%s → %s', (input, ok) => {
    expect(DNS_LABEL_RE.test(input)).toBe(ok)
  })
})

describe('containerNameError', () => {
  it('is null for a valid name, distinguishes too long from bad charset', () => {
    expect(containerNameError('web-01')).toBeNull()
    expect(containerNameError('a'.repeat(36))).toBe('admin.ex.val.deviceNameTooLong')
    expect(containerNameError('Web')).toBe('admin.ex.val.deviceName')
  })
})

describe('MAC_RE', () => {
  it.each([
    ['02:42:ac:11:00:02', true],
    ['02-42-AC-11-00-02', true],
    ['02:42:ac:11:00', false],
    ['02:42:ac:11:00:02:99', false],
    ['0242ac110002', false],
    ['gg:42:ac:11:00:02', false],
    ['02:42-ac:11:00:02', false], // mixed separators: net.ParseMAC rejects
  ])('%s → %s', (input, ok) => {
    expect(MAC_RE.test(input)).toBe(ok)
  })
})

describe('isValidCIDR', () => {
  it.each([
    ['10.0.0.0/24', true],
    ['192.168.1.5/32', true],
    ['0.0.0.0/0', true],
    ['10.0.0.0', false],
    ['10.0.0.0/33', false],
    ['256.0.0.0/24', false],
    ['010.0.0.0/24', false], // leading zero in an octet: Go netip rejects
    ['10.0.0/24', false],
    ['abc/24', false],
    ['2001:db8::2/64', true],
  ])('%s → %s', (input, ok) => {
    expect(isValidCIDR(input)).toBe(ok)
  })
})

describe('topology operator parity', () => {
  it('validates and serializes subnet-relative static address choices', () => {
    const draft = validDraft()
    const topology = draft.Variants[0].Topology
    const attack = addGateway(topology, 'vpn_gateway', 'attack')
    addGateway(topology, 'internet_gateway', 'out')
    const device = emptyDevice()
    device.Name = 'web'
    Object.assign(device.Interfaces[0].IP, {
      Type: 'static', Addresses: [], AddressRef: { Gateway: 'attack', Host: 10 },
      Gateway: '', GatewayRef: { Gateway: 'attack', Host: 1 },
      Routes: [{ Dst: '', DstRef: { Gateway: 'out' }, Via: '', ViaRef: { Gateway: 'attack', Host: 1 } }],
    })
    topology.Devices.push(device)
    expect(draftSchema.safeParse(draft).success).toBe(true)
    const saved = toSaveDraftInput(draft).Variants[0].Topology.Devices?.find((candidate) => candidate.Name === 'web')?.Interfaces?.[0].IP
    expect(saved?.AddressRef).toEqual({ Gateway: 'attack', Host: 10 })
    expect(saved?.GatewayRef).toEqual({ Gateway: 'attack', Host: 1 })
    expect(saved?.Routes?.[0].DstRef).toEqual({ Gateway: 'out' })
    expect(saved?.Routes?.[0].ViaRef).toEqual({ Gateway: 'attack', Host: 1 })
    expect(saved).not.toHaveProperty('Addresses')
    expect(saved).not.toHaveProperty('Gateway')

    device.Interfaces[0].IP.Addresses = ['10.0.0.10/24']
    expect(draftSchema.safeParse(draft).success).toBe(false)
    device.Interfaces[0].IP.Addresses = []
    if (device.Interfaces[0].IP.AddressRef) device.Interfaces[0].IP.AddressRef.Host = 1
    expect(draftSchema.safeParse(draft).success).toBe(false)
    if (device.Interfaces[0].IP.AddressRef) device.Interfaces[0].IP.AddressRef.Host = 255
    expect(draftSchema.safeParse(draft).success).toBe(false)
    if (device.Interfaces[0].IP.AddressRef) device.Interfaces[0].IP.AddressRef.Host = 10
    attack.DHCP = true
    attack.DHCPRanges = [{ Start: 2, End: 254 }]
    expect(draftSchema.safeParse(draft).success).toBe(true)
    // A reference to a gateway that is not in the variant is refused beside the reference.
    attack.DHCP = false
    attack.DHCPRanges = []
    topology.Devices = topology.Devices.filter((candidate) => candidate.ID !== attack.ID)
    const missing = draftSchema.safeParse(draft)
    expect(missing.success).toBe(false)
    if (!missing.success) expect(missing.error.issues.map((issue) => issue.message)).toContain('ed.c.val.gatewayRefUnknown')
    topology.Devices.unshift(attack)
    device.Interfaces[0].IP.Routes[0].DstRef = null
    device.Interfaces[0].IP.Routes[0].Dst = '2001:db8::/64'
    expect(draftSchema.safeParse(draft).success).toBe(false)
    device.Interfaces[0].IP.Type = 'dhcp'
    expect(draftSchema.safeParse(draft).success).toBe(false)
  })

  it('accepts multiple DHCP ranges and per-internet DNS, but rejects malformed ranges', () => {
    const draft = validDraft()
    const topology = draft.Variants[0].Topology
    const vpnRanges = [{ Start: 2, End: 50 }, { Start: 100, End: 150 }]
    const vpn = addGateway(topology, 'vpn_gateway', 'attack')
    vpn.DHCP = true
    vpn.DHCPRanges = vpnRanges
    const internet = addGateway(topology, 'internet_gateway', 'out')
    internet.DHCP = true
    internet.DHCPRanges = [{ Start: 20, End: 80 }]
    internet.DNS = '1.1.1.1'
    expect(draftSchema.safeParse(draft).success).toBe(true)
    const saved = toSaveDraftInput(draft).Variants[0].Topology.Devices ?? []
    expect(saved.find((device) => device.Name === 'attack')?.DHCPRanges).toEqual(vpnRanges)
    expect(saved.find((device) => device.Name === 'out')?.DNS).toBe('1.1.1.1')
    vpnRanges[1].Start = 50
    expect(draftSchema.safeParse(draft).success).toBe(false)
    vpnRanges[1].Start = 100
    internet.DNS = 'invalid'
    expect(draftSchema.safeParse(draft).success).toBe(false)
  })

  it('requires DNS labels only for containers and nonblank display names for forwarding devices', () => {
    const draft = validDraft()
    const device = emptyDevice()
    draft.Variants[0].Topology.Devices.push(device)
    device.Name = 'My Host'
    expect(draftSchema.safeParse(draft).success).toBe(false)
    device.Name = 'web-1'
    expect(draftSchema.safeParse(draft).success).toBe(true)
    device.Type = 'unmanaged-switch'
    device.Interfaces = []
    device.Name = 'Комутатор А'
    expect(draftSchema.safeParse(draft).success).toBe(true)
    device.Type = 'hub'
    device.Name = 'Hub 1'
    expect(draftSchema.safeParse(draft).success).toBe(true)
    device.Name = '  '
    expect(draftSchema.safeParse(draft).success).toBe(false)
  })

  it('WaitReadyFile survives reopening a draft and an old draft opens with it off', () => {
    const version = loadedVersion()
    version.Variants[0].Topology.Devices[0].WaitReadyFile = true
    const reopened = toDraftFormValues(version)
    expect(reopened.Variants[0].Topology.Devices[0].WaitReadyFile).toBe(true)
    expect(toSaveDraftInput(reopened).Variants[0].Topology.Devices?.[0].WaitReadyFile).toBe(true)
    const legacy = loadedVersion()
    delete legacy.Variants[0].Topology.Devices[0].WaitReadyFile
    expect(toDraftFormValues(legacy).Variants[0].Topology.Devices[0].WaitReadyFile).toBe(false)
  })

  it('defaults a missing preset and routes when reopening an old draft', () => {
    const legacy = loadedVersion()
    delete (legacy.Variants[0].Topology.Devices[0] as Partial<typeof legacy.Variants[0]['Topology']['Devices'][0]>).ResourcePreset
    delete (legacy.Variants[0].Topology.Devices[0].Interfaces[0].IP as Partial<typeof legacy.Variants[0]['Topology']['Devices'][0]['Interfaces'][0]['IP']>).Routes
    const values = toDraftFormValues(legacy)
    const device = values.Variants[0].Topology.Devices[0]
    expect(device).toHaveProperty('ResourcePreset', '')
    expect(device.Interfaces[0].IP).toHaveProperty('Routes', [])
    const saved = toSaveDraftInput(values).Variants[0].Topology.Devices?.[0]
    expect(saved).not.toHaveProperty('ResourcePreset')
    expect(saved?.Interfaces?.[0].IP).not.toHaveProperty('Routes')
  })

  it('sends the preset id of a device, and nothing for the default', () => {
    const draft = validDraft()
    const preset = Object.assign(emptyDevice(), { ResourcePreset: 'medium' })
    preset.Name = 'a'
    const plain = emptyDevice()
    plain.Name = 'b'
    draft.Variants[0].Topology.Devices.push(preset, plain)
    const [first, second] = toSaveDraftInput(draft).Variants[0].Topology.Devices ?? []
    expect(first.ResourcePreset).toBe('medium')
    expect(first).not.toHaveProperty('Resources')
    expect(second.ResourcePreset).toBeUndefined()
    expect(second).not.toHaveProperty('Resources')
  })

  it('serializes all static routes', () => {
    const draft = validDraft()
    const device = emptyDevice()
    device.Name = 'web'
    Object.assign(device.Interfaces[0].IP, {
      Type: 'static', Addresses: ['10.0.0.2/24'], Gateway: '',
      Routes: [{ Dst: '10.1.0.0/16', Via: '10.0.0.1' }, { Dst: '10.2.0.0/16', Via: '10.0.0.1' }],
    })
    draft.Variants[0].Topology.Devices.push(device)
    const output = toSaveDraftInput(draft).Variants[0].Topology.Devices?.[0]
    expect(output?.Interfaces?.[0].IP.Routes).toEqual([
      { Dst: '10.1.0.0/16', Via: '10.0.0.1' },
      { Dst: '10.2.0.0/16', Via: '10.0.0.1' },
    ])
  })

  it('rejects a second static address and resources on a switch', () => {
    const draft = validDraft()
    const device = emptyDevice()
    device.Name = 'web'
    device.Interfaces[0].IP = { Type: 'static', Addresses: ['10.0.0.2/24', '10.0.0.3/24'], Gateway: '', Routes: [] }
    draft.Variants[0].Topology.Devices.push(device)
    expect(draftSchema.safeParse(draft).success).toBe(false)
    device.Type = 'unmanaged-switch'
    device.Interfaces = []
    Object.assign(device, { ResourcePreset: 'medium' })
    expect(draftSchema.safeParse(draft).success).toBe(false)
  })

  it('validates IPv4 and IPv6 static route families', () => {
    const draft = validDraft()
    const device = emptyDevice()
    device.Name = 'web'
    draft.Variants[0].Topology.Devices.push(device)
    Object.assign(device.Interfaces[0].IP, { Type: 'static', Addresses: ['2001:db8::2/64'], Routes: [{ Dst: '2001:db8:1::/64', Via: '2001:db8::1' }] })
    expect(draftSchema.safeParse(draft).success).toBe(true)
    Object.assign(device.Interfaces[0].IP, { Routes: [{ Dst: '2001:db8:1::/64', Via: '10.0.0.1' }] })
    const mismatch = draftSchema.safeParse(draft)
    expect(mismatch.success).toBe(false)
    if (!mismatch.success) expect(mismatch.error.issues.map((issue) => issue.path.join('.'))).toContain('Variants.0.Topology.Devices.0.Interfaces.0.IP.Routes.0.Via')
    Object.assign(device.Interfaces[0].IP, { Routes: [{ Dst: 'bad', Via: '10.0.0.1' }] })
    const badDestination = draftSchema.safeParse(draft)
    expect(badDestination.success).toBe(false)
    if (!badDestination.success) expect(badDestination.error.issues.map((issue) => issue.path.join('.'))).toContain('Variants.0.Topology.Devices.0.Interfaces.0.IP.Routes.0.Dst')
    Object.assign(device.Interfaces[0].IP, { Type: 'dhcp', Addresses: [], Routes: [{ Dst: '10.1.0.0/16', Via: '10.0.0.1' }] })
    expect(draftSchema.safeParse(draft).success).toBe(false)
  })


})

describe('isValidIPv4', () => {
  it.each([
    ['10.0.0.1', true],
    ['255.255.255.255', true],
    ['256.0.0.1', false],
    ['010.0.0.1', false], // leading zero in an octet: Go netip rejects
    ['10.0.0.1/24', false],
    ['', false],
  ])('%s → %s', (input, ok) => {
    expect(isValidIPv4(input)).toBe(ok)
  })
})

// ── identitySchema ─────────────────────────────────────────────────────────────

describe('identitySchema', () => {
  const ok = { Name: 'SQL injection', Description: 'Intro', Tags: ['web'] }

  it('accepts a valid identity', () => {
    expect(identitySchema.safeParse(ok).success).toBe(true)
  })

  it.each([
    ['name too short', { ...ok, Name: 'ab' }],
    ['name too long', { ...ok, Name: 'a'.repeat(51) }],
    ['description too long', { ...ok, Description: 'a'.repeat(2001) }],
    ['empty tag', { ...ok, Tags: [''] }],
    ['tag too long', { ...ok, Tags: ['a'.repeat(31)] }],
    ['21 tags', { ...ok, Tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }],
  ])('rejects %s', (_label, input) => {
    expect(identitySchema.safeParse(input).success).toBe(false)
  })
})

// ── draftSchema ────────────────────────────────────────────────────────────────

/** Adds a gateway device to a topology (no DHCP unless asked) and returns it. */
function addGateway(topology: DraftFormValues['Variants'][number]['Topology'], type: 'vpn_gateway' | 'internet_gateway', name: string) {
  const gateway = emptyGateway(type, name)
  gateway.DHCP = false
  gateway.DHCPRanges = []
  topology.Devices.push(gateway)
  return gateway
}

function validDraft(): DraftFormValues {
  const draft = emptyDraft()
  draft.Variants[0].Tasks[0].Name = 'Find the flag'
  return draft
}

describe('draftSchema', () => {
  it('requires a value for a new secret, but allows an already stored secret to stay unchanged', () => {
    const draft = validDraft()
    const device = emptyDevice()
    device.Name = 'web'
    device.Bootstrap.Env = [{ Name: 'DB_PASS', Value: '', Secret: true, HasValue: false }]
    draft.Variants[0].Topology.Devices.push(device)
    expect(draftSchema.safeParse(draft).success).toBe(false)
    device.Bootstrap.Env[0].Value = 'new-secret'
    expect(draftSchema.safeParse(draft).success).toBe(true)
    device.Bootstrap.Env[0].Value = ''
    device.Bootstrap.Env[0].HasValue = true
    expect(draftSchema.safeParse(draft).success).toBe(true)
  })
  it('accepts a minimal valid draft (1 variant, 1 named task)', () => {
    const result = draftSchema.safeParse(validDraft())
    expect(result.success).toBe(true)
  })

  it('rejects a variant with zero tasks', () => {
    const draft = validDraft()
    draft.Variants[0].Tasks = []
    expect(draftSchema.safeParse(draft).success).toBe(false)
  })

  it('rejects unequal task counts across variants (superRefine)', () => {
    const draft = validDraft()
    const second = emptyVariant(2)
    second.Tasks = [emptyTask(), emptyTask()]
    second.Tasks.forEach((task, i) => { task.Name = `Task ${i + 1} ok` })
    draft.Variants.push(second)
    const result = draftSchema.safeParse(draft)
    expect(result.success).toBe(false)
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join('.'))
    expect(paths).toContain('Variants.1.Tasks')
  })

  it('accepts the elementary difficulty level', () => {
    const draft = validDraft()
    draft.Variants[0].Tasks[0].Difficulty = 'elementary'
    const result = draftSchema.safeParse(draft)
    if (!result.success) expect(result.error.issues.map((issue) => issue.path.join('.'))).not.toContain('Variants.0.Tasks.0.Difficulty')
  })

  it('rejects a difficulty that differs for the same task across variants', () => {
    const draft = validDraft()
    const second = emptyVariant(2)
    second.Tasks[0].Name = 'Alternate task'
    second.Tasks[0].Difficulty = 'hard'
    draft.Variants.push(second)
    const result = draftSchema.safeParse(draft)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain('Variants.1.Tasks.0.Difficulty')
  })

  it('rejects a second connection to the same port of a gateway', () => {
    const draft = validDraft()
    const gateway = addGateway(draft.Variants[0].Topology, 'vpn_gateway', 'attack')
    const device = emptyDevice()
    device.Name = 'web'
    draft.Variants[0].Topology.Devices.push(device)
    const connection = { Endpoints: [
      { Kind: 'device' as const, DeviceID: gateway.ID, Interface: 'eth0' },
      { Kind: 'device' as const, DeviceID: device.ID, Interface: 'eth0' },
    ] }
    draft.Variants[0].Topology.Connections = [connection, connection]
    const result = draftSchema.safeParse(draft)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toContain('admin.ex.val.portInUse')
  })

  it('rejects a task name shorter than 3 chars', () => {
    const draft = validDraft()
    draft.Variants[0].Tasks[0].Name = 'ab'
    expect(draftSchema.safeParse(draft).success).toBe(false)
  })

  it('rejects a blank flag value', () => {
    const draft = validDraft()
    draft.Variants[0].Tasks[0].Check.Answer.Values = ['  ']
    expect(draftSchema.safeParse(draft).success).toBe(false)
  })

  it.each([
    ['ICE{one}', true],
    ['ICE{a_b-123!}', true],
    ['FLAG{one}', false],
    ['ice{one}', false],
    ['ICE{}', false],
    ['ICE{one two}', false],
    ['ICE{one\ttwo}', false],
    ['ICE{one\u00a0two}', false],
    ['ICE{one{two}}', false],
    [' ICE{one}', false],
  ])('validates flag format %s', (flag, valid) => {
    const draft = validDraft()
    draft.Variants[0].Tasks[0].Check.Answer.Values = [flag]
    expect(draftSchema.safeParse(draft).success).toBe(valid)
  })

  it('accepts an empty flag list (random flag semantics)', () => {
    const draft = validDraft()
    draft.Variants[0].Tasks[0].Check.Answer.Values = []
    expect(draftSchema.safeParse(draft).success).toBe(true)
  })

  it('accepts a template candidate in a draft and rejects identical candidates', () => {
    const draft = validDraft()
    // A generated value must reach the lab: the answer is delivered through a device's variable.
    draft.Variants[0].Tasks[0].Key = 'scan'
    const device = emptyDevice()
    device.Name = 'web'
    device.Bootstrap.Env = [{ Name: 'FLAG', Value: '{{task.scan}}', Secret: false, HasValue: false }]
    draft.Variants[0].Topology.Devices.push(device)
    draft.Variants[0].Tasks[0].Check.Answer.Values = [String.raw`template:ICE{\d}`]
    expect(draftSchema.safeParse(draft).success).toBe(true)
    draft.Variants[0].Tasks[0].Check.Answer.Values.push(String.raw`template:ICE{\d}`)
    expect(draftSchema.safeParse(draft).success).toBe(false)
  })

  it('explains a literal-only template separately from malformed flag syntax', () => {
    const draft = validDraft()
    draft.Variants[0].Tasks[0].Check.Answer.Values = ['template:ICE{fixed}']
    const noRandom = draftSchema.safeParse(draft)
    expect(noRandom.success).toBe(false)
    if (!noRandom.success) expect(noRandom.error.issues.some((issue) => issue.message === 'admin.ex.val.flagTemplateNeedsRandom')).toBe(true)

    draft.Variants[0].Tasks[0].Check.Answer.Values = ['template:ICE{has space}']
    const malformed = draftSchema.safeParse(draft)
    expect(malformed.success).toBe(false)
    if (!malformed.success) expect(malformed.error.issues.some((issue) => issue.message === 'admin.ex.val.flagFormat')).toBe(true)
  })

  it('rejects a device name that is not a DNS label', () => {
    const draft = validDraft()
    const device = emptyDevice()
    device.Name = 'Bad_Name'
    draft.Variants[0].Topology.Devices.push(device)
    expect(draftSchema.safeParse(draft).success).toBe(false)
  })

  it('rejects a switch with interfaces', () => {
    const draft = validDraft()
    const device = emptyDevice()
    device.Name = 'sw1'
    device.Type = 'unmanaged-switch'
    // emptyDevice() adds one default interface — a switch must be "bare"
    expect(device.Interfaces.length).toBeGreaterThan(0)
    draft.Variants[0].Topology.Devices.push(device)
    expect(draftSchema.safeParse(draft).success).toBe(false)
  })

  it('accepts a bare switch', () => {
    const draft = validDraft()
    const device = emptyDevice()
    device.Name = 'sw1'
    device.Type = 'unmanaged-switch'
    device.Interfaces = []
    device.Bootstrap.Env = []
    device.Image = ''
    draft.Variants[0].Topology.Devices.push(device)
    expect(draftSchema.safeParse(draft).success).toBe(true)
  })



  it('requires an interface on a container, including before external exposure', () => {
    for (const type of ['node'] as const) {
      const draft = validDraft()
      const device = emptyDevice()
      device.Name = 'web'
      device.Type = type
      device.Interfaces = []
      draft.Variants[0].Topology.Devices.push(device)
      expect(draftSchema.safeParse(draft).success).toBe(false)
      device.Access = [emptyAccess('http')]
      expect(draftSchema.safeParse(draft).success).toBe(false)
      device.Interfaces = [emptyDevice().Interfaces[0]]
      expect(draftSchema.safeParse(draft).success).toBe(true)
    }
  })

  it('static IP requires at least one valid CIDR address', () => {
    const draft = validDraft()
    const device = emptyDevice()
    device.Name = 'web'
    device.Interfaces[0].IP = { Type: 'static', Addresses: [], Gateway: '', Routes: [] }
    draft.Variants[0].Topology.Devices.push(device)
    expect(draftSchema.safeParse(draft).success).toBe(false)

    device.Interfaces[0].IP.Addresses = ['10.0.0.2/24']
    expect(draftSchema.safeParse(draft).success).toBe(true)

    device.Interfaces[0].IP.Addresses = ['10.0.0.2']
    expect(draftSchema.safeParse(draft).success).toBe(false)
  })

  it('non-static IP must have no addresses and no gateway', () => {
    const draft = validDraft()
    const device = emptyDevice()
    device.Name = 'web'
    device.Interfaces[0].IP = { Type: 'dhcp', Addresses: ['10.0.0.2/24'], Gateway: '', Routes: [] }
    draft.Variants[0].Topology.Devices.push(device)
    expect(draftSchema.safeParse(draft).success).toBe(false)

    device.Interfaces[0].IP = { Type: 'dhcp', Addresses: [], Gateway: '10.0.0.1', Routes: [] }
    expect(draftSchema.safeParse(draft).success).toBe(false)

    device.Interfaces[0].IP = { Type: 'dhcp', Addresses: [], Gateway: '', Routes: [] }
    expect(draftSchema.safeParse(draft).success).toBe(true)
  })

  it('gateway must be a valid IPv4 when static', () => {
    const draft = validDraft()
    const device = emptyDevice()
    device.Name = 'web'
    device.Interfaces[0].IP = { Type: 'static', Addresses: ['10.0.0.2/24'], Gateway: 'not-an-ip', Routes: [] }
    draft.Variants[0].Topology.Devices.push(device)
    expect(draftSchema.safeParse(draft).success).toBe(false)

    device.Interfaces[0].IP.Gateway = '10.0.0.1'
    expect(draftSchema.safeParse(draft).success).toBe(true)
  })

  it('invalid MAC is rejected, empty MAC is fine', () => {
    const draft = validDraft()
    const device = emptyDevice()
    device.Name = 'web'
    device.Interfaces[0].MAC = 'zz:zz'
    draft.Variants[0].Topology.Devices.push(device)
    expect(draftSchema.safeParse(draft).success).toBe(false)

    device.Interfaces[0].MAC = ''
    expect(draftSchema.safeParse(draft).success).toBe(true)
  })

  it('web access requires port 1–65535', () => {
    const draft = validDraft()
    const device = emptyDevice()
    device.Name = 'web'
    device.Access = [{ ...emptyAccess('http'), Port: '0' }]
    draft.Variants[0].Topology.Devices.push(device)
    expect(draftSchema.safeParse(draft).success).toBe(false)

    device.Access[0].Port = '70000'
    expect(draftSchema.safeParse(draft).success).toBe(false)

    device.Access[0].Port = '8080'
    expect(draftSchema.safeParse(draft).success).toBe(true)
  })

  it('device endpoint requires a chosen device', () => {
    const draft = validDraft()
    const gateway = addGateway(draft.Variants[0].Topology, 'vpn_gateway', 'attack')
    const web = emptyDevice()
    web.Name = 'web' // container with a default eth0 interface
    draft.Variants[0].Topology.Devices.push(web)
    draft.Variants[0].Topology.Connections = [{
      Endpoints: [
        { Kind: 'device', DeviceID: '', Interface: '' },
        { Kind: 'device', DeviceID: gateway.ID, Interface: 'eth0' },
      ],
    }]
    expect(draftSchema.safeParse(draft).success).toBe(false)

    draft.Variants[0].Topology.Connections[0].Endpoints[0] =
      { Kind: 'device', DeviceID: web.ID, Interface: 'eth0' }
    expect(draftSchema.safeParse(draft).success).toBe(true)
  })

  it('a gateway endpoint is an ordinary device endpoint: it must name an existing gateway', () => {
    const draft = validDraft()
    const gateway = addGateway(draft.Variants[0].Topology, 'vpn_gateway', 'attack')
    const web = emptyDevice()
    web.Name = 'web'
    draft.Variants[0].Topology.Devices.push(web)
    draft.Variants[0].Topology.Connections = [{
      Endpoints: [
        { Kind: 'device', DeviceID: web.ID, Interface: 'eth0' },
        { Kind: 'device', DeviceID: 'no-such-gateway', Interface: 'eth0' },
      ],
    }]
    expect(draftSchema.safeParse(draft).success).toBe(false)

    draft.Variants[0].Topology.Connections[0].Endpoints[1] = { Kind: 'device', DeviceID: gateway.ID, Interface: 'eth0' }
    expect(draftSchema.safeParse(draft).success).toBe(true)
  })

  it('allows only the named eth0 port on a gateway connection', () => {
    const draft = validDraft()
    const gateway = addGateway(draft.Variants[0].Topology, 'vpn_gateway', 'attack')
    const host = emptyDevice()
    host.Name = 'host'
    draft.Variants[0].Topology.Devices.push(host)
    draft.Variants[0].Topology.Connections = [{ Endpoints: [
      { Kind: 'device', DeviceID: gateway.ID, Interface: 'eth0' },
      { Kind: 'device', DeviceID: host.ID, Interface: 'eth0' },
    ] }]
    expect(draftSchema.safeParse(draft).success).toBe(true)
    draft.Variants[0].Topology.Connections[0].Endpoints[0].Interface = ''
    expect(draftSchema.safeParse(draft).success).toBe(false)
    draft.Variants[0].Topology.Connections[0].Endpoints[0].Interface = 'eth1'
    expect(draftSchema.safeParse(draft).success).toBe(false)
  })

  it('rejects a device endpoint whose device is not in the topology (endpointUnresolved)', () => {
    const draft = validDraft()
    const web = emptyDevice()
    web.Name = 'web'
    draft.Variants[0].Topology.Devices.push(web)
    draft.Variants[0].Topology.Connections = [{
      Endpoints: [
        { Kind: 'device', DeviceID: 'missing-uuid', Interface: 'eth0' },
        { Kind: 'device', DeviceID: web.ID, Interface: 'eth0' },
      ],
    }]
    const result = draftSchema.safeParse(draft)
    expect(result.success).toBe(false)
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join('.'))
    expect(paths).toContain('Variants.0.Topology.Connections.0.Endpoints.0.DeviceID')
  })

  it('rejects a container endpoint whose interface is not on the device (endpointUnresolved)', () => {
    const draft = validDraft()
    const web = emptyDevice()
    web.Name = 'web' // container with only eth0
    draft.Variants[0].Topology.Devices.push(web)
    const gateway = addGateway(draft.Variants[0].Topology, 'vpn_gateway', 'attack')
    draft.Variants[0].Topology.Connections = [{
      Endpoints: [
        { Kind: 'device', DeviceID: web.ID, Interface: 'eth9' },
        { Kind: 'device', DeviceID: gateway.ID, Interface: 'eth0' },
      ],
    }]
    const result = draftSchema.safeParse(draft)
    expect(result.success).toBe(false)
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join('.'))
    expect(paths).toContain('Variants.0.Topology.Connections.0.Endpoints.0.Interface')
  })

  it('accepts resolved endpoints: device+interface, switch port, and the ports of gateways', () => {
    const draft = validDraft()
    const vpn = addGateway(draft.Variants[0].Topology, 'vpn_gateway', 'attack')
    const internet = addGateway(draft.Variants[0].Topology, 'internet_gateway', 'out')
    const web = emptyDevice()
    web.Name = 'web' // container with eth0
    const sw = emptyDevice()
    sw.Name = 'sw1'
    sw.Type = 'unmanaged-switch'
    sw.Interfaces = []
    draft.Variants[0].Topology.Devices.push(web, sw)
    draft.Variants[0].Topology.Connections = [
      {
        Endpoints: [
          { Kind: 'device', DeviceID: web.ID, Interface: 'eth0' },
          { Kind: 'device', DeviceID: sw.ID, Interface: 'GigabitEthernet0/1' },
        ],
      },
      {
        Endpoints: [
          { Kind: 'device', DeviceID: vpn.ID, Interface: 'eth0' },
          { Kind: 'device', DeviceID: internet.ID, Interface: 'eth0' },
        ],
      },
    ]
    // Two gateways joined directly are one network: the second is refused (see the gateway tests).
    expect(draftSchema.safeParse(draft).success).toBe(false)
    draft.Variants[0].Topology.Connections.pop()
    expect(draftSchema.safeParse(draft).success).toBe(true)
  })

  it('rejects a reused switch port at its second endpoint', () => {
    const draft = validDraft()
    const sw = emptyDevice()
    sw.Name = 'sw1'
    sw.Type = 'unmanaged-switch'
    sw.Interfaces = []
    const first = emptyDevice()
    first.Name = 'first'
    const second = emptyDevice()
    second.Name = 'second'
    draft.Variants[0].Topology.Devices = [sw, first, second]
    draft.Variants[0].Topology.Connections = [
      { Endpoints: [{ Kind: 'device', DeviceID: sw.ID, Interface: 'GigabitEthernet0/1' }, { Kind: 'device', DeviceID: first.ID, Interface: 'eth0' }] },
      { Endpoints: [{ Kind: 'device', DeviceID: sw.ID, Interface: 'GigabitEthernet0/1' }, { Kind: 'device', DeviceID: second.ID, Interface: 'eth0' }] },
    ]
    const result = draftSchema.safeParse(draft)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((issue) => issue.path.join('.')))
      .toContain('Variants.0.Topology.Connections.1.Endpoints.0.Interface')
  })

  it('ip placeholder requires a known IPReference; external.link requires a device', () => {
    const draft = validDraft()
    draft.Variants[0].Tasks[0].Placeholders = [{
      Key: 'ph_test',
      Kind: 'ip', IPReference: 'bogus', Gateway: '', Octets1to3: '', LastOctet: 0, ShowMask: false, DeviceName: '',
    }]
    expect(draftSchema.safeParse(draft).success).toBe(false)

    draft.Variants[0].Tasks[0].Placeholders = [{
      Key: 'ph_test',
      Kind: 'external.link', IPReference: '', Gateway: '', Octets1to3: '', LastOctet: 0, ShowMask: false, DeviceName: '',
    }]
    expect(draftSchema.safeParse(draft).success).toBe(false)

    draft.Variants[0].Tasks[0].Placeholders = [{
      Key: 'ph_test',
      Kind: 'ip', IPReference: 'gateway', Gateway: 'attack', Octets1to3: '', LastOctet: 13, ShowMask: true, DeviceName: '',
    }]
    expect(draftSchema.safeParse(draft).success).toBe(true)
  })

  it('ip link form validates scheme, port, path and mask', () => {
    const draft = validDraft()
    const ip = { Key: 'ph_link', Kind: 'ip' as const, IPReference: 'gateway', Gateway: 'attack', Octets1to3: '', LastOctet: 5, ShowMask: false, DeviceName: '', AsLink: true, Scheme: 'https', PortText: '8443', Path: '/a?b=1' }
    const ok = (p: Partial<typeof ip>) => { draft.Variants[0].Tasks[0].Placeholders = [{ ...ip, ...p }]; return draftSchema.safeParse(draft).success }
    expect(ok({})).toBe(true)
    expect(ok({ PortText: '', Path: '' })).toBe(true)
    expect(ok({ Scheme: 'ftp' })).toBe(false)
    expect(ok({ PortText: '0' })).toBe(false)
    expect(ok({ PortText: '65536' })).toBe(false)
    expect(ok({ Path: 'admin' })).toBe(false)
    expect(ok({ Path: '/a b' })).toBe(false)
    expect(ok({ ShowMask: true })).toBe(false)
    expect(ok({ AsLink: false, Scheme: 'ftp', PortText: '0' })).toBe(true) // link fields are ignored without the switch
  })

  it('ip link form round-trips to the DTO and back', () => {
    const draft = validDraft()
    draft.Variants[0].Tasks[0].Placeholders = [{ Key: 'ph_link', Kind: 'ip', IPReference: 'gateway', Gateway: 'attack', Octets1to3: '', LastOctet: 5, ShowMask: true, DeviceName: '', AsLink: true, Scheme: 'https', PortText: '8443', Path: '/x' }]
    const dto = toSaveDraftInput(draft).Variants[0].Tasks[0].Placeholders
    expect(dto).toEqual([{ Key: 'ph_link', Kind: 'ip', IPReference: 'gateway', Gateway: 'attack', LastOctet: 5, ShowMask: false, AsLink: true, Scheme: 'https', Port: 8443, Path: '/x' }])
    draft.Variants[0].Tasks[0].Placeholders = [{ Key: 'ph_plain', Kind: 'ip', IPReference: 'gateway', Gateway: 'attack', Octets1to3: '', LastOctet: 5, ShowMask: false, DeviceName: '', AsLink: false, Scheme: 'http', PortText: '', Path: '' }]
    const plain = toSaveDraftInput(draft).Variants[0].Tasks[0].Placeholders
    expect(plain).toEqual([{ Key: 'ph_plain', Kind: 'ip', IPReference: 'gateway', Gateway: 'attack', LastOctet: 5, ShowMask: false }])
  })
})

// ── Factories ──────────────────────────────────────────────────────────────────

describe('factories', () => {
  it('emptyDevice generates a client-side uuid', () => {
    const a = emptyDevice()
    const b = emptyDevice()
    expect(a.ID).toMatch(/^[0-9a-f-]{36}$/)
    expect(a.ID).not.toBe(b.ID)
  })

  it('emptyDraft has one variant with one task', () => {
    const draft = emptyDraft()
    expect(draft.Variants).toHaveLength(1)
    expect(draft.Variants[0].Tasks).toHaveLength(1)
    expect(draft.Variants[0].Index).toBe(1)
  })
})

it('reopens and saves all typed static references without concrete CIDRs', () => {
  const version = loadedVersion()
  version.Variants[0].Topology.Devices[0].Interfaces[0].IP = {
    Type: 'static', Addresses: [], AddressRef: { Gateway: 'attack', Host: 10 },
    Gateway: '', GatewayRef: { Gateway: 'attack', Host: 1 },
    Routes: [{ Dst: '', DstRef: { Gateway: 'out' }, Via: '', ViaRef: { Gateway: 'attack', Host: 1 } }],
  }
  const form = toDraftFormValues(version)
  const saved = toSaveDraftInput(form).Variants[0].Topology.Devices?.find((device) => device.Name === 'web')?.Interfaces?.[0].IP
  expect(saved).toMatchObject({
    AddressRef: { Gateway: 'attack', Host: 10 },
    GatewayRef: { Gateway: 'attack', Host: 1 },
    Routes: [{ DstRef: { Gateway: 'out' }, ViaRef: { Gateway: 'attack', Host: 1 } }],
  })
  expect(JSON.stringify(saved)).not.toContain('10.0.0.')
})

// ── Serialization: form ↔ version ────────────────────────────────────────────────

const DEV_ID = '99999999-8888-7777-6666-555555555555'
const GW_ID = '99999999-8888-7777-6666-555555555556'

function loadedVersion(): Version {
  return {
    Resources: null,
    Elevation: null,
    ID: 'v1',
    ExerciseID: 'e1',
    Status: 'draft',
    AdminNote: 'wip',
    Label: '',
    CreatedAt: '2026-01-01T00:00:00Z',
    CreatedBy: null,
    PublishedAt: null,
    Variants: [{
      ID: 'var1',
      Index: 1,
      Note: '', Weight: 1, LinkedTo: '',
      Tasks: [{
        ID: 'task1',
        Name: 'Find the flag',
        Description: { root: {} },
        Difficulty: 'medium',
        Key: 'scan',
        Requires: [],
        Check: { Answer: { Type: 'flag', Values: ['ICE{x}'] } },
        Attachments: [{ FileID: 'f1', Name: 'notes.pdf' }],
        Placeholders: [{ Kind: 'gateway.subnet', Gateway: 'attack' }],
        Hints: [],
      }],
      Topology: {
        Variables: [],
        Devices: [{
          ID: DEV_ID,
          Name: 'web',
          Type: 'node',
          SecurityPreset: '',
          Image: 'nginx:1.27',
          Profile: 'container',
          ResourcePreset: "",
          Interfaces: [{ Name: 'eth0', MAC: '', IP: { Type: 'static', Addresses: ['10.0.0.2/24'], Gateway: '10.0.0.1', Routes: [] } }],
          Access: [{ Kind: 'http', Port: 8080, Protocol: 'https' }],
          Command: [], Args: [], System: 'linux', Hardware: 'fast',
          Bootstrap: { Timeout: '', Env: [{ Name: 'DB_PASS', Value: '', Secret: true, HasValue: true }], Files: [], Script: '', Interpreter: '' },
          DHCP: false, DHCPRanges: [], DNS: '', ReverseConnections: false,
        }, normalizedDevice({ ID: GW_ID, Name: 'attack', Type: 'vpn_gateway', DHCP: true, DHCPRanges: [{ Start: 100, End: 200 }] })],
        Connections: [{
          Endpoints: [
            { Kind: 'device', DeviceID: GW_ID, Interface: 'eth0' },
            { Kind: 'device', DeviceID: DEV_ID, Interface: 'eth0' },
          ],
        }],
        VisualRender: null,
      },
    }],
  }
}

describe('toDraftFormValues', () => {
  it('keeps the named gateway port when reopening a connection', () => {
    const values = toDraftFormValues(loadedVersion())
    expect(values.Variants[0].Topology.Connections[0].Endpoints[0].Interface).toBe('eth0')
  })
  it('keeps dynamic network settings and canvas positions when reopening a draft', () => {
    const loaded = loadedVersion()
    loaded.Variants[0].Topology.VisualRender = { version: 1, positions: { [DEV_ID]: { x: 0.3, y: 0.4 } } }
    loaded.Variants[0].Topology.Devices[0].SecurityPreset = 'extended'
    loaded.Variants[0].Topology.Devices[0].Interfaces[0].IP.Type = 'dhcp-preset'
    loaded.Variants[0].Topology.Devices[0].Interfaces[0].IP.Addresses = []
    loaded.Variants[0].Topology.Devices[0].Interfaces[0].IP.Gateway = ''
    const values = toDraftFormValues(loaded)
    expect(values.Variants[0].Topology.VisualRender).toEqual(loaded.Variants[0].Topology.VisualRender)
    expect(values.Variants[0].Topology.Devices[0].SecurityPreset).toBe('extended')
    expect(values.Variants[0].Topology.Devices[0].Interfaces[0].IP.Type).toBe('dhcp-preset')
    const saved = toSaveDraftInput(values)
    expect(saved.Variants[0].Topology.VisualRender).toEqual(loaded.Variants[0].Topology.VisualRender)
    expect(saved.Variants[0].Topology.Devices?.[0].SecurityPreset).toBe('extended')
    expect(saved.Variants[0].Topology.Devices?.[0].Interfaces?.[0].IP.Type).toBe('dhcp-preset')
  })
  it('maps a loaded version into form values (access list, check)', () => {
    const values = toDraftFormValues(loadedVersion())
    expect(values.AdminNote).toBe('wip')
    expect(values).not.toHaveProperty('RegenerateFlagsOnPublish')
    expect(values.Variants[0].ID).toBe('var1')
    expect(values.Variants[0].Tasks[0].ID).toBe('task1')
    expect(values.Variants[0].Tasks[0].Placeholders[0].Key).toBe('ph_legacy_0_0_0')
    expect(values.Variants[0].Topology.Devices[0].Access)
      .toEqual([{ Kind: 'http', Port: '8080', Protocol: 'https', Command: '', User: '' }])
    expect(values.Variants[0].Tasks[0].Check).toMatchObject({ Kind: 'answer', Answer: { Type: 'flag', Values: ['ICE{x}'] } })
  })

  it('null version → empty draft (1 variant, 1 task)', () => {
    const values = toDraftFormValues(null)
    expect(values.Variants).toHaveLength(1)
    expect(values.Variants[0].Tasks).toHaveLength(1)
  })
})

describe('content hashes', () => {
  it('reads ValueGroup (secrets only) and ContentHash, and never sends them back', () => {
    const variant = normalizeVariant({ Index: 1, Tasks: [{ Name: 'Scan', Difficulty: 'easy', Attachments: [{ FileID: 'f1', Name: 'a.pcap', ContentHash: 'c1' }] }],
      Topology: {
        Devices: [{ ID: 'd1', Name: 'web', Type: 'node', Interfaces: [], Bootstrap: { Env: [{ Name: 'FLAG', Secret: true, HasValue: true, ValueGroup: 2 }, { Name: 'MODE', Value: 'ctf', Secret: false, ValueGroup: 5 }] } }] } })
    expect(variant.Topology.Devices[0].Bootstrap.Env.map((env) => env.ValueGroup)).toEqual([2, undefined])
    expect(variant.Tasks[0].Attachments).toEqual([{ FileID: 'f1', Name: 'a.pcap', ContentHash: 'c1' }])
    const draft = emptyDraft()
    draft.Variants[0].Tasks[0].Attachments = variant.Tasks[0].Attachments
    draft.Variants[0].Topology.Devices = [{ ...emptyDevice(), Name: 'web', Bootstrap: { ...emptyBootstrap(), Env: variant.Topology.Devices[0].Bootstrap.Env } }]
    const sent = toSaveDraftInput(draft).Variants[0]
    expect(sent.Tasks[0].Attachments).toEqual([{ FileID: 'f1', Name: 'a.pcap' }])
    expect(sent.Topology.Devices?.[0].Bootstrap?.Env?.every((env) => !('ValueGroup' in env))).toBe(true)
  })
})

describe('environment variable limit', () => {
  it('allows 64 variables per device and puts a 65th on the list', () => {
    const draft = validDraft()
    const device = emptyDevice()
    device.Name = 'web'
    device.Bootstrap.Env = Array.from({ length: 64 }, (_, index) => ({ Name: `V${index}`, Value: 'x', Secret: false, HasValue: false }))
    draft.Variants[0].Topology.Devices = [device]
    expect(draftSchema.safeParse(draft).success).toBe(true)
    device.Bootstrap.Env.push({ Name: 'V64', Value: 'x', Secret: false, HasValue: false })
    const result = draftSchema.safeParse(draft)
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain('Variants.0.Topology.Devices.0.Bootstrap.Env')
  })
})

describe('own images of a linked variant', () => {
  it('reads ImageOverrides only for a linked variant and sends the full list for a linked variant only', () => {
    const topology = {}
    expect(normalizeVariant({ Index: 2, LinkedTo: 'b', ImageOverrides: [{ DeviceID: 'd1', Image: 'x' }], Tasks: [], Topology: topology }).ImageOverrides).toEqual([{ DeviceID: 'd1', Image: 'x' }])
    expect(normalizeVariant({ Index: 2, Tasks: [], Topology: topology }).ImageOverrides).toEqual([])
    const draft = emptyDraft()
    draft.Variants[0].ID = 'b'
    draft.Variants[0].Topology.Devices = [{ ...emptyDevice(), ID: 'd1', Name: 'web', Image: 'nginx:1.27' }, { ...emptyDevice(), ID: 'd2', Name: 'db', Image: 'postgres:16' }]
    const linked = structuredClone(draft.Variants[0])
    Object.assign(linked, { ID: 'l', LinkedTo: 'b' })
    draft.Variants.push(linked)
    const independent = structuredClone(draft.Variants[0])
    Object.assign(independent, { ID: 'i', ImageOverrides: [{ DeviceID: 'd1', Image: 'stale' }] })
    independent.Topology.Devices[0].Image = 'nginx:1.28'
    draft.Variants.push(independent)
    let sent = toSaveDraftInput(draft).Variants
    expect(sent[1].ImageOverrides).toEqual([])
    expect(sent[0]).not.toHaveProperty('ImageOverrides')
    expect(sent[2]).not.toHaveProperty('ImageOverrides')
    draft.Variants[1].ImageOverrides = [{ DeviceID: 'd2', Image: 'postgres:17' }]
    sent = toSaveDraftInput(draft).Variants
    expect(sent[1].ImageOverrides).toEqual([{ DeviceID: 'd2', Image: 'postgres:17' }])
  })
})

describe('variant weight', () => {
  it('reads absent, 0 or garbage as 1 and keeps a stored weight', () => {
    expect([undefined, 0, -2, 1.5, 3].map((weight) => normalizeVariant({ Index: 1, Tasks: [], Topology: {}, ...(weight === undefined ? {} : { Weight: weight }) }).Weight)).toEqual([1, 1, 1, 1, 3])
  })

  it('sends a weight above 1 and leaves the default 1 out', () => {
    const draft = emptyDraft()
    expect(toSaveDraftInput(draft).Variants[0]).not.toHaveProperty('Weight')
    draft.Variants[0].Weight = 7
    expect(toSaveDraftInput(draft).Variants[0].Weight).toBe(7)
    draft.Variants[0].Weight = Number.NaN
    expect(toSaveDraftInput(draft).Variants[0]).not.toHaveProperty('Weight')
  })

  it('accepts a whole number 1..100 and puts the error on the weight', () => {
    for (const [weight, ok] of [[1, true], [100, true], [0, false], [101, false], [2.5, false], [Number.NaN, false]] as const) {
      const draft = validDraft()
      draft.Variants[0].Weight = weight
      const result = draftSchema.safeParse(draft)
      expect(result.success).toBe(ok)
      if (!result.success) expect(result.error.issues[0].path).toEqual(['Variants', 0, 'Weight'])
    }
  })
})

describe('toSaveDraftInput', () => {
  it('a gateway goes out as a device with only its own keys and its port is an ordinary endpoint', () => {
    const draft = emptyDraft()
    const vpn = emptyGateway('vpn_gateway', 'attack')
    vpn.ReverseConnections = true
    const internet = emptyGateway('internet_gateway', 'out')
    internet.DNS = '1.1.1.1'
    internet.DHCP = false
    const host = emptyDevice()
    host.Name = 'host'
    draft.Variants[0].Topology.Devices = [vpn, internet, host]
    draft.Variants[0].Topology.Connections = [{ Endpoints: [
      { Kind: 'device', DeviceID: vpn.ID, Interface: 'eth0' },
      { Kind: 'device', DeviceID: host.ID, Interface: 'eth0' },
    ] }]
    const sent = toSaveDraftInput(draft).Variants[0].Topology
    expect(sent.Devices?.[0]).toEqual({ ID: vpn.ID, Name: 'attack', Type: 'vpn_gateway', DHCP: true, DHCPRanges: [{ Start: 2, End: 254 }], ReverseConnections: true })
    expect(sent.Devices?.[1]).toEqual({ ID: internet.ID, Name: 'out', Type: 'internet_gateway', DHCP: false, DNS: '1.1.1.1' })
    expect(sent).not.toHaveProperty('VPN')
    expect(sent).not.toHaveProperty('Internet')
    expect(sent.Connections?.[0].Endpoints[0]).toEqual({ Kind: 'device', DeviceID: vpn.ID, Interface: 'eth0' })
  })
  it('sends the mask choice for a subnet placeholder to the API', () => {
    const draft = emptyDraft()
    draft.Variants[0].Tasks[0].Placeholders = [{ Key: 'ph_subnet', Kind: 'gateway.subnet', IPReference: '', Gateway: 'attack', Octets1to3: '', LastOctet: 0, ShowMask: true, DeviceName: '' }]
    expect(toSaveDraftInput(draft).Variants[0].Tasks[0].Placeholders).toEqual([{ Key: 'ph_subnet', Kind: 'gateway.subnet', Gateway: 'attack', ShowMask: true }])
  })

  it('round-trips a loaded version with saved IDs and an explicit gateway port', () => {
    const input = toSaveDraftInput(toDraftFormValues(loadedVersion()))
    expect(input).toEqual({
      AdminNote: 'wip',
      Variants: [{
        ID: 'var1',
        Index: 1,
        Tasks: [{
          ID: 'task1',
          Name: 'Find the flag',
          Description: { root: {} },
          Difficulty: 'medium',
          Key: 'scan',
          Check: { Answer: { Type: 'flag', Values: ['ICE{x}'] } },
          Attachments: [{ FileID: 'f1', Name: 'notes.pdf' }],
          Placeholders: [{ Key: 'ph_legacy_0_0_0', Kind: 'gateway.subnet', Gateway: 'attack' }],
          Hints: [],
        }],
        Topology: {
          Devices: [{
            ID: DEV_ID,
            Name: 'web',
            Type: 'node',
            Image: 'nginx:1.27',
            Interfaces: [{ Name: 'eth0', IP: { Type: 'static', Addresses: ['10.0.0.2/24'], Gateway: '10.0.0.1' } }],
            Access: [{ Kind: 'http', Port: 8080, Protocol: 'https' }],
            Bootstrap: { Env: [{ Name: 'DB_PASS', Value: '', Secret: true }] },
          }, { ID: GW_ID, Name: 'attack', Type: 'vpn_gateway', DHCP: true, DHCPRanges: [{ Start: 100, End: 200 }] }],
          Connections: [{
            Endpoints: [
              { Kind: 'device', DeviceID: GW_ID, Interface: 'eth0' },
              { Kind: 'device', DeviceID: DEV_ID, Interface: 'eth0' },
            ],
          }],
        },
      }],
    })
  })

  it('new entities go out without an ID (except devices), Index is renumbered', () => {
    const draft = emptyDraft()
    draft.Variants[0].Tasks[0].Name = 'New task'
    const second = emptyVariant(99) // decorative Index is ignored
    second.Tasks[0].Name = 'New task'
    draft.Variants.push(second)
    const input = toSaveDraftInput(draft)
    expect(input.Variants[0].ID).toBeUndefined()
    expect(input.Variants[0].Tasks[0].ID).toBeUndefined()
    expect(input.Variants[0].Index).toBe(1)
    expect(input.Variants[1].Index).toBe(2)
  })

  it('a microVM or a VM sends no persistence even if the draft still holds it', () => {
    const draft = emptyDraft()
    draft.Variants[0].Tasks[0].Name = 'New task'
    const micro = emptyDevice()
    micro.Name = 'micro'
    micro.Profile = 'microvm'
    micro.Persistence = { Enabled: true, Debounce: '5s' }
    draft.Variants[0].Topology.Devices = [micro]
    expect(toSaveDraftInput(draft).Variants[0].Topology.Devices![0].Persistence).toBeUndefined()
  })

  it('persistence goes out only when enabled and keeps a loaded debounce', () => {
    const draft = emptyDraft()
    draft.Variants[0].Tasks[0].Name = 'New task'
    const off = emptyDevice()
    off.Name = 'off'
    const on = emptyDevice()
    on.Name = 'on'
    on.Persistence = { Enabled: true, Debounce: '5s' }
    const plain = emptyDevice()
    plain.Name = 'plain'
    plain.Persistence = { Enabled: true, Debounce: '' }
    draft.Variants[0].Topology.Devices = [off, on, plain]
    const [offDTO, onDTO, plainDTO] = toSaveDraftInput(draft).Variants[0].Topology.Devices!
    expect(offDTO.Persistence).toBeUndefined()
    expect(onDTO.Persistence).toEqual({ Enabled: true, Debounce: '5s' })
    expect(plainDTO.Persistence).toEqual({ Enabled: true })
  })

  it('WaitReadyFile goes out only when on', () => {
    const draft = emptyDraft()
    draft.Variants[0].Tasks[0].Name = 'New task'
    const off = emptyDevice()
    off.Name = 'off'
    const on = emptyDevice()
    on.Name = 'on'
    on.WaitReadyFile = true
    draft.Variants[0].Topology.Devices = [off, on]
    const [offDTO, onDTO] = toSaveDraftInput(draft).Variants[0].Topology.Devices!
    expect(offDTO.WaitReadyFile).toBeUndefined()
    expect(onDTO.WaitReadyFile).toBe(true)
  })

  it('a switch with WaitReadyFile is refused like any other setting a bare device cannot have', () => {
    const sw = emptyDevice()
    sw.Name = 'sw1'
    sw.Type = 'unmanaged-switch'
    sw.Interfaces = []
    sw.WaitReadyFile = true
    const draft = emptyDraft()
    draft.Variants[0].Topology.Devices = [sw]
    expect(draftSchema.safeParse(draft).success).toBe(false)
  })

  it('a bare switch goes out bare, disabled External is omitted, null Description is omitted', () => {
    const draft = emptyDraft()
    draft.Variants[0].Tasks[0].Name = 'New task'
    const sw = emptyDevice()
    sw.Name = 'sw1'
    sw.Type = 'unmanaged-switch'
    sw.Interfaces = []
    const web = emptyDevice()
    web.Name = 'web'
    draft.Variants[0].Topology.Devices = [sw, web]
    const input = toSaveDraftInput(draft)
    const [swDTO, webDTO] = input.Variants[0].Topology.Devices!
    expect(swDTO).toEqual({ ID: sw.ID, Name: 'sw1', Type: 'unmanaged-switch' })
    expect(webDTO.Access).toBeUndefined()
    expect(webDTO.Interfaces![0].MAC).toBeUndefined()
    expect(webDTO.Interfaces![0].IP).toEqual({ Type: 'dhcp' })
    expect(input.Variants[0].Tasks[0].Description).toBeUndefined()
    expect(input.Variants[0].Tasks[0].Check).toEqual({ Answer: { Type: 'flag' } })
  })

  it('has no flag-regeneration switch in drafts or save requests', () => {
    expect(emptyDraft()).not.toHaveProperty('RegenerateFlagsOnPublish')
    expect(toSaveDraftInput(emptyDraft())).not.toHaveProperty('RegenerateFlagsOnPublish')
  })
})

describe('linked variants in the form model', () => {
  it('toSaveDraftInput sends LinkedTo and CopyOf only when set', () => {
    const draft = validDraft()
    draft.Variants.push({ ...emptyVariant(2), ID: '', LinkedTo: 'base-id', CopyOf: 'src-id' })
    const [plain, linked] = toSaveDraftInput(draft).Variants
    expect(plain).not.toHaveProperty('LinkedTo')
    expect(plain).not.toHaveProperty('CopyOf')
    expect(linked.LinkedTo).toBe('base-id')
    expect(linked.CopyOf).toBe('src-id')
  })
  it('toSaveDraftInput drops CopyOf once the copy is saved, so its payload matches the stored one', () => {
    const draft = validDraft()
    draft.Variants.push({ ...emptyVariant(2), ID: 'v2', CopyOf: 'src-id' })
    expect(toSaveDraftInput(draft).Variants[1]).not.toHaveProperty('CopyOf')
  })
  it('toDraftFormValues reads LinkedTo', () => {
    const version = loadedVersion()
    version.Variants[0].LinkedTo = 'base-id'
    const values = toDraftFormValues(version)
    expect(values.Variants[0].LinkedTo).toBe('base-id')
    expect(emptyVariant(1).LinkedTo).toBe('')
  })
  it('draftSchema flags a duplicate flag in a linked variant at the repeated flag', () => {
    const draft = validDraft()
    draft.Variants[0].ID = 'b'
    draft.Variants[0].Tasks[0].Check.Answer.Values = ['ICE{same}']
    const linked = emptyVariant(2)
    linked.ID = 'l'
    linked.LinkedTo = 'b'
    linked.Tasks[0].Name = 'Find the flag'
    linked.Tasks[0].Check.Answer.Values = ['ICE{own}', 'ICE{same}']
    draft.Variants.push(linked)
    const result = draftSchema.safeParse(draft)
    expect(result.success).toBe(false)
    const issue = !result.success && result.error.issues.find((i) => i.message === 'admin.ex.val.linkedFlagDuplicate')
    expect(issue && issue.path).toEqual(['Variants', 1, 'Tasks', 0, 'Check', 'Answer', 'Values', 1])
  })
})

describe('gateways as devices', () => {
  const issues = (draft: DraftFormValues) => {
    const result = draftSchema.safeParse(draft)
    return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join('.')}|${issue.message}`)
  }
  const topologyOf = (draft: DraftFormValues) => draft.Variants[0].Topology
  const link = (topology: DraftFormValues['Variants'][number]['Topology'], a: { ID: string }, ai: string, b: { ID: string }, bi: string) =>
    topology.Connections.push({ Endpoints: [{ Kind: 'device', DeviceID: a.ID, Interface: ai }, { Kind: 'device', DeviceID: b.ID, Interface: bi }] })
  const switchOf = (name: string) => ({ ...emptyDevice(), Name: name, Type: 'unmanaged-switch' as const, Interfaces: [] })

  it('allows a lab without a gateway and several gateways of one kind', () => {
    const draft = validDraft()
    expect(issues(draft)).toEqual([])
    addGateway(topologyOf(draft), 'vpn_gateway', 'attack')
    addGateway(topologyOf(draft), 'vpn_gateway', 'attack-2')
    addGateway(topologyOf(draft), 'internet_gateway', 'out')
    addGateway(topologyOf(draft), 'internet_gateway', 'out-2')
    expect(issues(draft)).toEqual([])
  })

  it('names a gateway like a device: DNS label, unique among all devices and gateways, no reserved names', () => {
    const draft = validDraft()
    const gateway = addGateway(topologyOf(draft), 'vpn_gateway', 'vpn')
    expect(issues(draft)).toEqual([])
    gateway.Name = 'Bad Name'
    expect(issues(draft).some((issue) => issue.startsWith('Variants.0.Topology.Devices.0.Name|'))).toBe(true)
    gateway.Name = 'a'.repeat(36)
    expect(issues(draft).some((issue) => issue.startsWith('Variants.0.Topology.Devices.0.Name|'))).toBe(true)
    gateway.Name = 'web'
    const web = emptyDevice()
    web.Name = 'web'
    topologyOf(draft).Devices.push(web)
    expect(issues(draft)).toContain('Variants.0.Topology.Devices.1.Name|ed.c.val.deviceNameDuplicate')
  })

  it('keeps the settings of the kind: DNS only on an Internet gateway, reverse connections only on a VPN gateway, DHCP needs ranges', () => {
    const draft = validDraft()
    const vpn = addGateway(topologyOf(draft), 'vpn_gateway', 'attack')
    const internet = addGateway(topologyOf(draft), 'internet_gateway', 'out')
    vpn.DNS = '1.1.1.1'
    expect(issues(draft)).toContain('Variants.0.Topology.Devices.0.DNS|admin.ex.val.internetDns')
    vpn.DNS = ''
    internet.ReverseConnections = true
    expect(issues(draft)).toContain('Variants.0.Topology.Devices.1.ReverseConnections|ed.c.val.reverseNeedsVpn')
    internet.ReverseConnections = false
    internet.DNS = '2001:db8::1'
    expect(issues(draft)).toContain('Variants.0.Topology.Devices.1.DNS|admin.ex.val.internetDns')
    internet.DNS = '1.1.1.1'
    vpn.DHCP = true
    expect(issues(draft)).toContain('Variants.0.Topology.Devices.0.DHCPRanges|admin.ex.val.dhcpRangesRequired')
    vpn.DHCPRanges = [{ Start: 2, End: 254 }]
    expect(issues(draft)).toEqual([])
  })

  it('refuses gateway keys on another device and node keys on a gateway', () => {
    const draft = validDraft()
    const web = emptyDevice()
    web.Name = 'web'
    web.DHCP = true
    topologyOf(draft).Devices.push(web)
    expect(issues(draft)).toContain('Variants.0.Topology.Devices.0.Type|ed.c.val.gatewayKeysOnly')
    web.DHCP = false
    const gateway = addGateway(topologyOf(draft), 'vpn_gateway', 'attack')
    gateway.Image = 'nginx:1.27'
    expect(issues(draft)).toContain('Variants.0.Topology.Devices.1.Type|admin.ex.val.forwardingBare')
  })

  it('refuses a second gateway in one network (switch and hub join their ports) and names the first one', () => {
    const draft = validDraft()
    const topology = topologyOf(draft)
    const first = addGateway(topology, 'vpn_gateway', 'attack')
    const second = addGateway(topology, 'internet_gateway', 'out')
    const sw = switchOf('sw1')
    topology.Devices.push(sw)
    link(topology, first, 'eth0', sw, 'GigabitEthernet0/1')
    expect(gatewayNetworkConflicts(topology)).toEqual([])
    link(topology, second, 'eth0', sw, 'GigabitEthernet0/2')
    expect(gatewayNetworkConflicts(topology)).toEqual([{ connection: 1, side: 0, other: 'attack' }])
    expect(issues(draft)).toContain('Variants.0.Topology.Connections.1.Endpoints.0.DeviceID|ed.c.val.gatewayNetworkTaken')
  })

  it('a node with two interfaces is two networks: a gateway on each is fine', () => {
    const draft = validDraft()
    const topology = topologyOf(draft)
    const first = addGateway(topology, 'vpn_gateway', 'attack')
    const second = addGateway(topology, 'internet_gateway', 'out')
    const router = emptyDevice()
    router.Name = 'r1'
    router.Interfaces = [{ ...router.Interfaces[0], Name: 'eth0' }, { ...router.Interfaces[0], Name: 'eth1' }]
    topology.Devices.push(router)
    link(topology, first, 'eth0', router, 'eth0')
    link(topology, second, 'eth0', router, 'eth1')
    expect(gatewayNetworkConflicts(topology)).toEqual([])
    expect(issues(draft)).toEqual([])
  })

  it('tells which gateway a new link would clash with (the connect mode refuses it), ignoring unconnected gateways', () => {
    const draft = validDraft()
    const topology = topologyOf(draft)
    const first = addGateway(topology, 'vpn_gateway', 'attack')
    const second = addGateway(topology, 'internet_gateway', 'out')
    const sw = switchOf('sw1')
    const web = emptyDevice()
    web.Name = 'web'
    topology.Devices.push(sw, web)
    link(topology, first, 'eth0', sw, 'GigabitEthernet0/1')
    expect(gatewayClashOfLink(topology, { DeviceID: second.ID, Interface: 'eth0' }, { DeviceID: sw.ID, Interface: 'GigabitEthernet0/2' })).toBe('attack')
    expect(gatewayClashOfLink(topology, { DeviceID: web.ID, Interface: 'eth0' }, { DeviceID: sw.ID, Interface: 'GigabitEthernet0/2' })).toBeNull()
    expect(gatewayClashOfLink({ ...topology, Connections: [] }, { DeviceID: first.ID, Interface: 'eth0' }, { DeviceID: sw.ID, Interface: 'GigabitEthernet0/1' })).toBeNull()
  })

  it('finds the gateways beyond the platform limit (the number is never built in)', () => {
    const topology = topologyOf(validDraft())
    ;['a', 'b', 'c'].forEach((name) => addGateway(topology, 'vpn_gateway', name))
    topology.Devices.splice(1, 0, { ...emptyDevice(), Name: 'web' })
    expect(gatewaysOverLimit(topology.Devices, 3)).toEqual([])
    expect(gatewaysOverLimit(topology.Devices, 2)).toEqual([3])
    expect(gatewaysOverLimit(topology.Devices, 0)).toEqual([0, 2, 3])
  })
})
