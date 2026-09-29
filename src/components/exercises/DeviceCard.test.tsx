/**
 * DeviceCard.test.tsx — type is chosen at creation; configuration shows only applicable fields.
 */
import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { useForm, useWatch, FormProvider, useFormContext } from 'react-hook-form'

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))

import { DeviceCard } from './DeviceCard'
import { emptyDraft, emptyDevice, type DraftFormValues, type DeviceFormValues } from '@/lib/exerciseSchemas'
import { DEFAULT_EDITOR_POSITION, type EditorPosition } from '@/lib/editorPosition'
import { EditorPositionProvider } from './EditorPosition'

function DeviceValues() {
  const { control } = useFormContext<DraftFormValues>()
  const device = useWatch({ control, name: 'Variants.0.Topology.Devices.0' })
  return <output data-testid="device-values">{JSON.stringify(device)}</output>
}

function Harness({ device, compact = false, networks = false, vpnDhcp = false }: { device: DeviceFormValues; compact?: boolean; networks?: boolean; vpnDhcp?: boolean }) {
  const draft = emptyDraft()
  draft.Variants[0].Topology.Devices = [device]
  if (networks) {
    draft.Variants[0].Topology.VPN = { Enabled: true, DHCP: vpnDhcp, DHCPRanges: vpnDhcp ? [{ Start: 2, End: 20 }] : [] }
    draft.Variants[0].Topology.Internet = { Enabled: true, DHCP: false }
  }
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  return (
    <FormProvider {...form}>
      <DeviceCard variantIndex={0} deviceIndex={0} disabled={false} compact={compact} />
      <DeviceValues />
    </FormProvider>
  )
}

function LinkedDeviceHarness() {
  const draft = emptyDraft()
  const device = emptyDevice()
  device.Name = 'web'
  device.EnvVars = [{ Name: 'PUBLIC_URL', Value: 'https://example.com', Secret: false, HasValue: false }]
  draft.Variants[0].Topology.Devices = [device]
  draft.Variants[0].Tasks[0].Name = 'Find the key'
  draft.Variants[0].Tasks[0].LinkedDeviceID = device.ID
  draft.Variants[0].Tasks[0].DeviceFlagVar = 'FLAG'
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  const [position, setPosition] = useState<EditorPosition>({ ...DEFAULT_EDITOR_POSITION, section: 'topology' })
  function onChange<K extends keyof EditorPosition>(key: K, value: EditorPosition[K]) {
    setPosition((current) => ({ ...current, [key]: value }))
  }
  return <EditorPositionProvider position={position} onChange={onChange}>
    <FormProvider {...form}>
      <DeviceCard variantIndex={0} deviceIndex={0} disabled={false} />
      <output data-testid="editor-position">{JSON.stringify(position)}</output>
      <DeviceValues />
    </FormProvider>
  </EditorPositionProvider>
}

