/**
 * ConnectionList.test.tsx — endpoint options from topology, endpoint encoding.
 */
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { useForm, FormProvider, useFormContext, useWatch } from 'react-hook-form'

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))

import { ConnectionList, encodeEndpoint, decodeEndpoint } from './ConnectionList'
import { TopologyConnectionDialog } from './TopologyConnectionDialog'
import { emptyDraft, emptyDevice, type DraftFormValues } from '@/lib/exerciseSchemas'

describe('encode/decodeEndpoint', () => {
  it('vpn/internet encode as-is', () => {
    expect(encodeEndpoint({ Kind: 'vpn', DeviceID: '', Interface: '' })).toBe('vpn')
    expect(decodeEndpoint('internet')).toEqual({ Kind: 'internet', DeviceID: '', Interface: 'eth0' })
  })

  it('device encodes as device:<id>:<iface> (iface may be empty)', () => {
    expect(encodeEndpoint({ Kind: 'device', DeviceID: 'd1', Interface: 'eth0' })).toBe('device:d1:eth0')
    expect(decodeEndpoint('device:d1:eth0')).toEqual({ Kind: 'device', DeviceID: 'd1', Interface: 'eth0' })
    expect(decodeEndpoint('device:sw1:')).toEqual({ Kind: 'device', DeviceID: 'sw1', Interface: '' })
  })
})

function Snapshot() {
  const { control } = useFormContext<DraftFormValues>()
  const links = useWatch({ control, name: 'Variants.0.Topology.Connections' })
  return <output data-testid="links">{JSON.stringify(links)}</output>
}

function Harness({ existingVPN = true, usedSwitch = false, canvasPair = false, gatewayLabel = "", extraHost = false, onlyDevice = false, disabled = false, onShowInDiagram, onDialogClose }: { existingVPN?: boolean; usedSwitch?: boolean; canvasPair?: boolean; gatewayLabel?: string; extraHost?: boolean; onlyDevice?: boolean; disabled?: boolean; onShowInDiagram?: (index: number) => void; onDialogClose?: () => void } = {}) {
  const [draft] = useState(() => {
    const initial = emptyDraft()
    const web = emptyDevice()
    web.Name = 'web' // container with eth0
    const sw = emptyDevice()
    sw.Name = 'sw1'
    sw.Type = 'unmanaged-switch'
    sw.Interfaces = []
    const db = emptyDevice()
    db.Name = 'db'
    initial.Variants[0].Topology.Devices = onlyDevice ? [web] : extraHost ? [web, sw, db] : [web, sw]
    initial.Variants[0].Topology.VPN.Enabled = !onlyDevice
    if (gatewayLabel) initial.Variants[0].Topology.VisualRender = { version: 1, gatewayLabels: { vpn: gatewayLabel } }
    initial.Variants[0].Topology.Connections = existingVPN && !onlyDevice ? [{
      Endpoints: [
        { Kind: 'vpn', DeviceID: '', Interface: 'eth0' },
        { Kind: 'device', DeviceID: web.ID, Interface: 'eth0' },
      ],
    }] : []
    if (usedSwitch) initial.Variants[0].Topology.Connections.push({ Endpoints: [
      { Kind: 'device', DeviceID: sw.ID, Interface: 'GigabitEthernet0/1' },
      { Kind: 'device', DeviceID: web.ID, Interface: 'eth0' },
    ] })
    return initial
  })
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  const webID = draft.Variants[0].Topology.Devices[0].ID
  return (
    <FormProvider {...form}>
      <ConnectionList variantIndex={0} disabled={disabled} onShowInDiagram={onShowInDiagram} />
      {canvasPair && <TopologyConnectionDialog variantIndex={0} pair={['vpn', webID]} onClose={onDialogClose ?? (() => {})}
        onAdd={(first, second) => form.setValue('Variants.0.Topology.Connections', [
          ...form.getValues('Variants.0.Topology.Connections'), { Endpoints: [first, second] },
        ])} />}
      <Snapshot />
    </FormProvider>
  )
}

