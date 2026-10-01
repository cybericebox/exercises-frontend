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
  toDraftFormValues,
  toSaveDraftInput,
  type DraftFormValues,
} from './exerciseSchemas'
import type { Version } from '@/api/exercises/versions'

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
    topology.VPN = { Enabled: true, DHCP: false }
    topology.Internet = { Enabled: true, DHCP: false }
    const device = emptyDevice()
    device.Name = 'web'
    Object.assign(device.Interfaces[0].IP, {
      Type: 'static', Addresses: [], AddressRef: { Network: 'vpn', Host: 10 },
      Gateway: '', GatewayRef: { Network: 'vpn', Host: 1 },
      Routes: [{ Dst: '', DstRef: { Network: 'internet' }, Via: '', ViaRef: { Network: 'vpn', Host: 1 } }],
    })
    topology.Devices.push(device)
    expect(draftSchema.safeParse(draft).success).toBe(true)
    const saved = toSaveDraftInput(draft).Variants[0].Topology.Devices?.[0].Interfaces?.[0].IP
    expect(saved?.AddressRef).toEqual({ Network: 'vpn', Host: 10 })
    expect(saved?.GatewayRef).toEqual({ Network: 'vpn', Host: 1 })
    expect(saved?.Routes?.[0].DstRef).toEqual({ Network: 'internet' })
    expect(saved?.Routes?.[0].ViaRef).toEqual({ Network: 'vpn', Host: 1 })
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
    topology.VPN.DHCP = true
    topology.VPN.DHCPRanges = [{ Start: 2, End: 254 }]
    expect(draftSchema.safeParse(draft).success).toBe(true)
    topology.VPN.DHCP = false
    topology.VPN.Enabled = false
    expect(draftSchema.safeParse(draft).success).toBe(false)
    topology.VPN.Enabled = true
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
    topology.VPN = { Enabled: true, DHCP: true, DHCPRanges: vpnRanges }
    topology.Internet = { Enabled: true, DHCP: true, DHCPRanges: [{ Start: 20, End: 80 }], DNS: '1.1.1.1' }
    expect(draftSchema.safeParse(draft).success).toBe(true)
    const saved = toSaveDraftInput(draft).Variants[0].Topology
    expect(saved.VPN.DHCPRanges).toEqual(topology.VPN.DHCPRanges)
    expect(saved.Internet.DNS).toBe('1.1.1.1')
    vpnRanges[1].Start = 50
    expect(draftSchema.safeParse(draft).success).toBe(false)
    vpnRanges[1].Start = 100
    topology.Internet.DNS = 'invalid'
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

  it('defaults missing resources and routes when reopening an old draft', () => {
    const legacy = loadedVersion()
    delete (legacy.Variants[0].Topology.Devices[0] as Partial<typeof legacy.Variants[0]['Topology']['Devices'][0]>).Resources
    delete (legacy.Variants[0].Topology.Devices[0].Interfaces[0].IP as Partial<typeof legacy.Variants[0]['Topology']['Devices'][0]['Interfaces'][0]['IP']>).Routes
    const values = toDraftFormValues(legacy)
    const device = values.Variants[0].Topology.Devices[0]
    expect(device).toHaveProperty('Resources', { CPURequest: '', MemoryRequest: '', CPULimit: '', MemoryLimit: '' })
    expect(device.Interfaces[0].IP).toHaveProperty('Routes', [])
    const saved = toSaveDraftInput(values).Variants[0].Topology.Devices?.[0]
    expect(saved).not.toHaveProperty('Resources')
    expect(saved?.Interfaces?.[0].IP).not.toHaveProperty('Routes')
  })

  it('serializes only set resource fields and all static routes', () => {
    const draft = validDraft()
    const device = Object.assign(emptyDevice(), { Resources: { CPURequest: '250m', MemoryRequest: '', CPULimit: '', MemoryLimit: '512Mi' } })
    device.Name = 'web'
    Object.assign(device.Interfaces[0].IP, {
      Type: 'static', Addresses: ['10.0.0.2/24'], Gateway: '',
      Routes: [{ Dst: '10.1.0.0/16', Via: '10.0.0.1' }, { Dst: '10.2.0.0/16', Via: '10.0.0.1' }],
    })
    draft.Variants[0].Topology.Devices.push(device)
    const output = toSaveDraftInput(draft).Variants[0].Topology.Devices?.[0]
    expect(output?.Resources).toEqual({ CPURequest: '250m', MemoryLimit: '512Mi' })
    expect(output?.Interfaces?.[0].IP.Routes).toEqual([
      { Dst: '10.1.0.0/16', Via: '10.0.0.1' },
      { Dst: '10.2.0.0/16', Via: '10.0.0.1' },
    ])
  })

  it.each(['0', '-1Mi', 'pizza', '500m'])("rejects invalid or excessive CPU request %s", (value) => {
    const draft = validDraft()
    const device = Object.assign(emptyDevice(), { Resources: { CPURequest: value, MemoryRequest: '', CPULimit: '250m', MemoryLimit: '' } })
    device.Name = 'web'
    draft.Variants[0].Topology.Devices.push(device)
    expect(draftSchema.safeParse(draft).success).toBe(false)
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
    Object.assign(device, { Resources: { CPURequest: '250m' } })
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

  it('rejects vm and prevents task flag targets from overwriting env variables', () => {
    const draft = validDraft()
    const device = emptyDevice()
    device.Name = 'web'
    device.Type = 'vm' as typeof device.Type
    draft.Variants[0].Topology.Devices.push(device)
    expect(draftSchema.safeParse(draft).success).toBe(false)
    device.Type = 'container'
    device.EnvVars.push({ Name: 'FLAG', Value: 'static', Secret: false, HasValue: true })
    draft.Variants[0].Tasks[0].LinkedDeviceID = device.ID
    draft.Variants[0].Tasks[0].DeviceFlagVar = 'FLAG'
    const result = draftSchema.safeParse(draft)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain('Variants.0.Tasks.0.DeviceFlagVar')
  })

  it('rejects two task flag targets on one device but allows the same name on different devices', () => {
    const draft = validDraft()
    const first = emptyDevice()
    first.Name = 'first'
    const second = emptyDevice()
    second.Name = 'second'
    draft.Variants[0].Topology.Devices.push(first, second)
    const task = draft.Variants[0].Tasks[0]
    task.LinkedDeviceID = first.ID
    task.DeviceFlagVar = 'FLAG'
    const other = { ...emptyTask(), Name: 'Another task', Description: { root: {} }, LinkedDeviceID: first.ID, DeviceFlagVar: 'FLAG' }
    draft.Variants[0].Tasks.push(other)
    expect(draftSchema.safeParse(draft).success).toBe(false)
    other.LinkedDeviceID = second.ID
    expect(draftSchema.safeParse(draft).success).toBe(true)
  })

  it('accepts common positive Kubernetes resource suffixes', () => {
    const draft = validDraft()
    const device = emptyDevice()
    device.Name = 'web'
    draft.Variants[0].Topology.Devices.push(device)
    for (const quantity of ['1', '250m', '512Mi', '2Gi', '1e3', '1.5G']) {
      device.Resources.CPURequest = quantity
      device.Resources.CPULimit = ''
      expect(draftSchema.safeParse(draft).success).toBe(true)
    }
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
    device.EnvVars = [{ Name: 'DB_PASS', Value: '', Secret: true, HasValue: false }]
    draft.Variants[0].Topology.Devices.push(device)
    expect(draftSchema.safeParse(draft).success).toBe(false)
    device.EnvVars[0].Value = 'new-secret'
    expect(draftSchema.safeParse(draft).success).toBe(true)
    device.EnvVars[0].Value = ''
    device.EnvVars[0].HasValue = true
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

  it('rejects a second connection to the same VPN gateway', () => {
    const draft = validDraft()
    draft.Variants[0].Topology.VPN.Enabled = true
    const device = emptyDevice()
    device.Name = 'web'
    draft.Variants[0].Topology.Devices.push(device)
    const connection = { Endpoints: [
      { Kind: 'vpn' as const, DeviceID: '', Interface: 'eth0' },
      { Kind: 'device' as const, DeviceID: device.ID, Interface: 'eth0' },
    ] }
    draft.Variants[0].Topology.Connections = [connection, connection]
    const result = draftSchema.safeParse(draft)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toContain('admin.ex.val.gatewayAlreadyConnected')
  })

  it('rejects a task name shorter than 3 chars', () => {
    const draft = validDraft()
    draft.Variants[0].Tasks[0].Name = 'ab'
    expect(draftSchema.safeParse(draft).success).toBe(false)
  })

  it('rejects a blank flag value', () => {
    const draft = validDraft()
    draft.Variants[0].Tasks[0].Flag = ['  ']
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
    draft.Variants[0].Tasks[0].Flag = [flag]
    expect(draftSchema.safeParse(draft).success).toBe(valid)
  })

  it('accepts an empty flag list (random flag semantics)', () => {
    const draft = validDraft()
    draft.Variants[0].Tasks[0].Flag = []
    expect(draftSchema.safeParse(draft).success).toBe(true)
  })

  it('accepts a template candidate in a draft and rejects identical candidates', () => {
    const draft = validDraft()
    draft.Variants[0].Tasks[0].Flag = [String.raw`template:ICE{\d}`]
    expect(draftSchema.safeParse(draft).success).toBe(true)
    draft.Variants[0].Tasks[0].Flag.push(String.raw`template:ICE{\d}`)
    expect(draftSchema.safeParse(draft).success).toBe(false)
  })

  it('explains a literal-only template separately from malformed flag syntax', () => {
    const draft = validDraft()
    draft.Variants[0].Tasks[0].Flag = ['template:ICE{fixed}']
    const noRandom = draftSchema.safeParse(draft)
    expect(noRandom.success).toBe(false)
    if (!noRandom.success) expect(noRandom.error.issues.some((issue) => issue.message === 'admin.ex.val.flagTemplateNeedsRandom')).toBe(true)

    draft.Variants[0].Tasks[0].Flag = ['template:ICE{has space}']
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
    device.EnvVars = []
    device.Image = ''
    device.External = { Enabled: false, Port: 80, Protocol: 'http' }
    draft.Variants[0].Topology.Devices.push(device)
    expect(draftSchema.safeParse(draft).success).toBe(true)
  })

  it('rejects a flag link without the environment variable name before saving', () => {
    const draft = validDraft()
    const device = emptyDevice()
    device.Name = 'web'
    draft.Variants[0].Topology.Devices.push(device)
    draft.Variants[0].Tasks[0].LinkedDeviceID = device.ID
    draft.Variants[0].Tasks[0].DeviceFlagVar = ''

    const result = draftSchema.safeParse(draft)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.')))
        .toContain('Variants.0.Tasks.0.DeviceFlagVar')
    }
  })

  it.each(['missing', 'forwarding'] as const)('rejects a flag link to a %s device', (kind) => {
    const draft = validDraft()
    const device = emptyDevice()
    device.Name = 'sw1'
    if (kind === 'forwarding') {
      device.Type = 'unmanaged-switch'
      device.Interfaces = []
      draft.Variants[0].Topology.Devices.push(device)
    }
    draft.Variants[0].Tasks[0].LinkedDeviceID = device.ID
    draft.Variants[0].Tasks[0].DeviceFlagVar = 'FLAG'

    const result = draftSchema.safeParse(draft)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.')))
        .toContain('Variants.0.Tasks.0.LinkedDeviceID')
    }
  })

  it('requires an interface on a container, including before external exposure', () => {
    for (const type of ['container'] as const) {
      const draft = validDraft()
      const device = emptyDevice()
      device.Name = 'web'
      device.Type = type
      device.Interfaces = []
      draft.Variants[0].Topology.Devices.push(device)
      expect(draftSchema.safeParse(draft).success).toBe(false)
      device.External.Enabled = true
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

  it('enabled external access requires port 1–65535', () => {
    const draft = validDraft()
    const device = emptyDevice()
    device.Name = 'web'
    device.External = { Enabled: true, Port: 0, Protocol: 'http' }
    draft.Variants[0].Topology.Devices.push(device)
    expect(draftSchema.safeParse(draft).success).toBe(false)

    device.External.Port = 70000
    expect(draftSchema.safeParse(draft).success).toBe(false)

    device.External.Port = 8080
    expect(draftSchema.safeParse(draft).success).toBe(true)
  })

  it('device endpoint requires a chosen device', () => {
    const draft = validDraft()
    draft.Variants[0].Topology.VPN.Enabled = true
    const web = emptyDevice()
    web.Name = 'web' // container with a default eth0 interface
    draft.Variants[0].Topology.Devices.push(web)
    draft.Variants[0].Topology.Connections = [{
      Endpoints: [
        { Kind: 'device', DeviceID: '', Interface: '' },
        { Kind: 'vpn', DeviceID: '', Interface: 'eth0' },
      ],
    }]
    expect(draftSchema.safeParse(draft).success).toBe(false)

    draft.Variants[0].Topology.Connections[0].Endpoints[0] =
      { Kind: 'device', DeviceID: web.ID, Interface: 'eth0' }
    expect(draftSchema.safeParse(draft).success).toBe(true)
  })

  it('a vpn/internet endpoint must not reference a device', () => {
    const draft = validDraft()
    draft.Variants[0].Topology.VPN.Enabled = true
    const web = emptyDevice()
    web.Name = 'web'
    draft.Variants[0].Topology.Devices.push(web)
    draft.Variants[0].Topology.Connections = [{
      Endpoints: [
        { Kind: 'device', DeviceID: web.ID, Interface: 'eth0' },
        { Kind: 'vpn', DeviceID: web.ID, Interface: 'eth0' },
      ],
    }]
    expect(draftSchema.safeParse(draft).success).toBe(false)

    draft.Variants[0].Topology.Connections[0].Endpoints[1] = { Kind: 'vpn', DeviceID: '', Interface: 'eth0' }
    expect(draftSchema.safeParse(draft).success).toBe(true)
  })

  it('allows only the named eth0 port on a new gateway connection', () => {
    const draft = validDraft()
    draft.Variants[0].Topology.VPN.Enabled = true
    const host = emptyDevice()
    host.Name = 'host'
    draft.Variants[0].Topology.Devices = [host]
    draft.Variants[0].Topology.Connections = [{ Endpoints: [
      { Kind: 'vpn', DeviceID: '', Interface: 'eth0' },
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
    draft.Variants[0].Topology.Connections = [{
      Endpoints: [
        { Kind: 'device', DeviceID: web.ID, Interface: 'eth9' },
        { Kind: 'vpn', DeviceID: '', Interface: 'eth0' },
      ],
    }]
    const result = draftSchema.safeParse(draft)
    expect(result.success).toBe(false)
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join('.'))
    expect(paths).toContain('Variants.0.Topology.Connections.0.Endpoints.0.Interface')
  })

  it('accepts resolved endpoints: device+interface, switch port, and vpn/internet kinds', () => {
    const draft = validDraft()
    draft.Variants[0].Topology.VPN.Enabled = true
    draft.Variants[0].Topology.Internet.Enabled = true
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
          { Kind: 'vpn', DeviceID: '', Interface: 'eth0' },
          { Kind: 'internet', DeviceID: '', Interface: 'eth0' },
        ],
      },
    ]
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
      Kind: 'ip', IPReference: 'bogus', Octets1to3: '', LastOctet: 0, ShowMask: false, DeviceName: '',
    }]
    expect(draftSchema.safeParse(draft).success).toBe(false)

    draft.Variants[0].Tasks[0].Placeholders = [{
      Key: 'ph_test',
      Kind: 'external.link', IPReference: '', Octets1to3: '', LastOctet: 0, ShowMask: false, DeviceName: '',
    }]
    expect(draftSchema.safeParse(draft).success).toBe(false)

    draft.Variants[0].Tasks[0].Placeholders = [{
      Key: 'ph_test',
      Kind: 'ip', IPReference: 'vpn', Octets1to3: '', LastOctet: 13, ShowMask: true, DeviceName: '',
    }]
    expect(draftSchema.safeParse(draft).success).toBe(true)
  })

  it('ip link form validates scheme, port, path and mask', () => {
    const draft = validDraft()
    const ip = { Key: 'ph_link', Kind: 'ip' as const, IPReference: 'vpn', Octets1to3: '', LastOctet: 5, ShowMask: false, DeviceName: '', AsLink: true, Scheme: 'https', PortText: '8443', Path: '/a?b=1' }
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
    draft.Variants[0].Tasks[0].Placeholders = [{ Key: 'ph_link', Kind: 'ip', IPReference: 'vpn', Octets1to3: '', LastOctet: 5, ShowMask: true, DeviceName: '', AsLink: true, Scheme: 'https', PortText: '8443', Path: '/x' }]
    const dto = toSaveDraftInput(draft).Variants[0].Tasks[0].Placeholders
    expect(dto).toEqual([{ Key: 'ph_link', Kind: 'ip', IPReference: 'vpn', LastOctet: 5, ShowMask: false, AsLink: true, Scheme: 'https', Port: 8443, Path: '/x' }])
    draft.Variants[0].Tasks[0].Placeholders = [{ Key: 'ph_plain', Kind: 'ip', IPReference: 'vpn', Octets1to3: '', LastOctet: 5, ShowMask: false, DeviceName: '', AsLink: false, Scheme: 'http', PortText: '', Path: '' }]
    const plain = toSaveDraftInput(draft).Variants[0].Tasks[0].Placeholders
    expect(plain).toEqual([{ Key: 'ph_plain', Kind: 'ip', IPReference: 'vpn', LastOctet: 5, ShowMask: false }])
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
  version.Variants[0].Topology.VPN.DHCP = false
  version.Variants[0].Topology.Internet.Enabled = true
  version.Variants[0].Topology.Devices[0].Interfaces[0].IP = {
    Type: 'static', Addresses: [], AddressRef: { Network: 'vpn', Host: 10 },
    Gateway: '', GatewayRef: { Network: 'vpn', Host: 1 },
    Routes: [{ Dst: '', DstRef: { Network: 'internet' }, Via: '', ViaRef: { Network: 'vpn', Host: 1 } }],
  }
  const form = toDraftFormValues(version)
  const saved = toSaveDraftInput(form).Variants[0].Topology.Devices?.[0].Interfaces?.[0].IP
  expect(saved).toMatchObject({
    AddressRef: { Network: 'vpn', Host: 10 },
    GatewayRef: { Network: 'vpn', Host: 1 },
    Routes: [{ DstRef: { Network: 'internet' }, ViaRef: { Network: 'vpn', Host: 1 } }],
  })
  expect(JSON.stringify(saved)).not.toContain('10.0.0.')
})

// ── Serialization: form ↔ version ────────────────────────────────────────────────

const DEV_ID = '99999999-8888-7777-6666-555555555555'

function loadedVersion(): Version {
  return {
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
      Note: '',
      Tasks: [{
        ID: 'task1',
        Name: 'Find the flag',
        Description: { root: {} },
        Difficulty: 'medium',
        Flag: ['ICE{x}'],
        LinkedDeviceID: DEV_ID,
        DeviceFlagVar: 'FLAG',
        Attachments: [{ FileID: 'f1', Name: 'notes.pdf' }],
        Placeholders: [{ Kind: 'vpn.subnet' }],
        Hints: [],
      }],
      Topology: {
        VPN: { Enabled: true, DHCP: true },
        Internet: { Enabled: false, DHCP: false },
        Devices: [{
          ID: DEV_ID,
          Name: 'web',
          Type: 'container',
          SecurityPreset: '',
          Image: 'nginx:1.27',
          Resources: { CPURequest: '', MemoryRequest: '', CPULimit: '', MemoryLimit: '' },
          Interfaces: [{ Name: 'eth0', MAC: '', IP: { Type: 'static', Addresses: ['10.0.0.2/24'], Gateway: '10.0.0.1', Routes: [] } }],
          EnvVars: [{ Name: 'DB_PASS', Value: '', Secret: true, HasValue: true }],
          External: { Port: 8080, Protocol: 'https' },
        }],
        Connections: [{
          Endpoints: [
            { Kind: 'vpn', DeviceID: '', Interface: 'eth0' },
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
    loaded.Variants[0].Topology.Devices[0].SecurityPreset = 'net'
    loaded.Variants[0].Topology.Devices[0].Interfaces[0].IP.Type = 'dhcp-preset'
    loaded.Variants[0].Topology.Devices[0].Interfaces[0].IP.Addresses = []
    loaded.Variants[0].Topology.Devices[0].Interfaces[0].IP.Gateway = ''
    const values = toDraftFormValues(loaded)
    expect(values.Variants[0].Topology.VisualRender).toEqual(loaded.Variants[0].Topology.VisualRender)
    expect(values.Variants[0].Topology.Devices[0].SecurityPreset).toBe('net')
    expect(values.Variants[0].Topology.Devices[0].Interfaces[0].IP.Type).toBe('dhcp-preset')
    const saved = toSaveDraftInput(values)
    expect(saved.Variants[0].Topology.VisualRender).toEqual(loaded.Variants[0].Topology.VisualRender)
    expect(saved.Variants[0].Topology.Devices?.[0].SecurityPreset).toBe('net')
    expect(saved.Variants[0].Topology.Devices?.[0].Interfaces?.[0].IP.Type).toBe('dhcp-preset')
  })
  it('maps a loaded version into form values (External → Enabled form)', () => {
    const values = toDraftFormValues(loadedVersion())
    expect(values.AdminNote).toBe('wip')
    expect(values).not.toHaveProperty('RegenerateFlagsOnPublish')
    expect(values.Variants[0].ID).toBe('var1')
    expect(values.Variants[0].Tasks[0].ID).toBe('task1')
    expect(values.Variants[0].Tasks[0].Placeholders[0].Key).toBe('ph_legacy_0_0_0')
    expect(values.Variants[0].Topology.Devices[0].External)
      .toEqual({ Enabled: true, Port: 8080, Protocol: 'https' })
  })

  it('null version → empty draft (1 variant, 1 task)', () => {
    const values = toDraftFormValues(null)
    expect(values.Variants).toHaveLength(1)
    expect(values.Variants[0].Tasks).toHaveLength(1)
  })
})

describe('toSaveDraftInput', () => {
  it('persists the named singleton port on a newly selected gateway endpoint', () => {
    const draft = emptyDraft()
    draft.Variants[0].Topology.VPN.Enabled = true
    const host = emptyDevice()
    host.Name = 'host'
    draft.Variants[0].Topology.Devices = [host]
    draft.Variants[0].Topology.Connections = [{ Endpoints: [
      { Kind: 'vpn', DeviceID: '', Interface: 'eth0' },
      { Kind: 'device', DeviceID: host.ID, Interface: 'eth0' },
    ] }]
    expect(toSaveDraftInput(draft).Variants[0].Topology.Connections?.[0].Endpoints[0]).toEqual({ Kind: 'vpn', Interface: 'eth0' })
  })
  it('sends the mask choice for a subnet placeholder to the API', () => {
    const draft = emptyDraft()
    draft.Variants[0].Tasks[0].Placeholders = [{ Key: 'ph_subnet', Kind: 'vpn.subnet', IPReference: '', Octets1to3: '', LastOctet: 0, ShowMask: true, DeviceName: '' }]
    expect(toSaveDraftInput(draft).Variants[0].Tasks[0].Placeholders).toEqual([{ Key: 'ph_subnet', Kind: 'vpn.subnet', ShowMask: true }])
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
          Flag: ['ICE{x}'],
          LinkedDeviceID: DEV_ID,
          DeviceFlagVar: 'FLAG',
          Attachments: [{ FileID: 'f1', Name: 'notes.pdf' }],
          Placeholders: [{ Key: 'ph_legacy_0_0_0', Kind: 'vpn.subnet' }],
          Hints: [],
        }],
        Topology: {
          VPN: { Enabled: true, DHCP: true },
          Internet: { Enabled: false, DHCP: false },
          Devices: [{
            ID: DEV_ID,
            Name: 'web',
            Type: 'container',
            Image: 'nginx:1.27',
            Interfaces: [{ Name: 'eth0', IP: { Type: 'static', Addresses: ['10.0.0.2/24'], Gateway: '10.0.0.1' } }],
            EnvVars: [{ Name: 'DB_PASS', Value: '', Secret: true }],
            External: { Port: 8080, Protocol: 'https' },
          }],
          Connections: [{
            Endpoints: [
              { Kind: 'vpn', Interface: 'eth0' },
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
    expect(webDTO.External).toBeUndefined()
    expect(webDTO.Interfaces![0].MAC).toBeUndefined()
    expect(webDTO.Interfaces![0].IP).toEqual({ Type: 'dhcp' })
    expect(input.Variants[0].Tasks[0].Description).toBeUndefined()
    expect(input.Variants[0].Tasks[0].LinkedDeviceID).toBeUndefined()
  })

  it('has no flag-regeneration switch in drafts or save requests', () => {
    expect(emptyDraft()).not.toHaveProperty('RegenerateFlagsOnPublish')
    expect(toSaveDraftInput(emptyDraft())).not.toHaveProperty('RegenerateFlagsOnPublish')
  })
})