describe('DeviceCard', () => {
  it('shows a task-owned flag binding without a second editable variable and opens that task', () => {
    render(<LinkedDeviceHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exEnv.title' }))
    expect(screen.getByDisplayValue('PUBLIC_URL')).toBeInTheDocument()
    expect(screen.getByText('FLAG')).toBeInTheDocument()
    expect(screen.getByText('Find the key')).toBeInTheDocument()
    expect(document.querySelectorAll('input[name="Variants.0.Topology.Devices.0.EnvVars.0.Name"]')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /Find the key/ }))
    expect(screen.getByTestId('editor-position')).toHaveTextContent('"section":"tasks"')
    expect(screen.getByTestId('editor-position')).toHaveTextContent('"task":0')
  })
  it('edits container resource request and limit values', () => {
    const device = emptyDevice()
    device.Name = 'web'
    render(<Harness device={device} />)
    expect(screen.getByRole('button', { name: 'admin.exTopo.resources' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('textbox', { name: 'admin.exTopo.cpuRequest' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'admin.exTopo.memoryLimit' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'admin.exTopo.cpuRequest' }), { target: { value: '250' } })
    expect(screen.getByRole('textbox', { name: 'admin.exTopo.cpuRequest' })).toHaveValue('250')
    expect(JSON.parse(screen.getByTestId('device-values').textContent || '{}').Resources.CPURequest).toBe('250m')
    fireEvent.keyDown(screen.getByRole('button', { name: 'admin.exTopo.cpuRequest admin.exTopo.resourceUnit' }), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: /admin.exTopo.cpuUnit.core/ }))
    expect(JSON.parse(screen.getByTestId('device-values').textContent || '{}').Resources.CPURequest).toBe('250')
  })

  it('splits a stored memory quantity into amount and unit without changing its value', () => {
    const device = emptyDevice()
    device.Resources.MemoryLimit = '512Mi'
    render(<Harness device={device} />)
    expect(screen.getByRole('textbox', { name: 'admin.exTopo.memoryLimit' })).toHaveValue('512')
    expect(screen.getByRole('button', { name: 'admin.exTopo.memoryLimit admin.exTopo.resourceUnit' })).toHaveTextContent('admin.exTopo.memoryUnit.Mi')
    fireEvent.change(screen.getByRole('textbox', { name: 'admin.exTopo.memoryLimit' }), { target: { value: '768' } })
    expect(JSON.parse(screen.getByTestId('device-values').textContent || '{}').Resources.MemoryLimit).toBe('768Mi')
  })

  it('preserves an uncommon stored quantity suffix while exposing it in the unit control', () => {
    const device = emptyDevice()
    device.Resources.MemoryLimit = '2G'
    render(<Harness device={device} />)
    expect(screen.getByRole('textbox', { name: 'admin.exTopo.memoryLimit' })).toHaveValue('2')
    expect(screen.getByRole('button', { name: 'admin.exTopo.memoryLimit admin.exTopo.resourceUnit' })).toHaveTextContent('G')
    expect(JSON.parse(screen.getByTestId('device-values').textContent || '{}').Resources.MemoryLimit).toBe('2G')
  })

  it('shows one static address field and editable route rows', () => {
    const device = emptyDevice()
    device.Name = 'web'
    device.Interfaces[0].IP = { Type: 'static', Addresses: ['10.0.0.2/24'], Gateway: '', Routes: [] }
    render(<Harness device={device} />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.interfaces' }))
    expect(screen.getByRole('textbox', { name: /admin.exTopo.addresses/ })).toHaveValue('10.0.0.2/24')
    expect(screen.queryByRole('button', { name: 'admin.exTopo.addAddress' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.addRoute' }))
    expect(screen.getByRole('textbox', { name: /admin.exTopo.routeDst/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /admin.exTopo.routeVia/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.removeRoute' }))
    expect(screen.queryByRole('textbox', { name: 'admin.exTopo.routeDst' })).not.toBeInTheDocument()
  })

  it('keeps a static route and its delete action together in a compact card with error space', () => {
    const device = emptyDevice()
    device.Interfaces[0].IP = { Type: 'static', Addresses: ['10.0.0.2/24'], Gateway: '', Routes: [{ Dst: '10.1.0.0/16', Via: '10.0.0.1' }] }
    render(<Harness device={device} compact />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.interfaces' }))
    const card = document.querySelector('[data-route-card]')!
    expect(card).toHaveClass('border')
    expect(card).toHaveClass('p-2')
    expect(card).toContainElement(screen.getByRole('button', { name: 'admin.exTopo.removeRoute' }))
    expect(card.querySelector('[data-route-fields]')).toHaveClass('grid-cols-1')
    expect(card.querySelector('[data-route-fields]')).toHaveClass('gap-2')
    expect(within(card as HTMLElement).getByRole('textbox', { name: /admin.exTopo.routeDst/ })).toHaveClass('h-9')
    expect(card.querySelectorAll('[data-error-slot]')).toHaveLength(1)
    expect(card.querySelector('[data-route-fields] p:empty')).not.toBeInTheDocument()
  })

  it('clears static addresses and routes when changing IP mode', () => {
    const device = emptyDevice()
    device.Name = 'web'
    device.Interfaces[0].IP = { Type: 'static', Addresses: ['10.0.0.2/24'], Gateway: '10.0.0.1', Routes: [{ Dst: '10.1.0.0/16', Via: '10.0.0.1' }] }
    render(<Harness device={device} />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.interfaces' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'admin.exTopo.ipType' }), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: /^admin\.exTopo\.ip\.dhcp(?!Preset)/ }))
    expect(JSON.parse(screen.getByTestId('device-values').textContent || '{}').Interfaces[0].IP).toEqual({ Type: 'dhcp', Addresses: [], AddressRef: null, Gateway: '', GatewayRef: null, Routes: [] })
  })

  it('inserts typed auto-subnet references into all static fields and clears them on mode change', () => {
    const device = emptyDevice()
    device.Name = 'web'
    device.Interfaces[0].IP = { Type: 'static', Addresses: ['10.0.0.2/24'], Gateway: '', Routes: [{ Dst: '', Via: '' }] }
    render(<Harness device={device} networks />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.interfaces' }))
    for (const [kind, network] of [['address', 'vpn'], ['gateway', 'vpn'], ['destination', 'internet'], ['via', 'vpn']] as const) {
      fireEvent.keyDown(screen.getByRole('button', { name: `admin.exTopo.ref.choice.${kind}` }), { key: 'ArrowDown' })
      fireEvent.click(screen.getByRole('menuitemradio', { name: new RegExp(`admin.exTopo.ref.${network}`) }))
    }
    const ip = JSON.parse(screen.getByTestId('device-values').textContent || '{}').Interfaces[0].IP
    expect(ip.AddressRef).toEqual({ Network: 'vpn', Host: 10 })
    expect(ip.Addresses).toEqual([])
    expect(ip.GatewayRef).toEqual({ Network: 'vpn', Host: 1 })
    expect(ip.Routes[0].DstRef).toEqual({ Network: 'internet' })
    expect(ip.Routes[0].ViaRef).toEqual({ Network: 'vpn', Host: 1 })
    fireEvent.keyDown(screen.getByRole('button', { name: 'admin.exTopo.ipType' }), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: /^admin\.exTopo\.ip\.dhcp(?!Preset)/ }))
    const cleared = JSON.parse(screen.getByTestId('device-values').textContent || '{}').Interfaces[0].IP
    expect(cleared).toEqual({ Type: 'dhcp', Addresses: [], AddressRef: null, Gateway: '', GatewayRef: null, Routes: [] })
  })

  it('shows a full-width DHCP overlap warning only for the device address, not its gateway', () => {
    const device = emptyDevice()
    device.Name = 'web'
    device.Interfaces[0].IP = { Type: 'static', Addresses: ['10.0.0.2/24'], Gateway: '', Routes: [{ Dst: '', Via: '' }] }
    const { container } = render(<Harness device={device} networks vpnDhcp compact />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.interfaces' }))
    const grid = container.querySelector('[data-static-ip-grid]')
    expect(grid).toHaveClass('grid-cols-1')
    expect(screen.getByPlaceholderText('10.0.0.2/24').parentElement).toHaveClass('grid-cols-[minmax(8rem,0.55fr)_minmax(0,1fr)]')
    expect(screen.getAllByPlaceholderText('10.0.0.1')[0].parentElement).toHaveClass('grid-cols-[minmax(8rem,0.55fr)_minmax(0,1fr)]')
    const routeFields = container.querySelector('[data-route-fields]') as HTMLElement
    expect(routeFields).toHaveClass('grid-cols-1')
    expect(within(routeFields).getByPlaceholderText('10.1.0.0/16').parentElement).toHaveClass('grid-cols-[minmax(8rem,0.55fr)_minmax(0,1fr)]')
    expect(within(routeFields).getByPlaceholderText('10.0.0.1').parentElement).toHaveClass('grid-cols-[minmax(8rem,0.55fr)_minmax(0,1fr)]')
    fireEvent.keyDown(screen.getByRole('button', { name: 'admin.exTopo.ref.choice.gateway' }), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: /admin.exTopo.ref.vpn/ }))
    expect(screen.getByRole('spinbutton', { name: 'admin.exTopo.ref.host' }).parentElement?.parentElement).toHaveClass('grid-cols-[minmax(0,1fr)_auto]')
    expect(container.querySelector('[data-ip-warning]')).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('button', { name: 'admin.exTopo.ref.choice.address' }), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: /admin.exTopo.ref.vpn/ }))
    const warning = container.querySelector('[data-ip-warning]')
    expect(warning).toHaveTextContent('admin.exTopo.ref.dhcpOverlap')
    expect(grid?.contains(warning)).toBe(true)
    expect(warning!.compareDocumentPosition(screen.getByText('admin.exTopo.gateway')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('does not offer changing the type inside device configuration', () => {
    const device = emptyDevice()
    device.Name = 'web'
    device.Resources.CPURequest = '250m'
    render(<Harness device={device} />)
    expect(screen.queryByRole('button', { name: 'admin.exTopo.deviceType' })).not.toBeInTheDocument()
    expect(JSON.parse(screen.getByTestId('device-values').textContent || '{}').Resources.CPURequest).toBe('250m')
  })
  it('container: shows one selected settings section at a time', () => {
    const device = emptyDevice()
    device.Name = 'web'
    render(<Harness device={device} />)
    expect(screen.getByText('admin.exTopo.image')).toBeInTheDocument()
    expect(screen.queryByText('admin.exTopo.ifaceName')).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'admin.exTopo.external' })).toBeInTheDocument()
    expect(screen.getByText('admin.exTopo.externalToggle')).toBeInTheDocument()
    expect(screen.queryByText('admin.exTopo.deviceName')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'admin.exTopo.imageHelp' })).toBeInTheDocument()
    expect(screen.getByText('admin.exTopo.resources')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'admin.exTopo.resources' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.interfaces' }))
    expect(screen.getByText('admin.exTopo.ifaceName').closest('label')).toHaveTextContent('*')
    expect(screen.getByRole('button', { name: 'admin.exTopo.ipTypeHelp' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'admin.exTopo.ipType' })).toHaveClass('h-10')
    expect(screen.queryByText('admin.exTopo.image')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'admin.exTopo.external' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.basic' }))
    expect(screen.getByRole('switch', { name: 'admin.exTopo.external' })).toBeInTheDocument()
    expect(screen.queryByText('admin.exTopo.ifaceName')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'admin.exTopo.external' }))
    expect(screen.getByText('admin.exTopo.port').closest('label')).toHaveClass('leading-5')
    expect(screen.getByRole('spinbutton', { name: /admin.exTopo.port/ }).closest('div.space-y-2')?.querySelector('p:empty')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.interfaces' }))
    expect(screen.queryByRole('button', { name: 'admin.exTopo.removeInterface' })).not.toBeInTheDocument()
  })

  it('unmanaged-switch: only relevant basic fields', () => {
    const device = emptyDevice()
    device.Name = 'sw1'
    device.Type = 'unmanaged-switch'
    device.Interfaces = []
    render(<Harness device={device} />)
    expect(screen.queryByText('admin.exTopo.image')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'admin.exTopo.interfaces' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'admin.exTopo.external' })).not.toBeInTheDocument()
  })

  it('collapses image, resources, and external access independently on Basic', () => {
    render(<Harness device={emptyDevice()} compact />)
    const image = screen.getByRole('button', { name: 'admin.exTopo.imageAndSecurity' })
    const resources = screen.getByRole('button', { name: 'admin.exTopo.resources' })
    const external = screen.getByRole('button', { name: 'admin.exTopo.external' })
    expect(image).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(image)
    expect(screen.queryByText('admin.exTopo.image')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'admin.exTopo.cpuRequest' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'admin.exTopo.external' })).toBeInTheDocument()
    fireEvent.click(resources)
    expect(screen.queryByRole('textbox', { name: 'admin.exTopo.cpuRequest' })).not.toBeInTheDocument()
    fireEvent.click(external)
    expect(screen.queryByRole('switch', { name: 'admin.exTopo.external' })).not.toBeInTheDocument()
    fireEvent.click(image)
    expect(screen.getByText('admin.exTopo.image')).toBeInTheDocument()
  })

  it('explains every security profile and IP assignment mode in their menus', () => {
    const device = emptyDevice()
    device.Name = 'web'
    render(<Harness device={device} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'admin.exTopo.securityPreset' }), { key: 'ArrowDown' })
    expect(screen.getByText('admin.exTopo.security.netHelp')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.interfaces' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'admin.exTopo.ipType' }), { key: 'ArrowDown' })
    expect(screen.getByText('admin.exTopo.ip.dhcpPresetHelp')).toBeInTheDocument()
  })

  it('shows one basic security choice for both omitted and legacy explicit basic values', () => {
    const device = emptyDevice()
    device.SecurityPreset = 'basic'
    render(<Harness device={device} />)
    const select = screen.getByRole('button', { name: 'admin.exTopo.securityPreset' })
    expect(select).toHaveTextContent('admin.exTopo.security.default')
    fireEvent.keyDown(select, { key: 'ArrowDown' })
    expect(screen.getByText('admin.exTopo.security.defaultHelp')).toBeInTheDocument()
    expect(screen.queryByText('admin.exTopo.security.basicHelp')).not.toBeInTheDocument()
  })

  it('stored secret env var: secret icon toggle is locked until the value is replaced', () => {
    const device = emptyDevice()
    device.Name = 'web'
    device.EnvVars = [{ Name: 'API_KEY', Value: '', Secret: true, HasValue: true }]
    render(<Harness device={device} />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exEnv.title' }))

    // Locked: cannot un-secret a stored secret whose plaintext we never had.
    const secretToggle = screen.getByRole('button', { name: 'admin.exEnv.secret' })
    expect(secretToggle).toBeDisabled()
    expect(secretToggle).toHaveAttribute('aria-pressed', 'true')
    expect(secretToggle).not.toHaveAttribute('title')
    fireEvent.mouseEnter(secretToggle)
    expect(screen.getByRole('tooltip')).toHaveTextContent('admin.exSecret.lockedHint')
    fireEvent.mouseLeave(secretToggle)

    // Providing a fresh value (Replace → type) unlocks the toggle.
    fireEvent.click(screen.getByText('admin.exSecret.replace'))
    fireEvent.change(screen.getByTestId('secret-value-input'), { target: { value: 'new-secret' } })
    expect(screen.getByRole('button', { name: 'admin.exEnv.secret' })).toBeEnabled()
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'admin.exEnv.secret' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('admin.exEnv.secretHelp')
  })

  it('non-stored secret env var (HasValue=false): secret icon toggles freely', () => {
    const device = emptyDevice()
    device.Name = 'web'
    device.EnvVars = [{ Name: 'API_KEY', Value: '', Secret: true, HasValue: false }]
    render(<Harness device={device} />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exEnv.title' }))

    const secretToggle = screen.getByRole('button', { name: 'admin.exEnv.secret' })
    expect(secretToggle).toBeEnabled()
    expect(secretToggle).toHaveAttribute('aria-pressed', 'true')
    expect(secretToggle.querySelector('.lucide-lock-keyhole')).toBeInTheDocument()
    expect(screen.queryByText('admin.exSecret.lockedHint')).not.toBeInTheDocument()
    fireEvent.click(secretToggle)
    expect(secretToggle).toHaveAttribute('aria-pressed', 'false')
    expect(secretToggle.querySelector('.lucide-lock-keyhole-open')).toBeInTheDocument()
  })

  it('keeps interface and variable editors separate when both lists grow', () => {
    const device = emptyDevice()
    device.Name = 'web'
    device.Interfaces.push({ ...device.Interfaces[0], Name: 'eth1' })
    device.EnvVars = [
      { Name: 'FIRST', Value: '1', Secret: false, HasValue: false },
      { Name: 'SECOND', Value: '2', Secret: false, HasValue: false },
    ]
    render(<Harness device={device} />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.interfaces' }))
    expect(screen.getAllByRole('button', { name: 'admin.exTopo.removeInterface' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'admin.exTopo.removeInterface' })[0].closest('[role="tablist"]')).toBeInTheDocument()
    expect(screen.getByDisplayValue('eth0')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('eth1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'eth1' }))
    expect(screen.getByDisplayValue('eth1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'admin.exEnv.title' }))
    expect(screen.getAllByRole('button', { name: 'admin.exEnv.remove' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'admin.exEnv.remove' })[0].closest('[data-env-row]')).toBeInTheDocument()
    expect(screen.getByDisplayValue('FIRST')).toBeInTheDocument()
    expect(screen.getByDisplayValue('SECOND')).toBeInTheDocument()
  })

  it('keeps the one variable delete action next to its list entry, not below its fields', () => {
    const device = emptyDevice()
    device.EnvVars = [{ Name: 'DB_PASS', Value: '', Secret: false, HasValue: false }]
    render(<Harness device={device} />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exEnv.title' }))
    expect(screen.getByRole('button', { name: 'admin.exEnv.remove' }).closest('[data-env-row]')).toBeInTheDocument()
  })

  it('shows every environment variable as a name, value, secret and delete card', () => {
    const device = emptyDevice()
    device.EnvVars = [
      { Name: 'FIRST', Value: 'one', Secret: false, HasValue: false },
      { Name: 'SECOND', Value: 'two', Secret: true, HasValue: false },
    ]
    render(<Harness device={device} />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exEnv.title' }))
    const rows = document.querySelectorAll('[data-env-row]')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContainElement(screen.getByDisplayValue('FIRST'))
    expect(rows[0]).toContainElement(screen.getByDisplayValue('one'))
    expect(within(rows[0] as HTMLElement).getByRole('button', { name: 'admin.exEnv.secret' })).toBeInTheDocument()
    expect(rows[1]).toContainElement(screen.getByDisplayValue('SECOND'))
    expect(rows[1]).toContainElement(screen.getByTestId('secret-value-input'))
    expect(rows[0]).not.toHaveTextContent('admin.exEnv.secret')
    expect(rows[1]).not.toHaveTextContent('admin.exEnv.secret')
    expect(within(rows[0] as HTMLElement).getByRole('button', { name: 'admin.exEnv.secret' })).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelector('[role="tablist"][aria-label="admin.exEnv.title"]')).not.toBeInTheDocument()
  })

  it('groups each variable without a redundant heading or empty error gaps', () => {
    const device = emptyDevice()
    device.EnvVars = [{ Name: 'DB_PASS', Value: '', Secret: false, HasValue: false }]
    render(<Harness device={device} compact />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exEnv.title' }))
    const card = document.querySelector('[data-env-row]')!
    expect(card).toHaveClass('border')
    expect(card).toHaveClass('relative')
    expect(card).toHaveClass('p-4')
    expect(card.parentElement).toHaveClass('space-y-1')
    expect(card.querySelector('[data-env-fields]')).toHaveClass('grid-cols-1')
    expect(card.querySelector('[data-env-fields]')).toHaveClass('@min-[40rem]:grid-cols-2')
    expect(card.querySelector('[data-env-fields]')).not.toHaveClass('pt-8')
    expect(card.querySelector('[data-env-fields]')).not.toHaveClass('@min-[40rem]:pt-0')
    expect(card).toContainElement(screen.getByRole('button', { name: 'admin.exEnv.remove' }))
    expect(card.querySelector('[data-env-actions]')).toHaveClass('absolute', 'right-3', 'top-3')
    expect(card.querySelectorAll('[data-error-slot]')).toHaveLength(0)
    expect(card).not.toHaveTextContent('admin.exEnv.secret')
    expect(card).not.toHaveTextContent('admin.exEnv.variable 1')
    expect(card).toHaveAttribute('role', 'group')
    expect(card).toHaveAttribute('aria-label', 'admin.exEnv.variable 1')
  })

  it('reflows inspector fields when the panel is widened', () => {
    const device = emptyDevice()
    const compact = render(<Harness device={device} compact />)
    expect(compact.container.querySelector('[data-device-basic-grid]')).toHaveClass('grid-cols-1')
    expect(compact.container.querySelector('[data-device-basic-grid]')).not.toHaveClass('@min-[26rem]:grid-cols-2')
    expect(compact.container.querySelector('[data-device-basic-grid]')).toHaveClass('gap-2')
    expect(compact.container.querySelector('[data-device-basic-grid] p:empty')).not.toBeInTheDocument()
    expect(compact.container.querySelector('[data-device-resource-grid]')).toHaveClass('grid-cols-1')
    expect(compact.container.querySelector('[data-device-resource-grid]')).toHaveClass('@min-[26rem]:grid-cols-2')
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.interfaces' }))
    expect(compact.container.querySelector('[data-interface-grid]')).toHaveClass('grid-cols-1')
    expect(compact.container.querySelector('[data-interface-grid]')).toHaveClass('@min-[26rem]:grid-cols-2')
    expect(compact.container.querySelector('[data-interface-grid]')).toHaveClass('gap-2')
    expect(compact.container.querySelector('[data-interface-panel]')).toHaveClass('space-y-2', 'pt-2')
    expect(compact.container.querySelector('[data-interface-grid] p:empty')).not.toBeInTheDocument()
    compact.unmount()

    const wide = render(<Harness device={device} />)
    expect(wide.container.querySelector('[data-device-basic-grid]')).toHaveClass('grid-cols-1')
    wide.unmount()
  })

  it('generates the next free eth name and keeps interface tabs on one scrollable line', () => {
    const device = emptyDevice()
    device.Interfaces.push({ ...device.Interfaces[0], Name: 'eth2' })
    render(<Harness device={device} />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.interfaces' }))
    const tabs = screen.getByRole('tablist', { name: 'admin.exTopo.interfaces' })
    expect(tabs).toHaveClass('flex-nowrap', 'overflow-x-auto')
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.addInterface' }))
    expect(screen.getByDisplayValue('eth1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.addInterface' }))
    expect(screen.getByDisplayValue('eth3')).toBeInTheDocument()
    expect(screen.getAllByRole('tab', { name: /^eth/ })).toHaveLength(4)
  })

  it('imports dotenv entries as secrets, skipping device duplicates and task flag names', async () => {
    render(<LinkedDeviceHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exEnv.title' }))
    const file = new File(['PUBLIC_URL=wrong\nFLAG=wrong\nDB_PASS=correct'], 'device.env', { type: 'text/plain' })
    Object.defineProperty(file, 'text', { value: async () => 'PUBLIC_URL=wrong\nFLAG=wrong\nDB_PASS=correct' })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })
    await waitFor(() => expect(screen.getByTestId('device-values')).toHaveTextContent('DB_PASS'))
    const entries = JSON.parse(screen.getByTestId('device-values').textContent || '{}').EnvVars
    expect(entries).toHaveLength(2)
    expect(entries[0].Value).toBe('https://example.com')
    expect(entries[1]).toEqual({ Name: 'DB_PASS', Value: 'correct', Secret: true, HasValue: false })
    expect(document.querySelector('p[role="status"]')).toHaveTextContent('admin.exEnv.imported')
    expect(document.querySelector('p[role="status"]')).toHaveTextContent('admin.exEnv.duplicates')
  })
})