describe('ConnectionList', () => {
  it('keeps the canvas connection form open when the port trigger is clicked again', () => {
    const onDialogClose = vi.fn()
    render(<Harness canvasPair existingVPN={false} onDialogClose={onDialogClose} />)
    const trigger = screen.getByRole('button', { name: 'admin.exTopo.endpoint.second' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'admin.exTopo.canvasConnect' })).toBeInTheDocument()
    expect(onDialogClose).not.toHaveBeenCalled()
  })

  it('renders the connection and the add button', () => {
    render(<Harness />)
    expect(screen.getByRole('table', { name: 'admin.exTopo.connections' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'admin.exTopo.endpoint.first' })).not.toBeInTheDocument()
    expect(screen.getByText('admin.exTopo.endpoint.vpn · eth0')).toBeInTheDocument()
    expect(screen.getByText('web · eth0')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'web · eth0' }))
    expect(screen.getByRole('button', { name: 'admin.exTopo.endpoint.first' })).toBeInTheDocument()
  })

  it('uses a renamed gateway label in connection summaries and the canvas choice', () => {
    const view = render(<Harness gatewayLabel="vpn-edge" />)
    expect(screen.getByText('vpn-edge · eth0')).toBeInTheDocument()
    view.unmount()
    render(<Harness gatewayLabel="vpn-edge" canvasPair existingVPN={false} />)
    expect(screen.getByText('vpn-edge')).toBeInTheDocument()
  })

  it('expands only one row and offers a separate show-on-diagram action', () => {
    const onShowInDiagram = vi.fn()
    render(<Harness usedSwitch onShowInDiagram={onShowInDiagram} />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.overview.editConnectionN 1' }))
    expect(screen.getAllByRole('button', { name: 'admin.exTopo.endpoint.first' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.overview.editConnectionN 2' }))
    expect(screen.getAllByRole('button', { name: 'admin.exTopo.endpoint.first' })).toHaveLength(1)
    fireEvent.click(within(screen.getByTestId('connection-row-1')).getByRole('button', { name: 'admin.exTopo.overview.showOnDiagram' }))
    expect(onShowInDiagram).toHaveBeenCalledWith(1)
    expect(screen.queryByText(/sw-id|web-id/)).not.toBeInTheDocument()
  })

  it('keeps removal in the summary row and reveals it only on row hover or focus', () => {
    render(<Harness />)
    const row = screen.getByTestId('connection-row-0')
    const remove = screen.getByRole('button', { name: 'admin.exTopo.removeConnection' })
    expect(row).toContainElement(remove)
    expect(remove.parentElement?.parentElement).toHaveClass('opacity-0', 'group-hover:opacity-100', 'group-focus-within:opacity-100')
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.overview.editConnectionN 1' }))
    expect(screen.getByTestId('connection-editor-0')).not.toContainElement(remove)
    expect(screen.getAllByRole('button', { name: 'admin.exTopo.removeConnection' })).toHaveLength(1)
  })

  it('adds an empty connection', () => {
    render(<Harness existingVPN={false} />)
    fireEvent.click(screen.getByText('admin.exTopo.addConnection'))
    expect(screen.getAllByText('admin.exTopo.endpoint.placeholder').length).toBeGreaterThan(0)
  })

  it('does not offer an already-connected VPN or a disabled Internet gateway', () => {
    render(<Harness extraHost />)
    fireEvent.click(screen.getByText('admin.exTopo.addConnection'))
    fireEvent.keyDown(screen.getByRole('button', { name: 'admin.exTopo.endpoint.first' }), { key: 'ArrowDown' })
    expect(screen.queryByRole('menuitemradio', { name: 'admin.exTopo.endpoint.vpn' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitemradio', { name: 'admin.exTopo.endpoint.internet' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitemradio', { name: 'web · eth0' })).not.toBeInTheDocument()
  })

  it('offers an enabled VPN when it is not connected yet', () => {
    render(<Harness existingVPN={false} />)
    fireEvent.click(screen.getByText('admin.exTopo.addConnection'))
    fireEvent.keyDown(screen.getByRole('button', { name: 'admin.exTopo.endpoint.first' }), { key: 'ArrowDown' })
    expect(screen.getByRole('menuitemradio', { name: 'admin.exTopo.endpoint.vpn · eth0' })).toBeInTheDocument()
  })

  it('keeps the gateway port selectable in the row already using it', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.overview.editConnectionN 1' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'admin.exTopo.endpoint.first' }), { key: 'ArrowDown' })
    expect(screen.getByRole('menuitemradio', { name: 'admin.exTopo.endpoint.vpn · eth0' })).toBeInTheDocument()
  })

  it('adds a canvas gateway link with eth0 only after confirmation', () => {
    render(<Harness existingVPN={false} canvasPair />)
    expect(JSON.parse(screen.getByTestId('links').textContent ?? '[]')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.canvasConnect' }))
    const links = JSON.parse(screen.getByTestId('links').textContent ?? '[]')
    expect(links).toHaveLength(1)
    expect(links[0].Endpoints[0]).toEqual({ Kind: 'vpn', DeviceID: '', Interface: 'eth0' })
  })

  it('lists free switch ports by short label and keeps occupied ports out of new rows', () => {
    render(<Harness existingVPN={false} usedSwitch />)
    fireEvent.click(screen.getByText('admin.exTopo.addConnection'))
    fireEvent.keyDown(screen.getByRole('button', { name: 'admin.exTopo.endpoint.first' }), { key: 'ArrowDown' })
    expect(screen.queryByRole('menuitemradio', { name: 'sw1 · Gi0/1' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'sw1 · Gi0/2' })).toBeInTheDocument()
  })

  it('deletes a row only after the danger confirmation', () => {
    render(<Harness />)
    fireEvent.click(within(screen.getByTestId('connection-row-0')).getByRole('button', { name: 'admin.exTopo.removeConnection' }))
    const dialog = screen.getByRole('dialog', { name: 'admin.exTopo.removeConnectionTitle' })
    expect(JSON.parse(screen.getByTestId('links').textContent ?? '[]')).toHaveLength(1)
    fireEvent.click(within(dialog).getByRole('button', { name: 'admin.exTopo.canvasCancel' }))
    expect(JSON.parse(screen.getByTestId('links').textContent ?? '[]')).toHaveLength(1)
    fireEvent.click(within(screen.getByTestId('connection-row-0')).getByRole('button', { name: 'admin.exTopo.removeConnection' }))
    const confirm = within(screen.getByRole('dialog', { name: 'admin.exTopo.removeConnectionTitle' })).getByRole('button', { name: 'admin.exTopo.removeConnection' })
    expect(confirm).toHaveClass('bg-destructive')
    fireEvent.click(confirm)
    expect(JSON.parse(screen.getByTestId('links').textContent ?? '[]')).toHaveLength(0)
  })

  it('opens the row editor from the edit action', () => {
    render(<Harness />)
    fireEvent.click(within(screen.getByTestId('connection-row-0')).getByRole('button', { name: 'admin.exTopo.overview.editConnection' }))
    expect(screen.getByTestId('connection-editor-0')).toBeInTheDocument()
  })

  it('shows only view actions when read-only', () => {
    render(<Harness disabled />)
    const row = screen.getByTestId('connection-row-0')
    expect(within(row).queryByRole('button', { name: 'admin.exTopo.removeConnection' })).not.toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: 'admin.exTopo.configure' }))
    expect(screen.getByTestId('connection-editor-0')).toBeInTheDocument()
    expect(screen.queryByText('admin.exTopo.addConnection')).not.toBeInTheDocument()
  })

  it('disables «add connection» with a reason while there are fewer than two devices', () => {
    render(<Harness onlyDevice />)
    const add = screen.getByRole('button', { name: 'admin.exTopo.addConnection' })
    expect(add).toBeDisabled()
    fireEvent.pointerEnter(add.parentElement!)
    expect(screen.getByRole('tooltip')).toHaveTextContent('admin.exTopo.needTwoDevices')
  })

  it('disables «add connection» when fewer than two devices have free ports', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'admin.exTopo.addConnection' })).toBeDisabled()
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'admin.exTopo.addConnection' }).parentElement!)
    expect(screen.getByRole('tooltip')).toHaveTextContent('admin.exTopo.needFreePorts')
  })
})
