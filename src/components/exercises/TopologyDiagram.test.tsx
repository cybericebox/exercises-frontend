/**
 * TopologyDiagram.test.tsx — nodes and edges derived from a topology snapshot.
 */
import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))

import { TopologyDiagram } from './TopologyDiagram'
import type { TopologyFormValues } from '@/lib/exerciseSchemas'

const topology: TopologyFormValues = {
  VPN: { Enabled: true, DHCP: true },
  Internet: { Enabled: false, DHCP: false },
  Devices: [
    {
      ID: 'd1', Name: 'web', Type: 'container', SecurityPreset: '', Image: 'nginx',
      Resources: { CPURequest: '', MemoryRequest: '', CPULimit: '', MemoryLimit: '' },
      Interfaces: [{ Name: 'eth0', MAC: '', IP: { Type: 'dhcp', Addresses: [], Gateway: '', Routes: [] } }],
      EnvVars: [], External: { Enabled: false, Port: 80, Protocol: 'http' },
    },
    {
      ID: 'd2', Name: 'sw1', Type: 'unmanaged-switch', SecurityPreset: '', Image: '',
      Resources: { CPURequest: '', MemoryRequest: '', CPULimit: '', MemoryLimit: '' },
      Interfaces: [], EnvVars: [], External: { Enabled: false, Port: 80, Protocol: 'http' },
    },
  ],
  Connections: [
    { Endpoints: [{ Kind: 'device', DeviceID: 'd1', Interface: 'eth0' }, { Kind: 'device', DeviceID: 'd2', Interface: 'GigabitEthernet0/1' }] },
    { Endpoints: [{ Kind: 'vpn', DeviceID: '', Interface: 'eth0' }, { Kind: 'device', DeviceID: 'd2', Interface: 'GigabitEthernet0/2' }] },
  ],
  VisualRender: null,
}

describe('TopologyDiagram', () => {
  it('fits the whole board to its available height rather than clipping lower nodes', () => {
    const { container } = render(<TopologyDiagram topology={topology} />)
    const svg = container.querySelector('svg[role="img"]')!
    expect(svg).toHaveClass('h-full')
    expect(svg.parentElement).toHaveClass('h-full')
  })

  it('keeps pictograms at a fixed visual size when the canvas becomes full screen', () => {
    let onResize: ResizeObserverCallback | undefined
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { onResize = callback }
      observe() {}
      disconnect() {}
    })
    try {
      const { container } = render(<TopologyDiagram topology={topology} />)
      const svg = container.querySelector('svg[role="img"]')!
      act(() => onResize?.([{ contentRect: { width: 1440, height: 800 } } as ResizeObserverEntry], {} as ResizeObserver))
      expect(svg).toHaveAttribute('viewBox', '0 0 1440 800')
      expect(container.querySelector('[data-testid="node-d1"] [data-icon-hitbox]')).toHaveAttribute('width', '56')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('centers the measured topology and starts no larger than 125 percent', () => {
    let onResize: ResizeObserverCallback | undefined
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { onResize = callback }
      observe() {}
      disconnect() {}
    })
    try {
      const { container } = render(<TopologyDiagram topology={topology} />)
      act(() => onResize?.([{ contentRect: { width: 960, height: 560 } } as ResizeObserverEntry], {} as ResizeObserver))
      const transform = container.querySelector('[data-viewport-content]')!.getAttribute('transform')!
      const [, tx, ty, scale] = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(transform)!.map(Number)
      expect(scale).toBeLessThanOrEqual(1.25)
      expect(scale).toBeGreaterThan(0)
      const nodeCenters = Array.from(container.querySelectorAll('[data-icon-hitbox]')).map((icon) => ({
        x: (Number(icon.getAttribute('x')) + 28) * scale + tx,
        y: (Number(icon.getAttribute('y')) + 28) * scale + ty,
      }))
      expect((Math.min(...nodeCenters.map((p) => p.x)) + Math.max(...nodeCenters.map((p) => p.x))) / 2).toBeCloseTo(480, 0)
      expect((Math.min(...nodeCenters.map((p) => p.y)) + Math.max(...nodeCenters.map((p) => p.y))) / 2).toBeGreaterThan(250)
      expect((Math.min(...nodeCenters.map((p) => p.y)) + Math.max(...nodeCenters.map((p) => p.y))) / 2).toBeLessThan(310)
      expect(screen.getByRole('button', { name: 'admin.exTopo.zoomLevel' })).toHaveTextContent(`${Math.round(scale * 100)}%`)
      fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.zoomIn' }))
      const touchedTransform = container.querySelector('[data-viewport-content]')!.getAttribute('transform')
      act(() => onResize?.([{ contentRect: { width: 1024, height: 600 } } as ResizeObserverEntry], {} as ResizeObserver))
      expect(container.querySelector('[data-viewport-content]')).toHaveAttribute('transform', touchedTransform)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('brings nodes saved near the top into the middle of a short reopened canvas', () => {
    let onResize: ResizeObserverCallback | undefined
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { onResize = callback }
      observe() {}
      disconnect() {}
    })
    try {
      const shifted = { ...topology, VisualRender: { version: 1, positions: {
        vpn: { x: 0.1, y: 0.1 }, d1: { x: 0.5, y: 0.1 }, d2: { x: 0.9, y: 0.1 },
      } } }
      const { container } = render(<TopologyDiagram topology={shifted} />)
      act(() => onResize?.([{ contentRect: { width: 960, height: 330 } } as ResizeObserverEntry], {} as ResizeObserver))
      const transform = container.querySelector('[data-viewport-content]')!.getAttribute('transform')!
      const [, , ty, scale] = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(transform)!.map(Number)
      const nodeY = Number(container.querySelector('[data-testid="node-d1"] [data-icon-hitbox]')!.getAttribute('y')) + 28
      expect(nodeY * scale + ty).toBeGreaterThan(110)
      expect(nodeY * scale + ty).toBeLessThan(190)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('grows its inner board and keeps every auto-placed node distinct in a dense topology', () => {
    const devices = Array.from({ length: 30 }, (_, index) => ({
      ...topology.Devices[0], ID: `host-${index + 1}`, Name: `host-${index + 1}`,
    }))
    const { container } = render(<TopologyDiagram topology={{ ...topology, VPN: { Enabled: false, DHCP: false }, Devices: devices, Connections: [], VisualRender: null }} />)
    const svg = container.querySelector('svg[role="img"]')!
    const [, , width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number)
    const points = Array.from(container.querySelectorAll('[data-icon-hitbox]')).map((rect) =>
      `${rect.getAttribute('x')},${rect.getAttribute('y')}`)
    expect(Number(height)).toBeGreaterThan(560)
    expect(Number(width)).toBe(960)
    expect(new Set(points).size).toBe(30)
    expect(svg.parentElement).toHaveClass('overflow-auto')
  })

  it('does not reserve empty gateway rows above a standalone forwarding device', () => {
    const { container } = render(<TopologyDiagram topology={{ ...topology, VPN: { Enabled: false, DHCP: false }, Connections: [] }} />)
    const switchY = Number(container.querySelector('[data-testid="node-d2"] [data-icon-hitbox]')?.getAttribute('y'))
    const hostY = Number(container.querySelector('[data-testid="node-d1"] [data-icon-hitbox]')?.getAttribute('y'))
    expect(switchY).toBeLessThan(180)
    expect(hostY).toBeGreaterThan(switchY)
  })

  it('starts a hosts-only topology in the first available row', () => {
    const { container } = render(<TopologyDiagram topology={{ ...topology, VPN: { Enabled: false, DHCP: false }, Devices: [topology.Devices[0]], Connections: [] }} />)
    const hostY = Number(container.querySelector('[data-testid="node-d1"] [data-icon-hitbox]')?.getAttribute('y'))
    expect(hostY).toBeLessThan(180)
  })

  it('uses distinct custom vector pictograms instead of bitmap images', () => {
    const { container } = render(<TopologyDiagram topology={topology} />)
    expect(container.querySelectorAll('[data-testid^="node-"] image')).toHaveLength(0)
    const glyphs = ['d1', 'd2', 'vpn'].map((key) => container.querySelector(`[data-testid="node-${key}"] [data-topology-glyph]`))
    expect(glyphs.every(Boolean)).toBe(true)
    expect(new Set(glyphs.map((glyph) => glyph?.getAttribute('data-topology-glyph'))).size).toBe(3)
  })

  it('moves a label independently and preserves its offset relative to the node', () => {
    const onLabelOffsetChange = vi.fn()
    const onPositionChange = vi.fn()
    const { container } = render(<TopologyDiagram topology={topology} onLabelOffsetChange={onLabelOffsetChange} onPositionChange={onPositionChange} />)
    const svg = container.querySelector('svg')!
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 960, height: 560 } as DOMRect)
    const label = container.querySelector('[data-testid="node-d1"] [data-node-label]')!
    const startX = Number(label.getAttribute('x'))
    const startY = Number(label.getAttribute('y'))
    fireEvent(label, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: startX, clientY: startY }))
    fireEvent(svg, new MouseEvent('pointermove', { bubbles: true, clientX: startX + 35, clientY: startY - 20 }))
    fireEvent(svg, new MouseEvent('pointerup', { bubbles: true, clientX: startX + 35, clientY: startY - 20 }))
    expect(onLabelOffsetChange).toHaveBeenCalledWith('d1', expect.any(Object))
    expect(onLabelOffsetChange.mock.calls[0][1].x).toBeCloseTo(35, 3)
    expect(onLabelOffsetChange.mock.calls[0][1].y).toBeCloseTo(-20, 3)
    expect(onPositionChange).not.toHaveBeenCalled()
  })

  it('keeps a dragged node label the same distance from its node after moving and resizing', () => {
    let onResize: ResizeObserverCallback | undefined
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { onResize = callback }
      observe() {}
      disconnect() {}
    })
    try {
      const visual = { version: 1, positions: { d1: { x: 0.3, y: 0.4 } }, labelOffsets: { d1: { x: 35, y: -20 } } }
      const { container, rerender } = render(<TopologyDiagram topology={{ ...topology, VisualRender: visual }} />)
      const distance = () => {
        const node = container.querySelector('[data-testid="node-d1"]')!
        const icon = node.querySelector('[data-icon-hitbox]')!
        const label = node.querySelector('[data-node-label]')!
        return {
          x: Number(label.getAttribute('x')) - Number(icon.getAttribute('x')) - 28,
          y: Number(label.getAttribute('y')) - Number(icon.getAttribute('y')) - 28,
        }
      }
      const initial = distance()
      expect(initial).toEqual({ x: 35, y: 25 })
      rerender(<TopologyDiagram topology={{ ...topology, VisualRender: {
        ...visual, positions: { d1: { x: 0.7, y: 0.6 } },
      } }} />)
      expect(distance().x).toBeCloseTo(initial.x, 6)
      expect(distance().y).toBeCloseTo(initial.y, 6)
      act(() => onResize?.([{ contentRect: { width: 1440, height: 800 } } as ResizeObserverEntry], {} as ResizeObserver))
      expect(distance().x).toBeCloseTo(initial.x, 6)
      expect(distance().y).toBeCloseTo(initial.y, 6)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('renders a node per device plus enabled networks', () => {
    render(<TopologyDiagram topology={topology} />)
    expect(screen.getByText('web', { selector: 'text' })).toBeInTheDocument()
    expect(screen.getByText('sw1', { selector: 'text' })).toBeInTheDocument()
    expect(screen.getByText('admin.exTopo.vpn', { selector: 'text' })).toBeInTheDocument() // VPN enabled
    expect(screen.queryByText('admin.exTopo.internet')).not.toBeInTheDocument() // Internet disabled
  })

  it('does not select the label text or open an editor when the label is dragged', () => {
    const onLabelOffsetChange = vi.fn()
    const { container } = render(<TopologyDiagram topology={topology} onLabelOffsetChange={onLabelOffsetChange} />)
    const label = container.querySelector('[data-testid="node-d1"] [data-node-label]')!
    expect(label).toHaveClass('select-none', 'cursor-grab')
    expect(label).toHaveStyle({ userSelect: 'none' })
    const svg = container.querySelector('svg')!
    fireEvent(label, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 200, clientY: 200 }))
    fireEvent(svg, new MouseEvent('pointermove', { bubbles: true, clientX: 235, clientY: 205 }))
    expect(container.querySelector('[data-testid="node-d1"] [data-node-label]')).toHaveClass('cursor-grabbing')
    fireEvent(svg, new MouseEvent('pointerup', { bubbles: true, clientX: 235, clientY: 205 }))
    expect(container.querySelector('[data-testid="node-d1"] [data-node-label]')).toHaveClass('cursor-grab')
    fireEvent.click(label)
    expect(onLabelOffsetChange).toHaveBeenCalled()
  })

  it('hints at double-click rename on the label without making the pencil a pointer target', () => {
    const { container } = render(<TopologyDiagram topology={topology} onNodeRename={() => null} />)
    const label = container.querySelector('[data-testid="node-d1"] [data-node-label]')!
    const pencil = label.parentElement!.querySelector('svg')!
    expect(label).toHaveClass('select-none')
    expect(label).toHaveStyle({ userSelect: 'none' })
    expect(pencil).toHaveClass('pointer-events-none', 'opacity-0', 'group-hover/label:opacity-100')
    fireEvent.mouseEnter(label.parentElement!)
    expect(screen.getByRole('tooltip')).toHaveTextContent('admin.exTopo.renameOnDoubleClick')
    fireEvent.keyDown(label, { key: 'F2' })
    expect(screen.getByRole('textbox', { name: 'admin.exTopo.deviceName' })).toHaveValue('web')
  })

  it('keeps the default port captions clear of the node names', () => {
    const { container } = render(<TopologyDiagram topology={topology} />)
    const names = Array.from(container.querySelectorAll('[data-node-label]')).map((n) => ({ x: Number(n.getAttribute('x')), y: Number(n.getAttribute('y')) - 5 }))
    const ports = Array.from(container.querySelectorAll('[data-port-label]')).map((n) => ({ x: Number(n.getAttribute('x')), y: Number(n.getAttribute('y')) }))
    expect(ports.length).toBeGreaterThan(0)
    for (const port of ports) for (const name of names) {
      expect(Math.abs(port.x - name.x) < 20 && Math.abs(port.y - name.y) < 10).toBe(false)
    }
  })

  it('moves a port caption independently of its connection and keeps the offset in visual data', () => {
    const onPortLabelOffsetChange = vi.fn()
    const onEdgeSelect = vi.fn()
    const { container, rerender } = render(<TopologyDiagram topology={topology}
      onPortLabelOffsetChange={onPortLabelOffsetChange} onEdgeSelect={onEdgeSelect} />)
    const svg = container.querySelector('svg[role="img"]')!
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 960, height: 560 } as DOMRect)
    const caption = container.querySelector('[data-edge="e0"]')!.parentElement!.querySelector('[data-port-label]')!
    const key = caption.getAttribute('data-port-label-key')!
    const initialX = Number(caption.getAttribute('x'))
    expect(caption).toHaveClass('select-none', 'cursor-grab')
    fireEvent(caption, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 200, clientY: 200 }))
    fireEvent(svg, new MouseEvent('pointermove', { bubbles: true, clientX: 230, clientY: 215 }))
    expect(caption).toHaveClass('cursor-grabbing')
    fireEvent(svg, new MouseEvent('pointerup', { bubbles: true, clientX: 230, clientY: 215 }))
    expect(caption).toHaveClass('cursor-grab')
    fireEvent.click(caption)
    expect(onEdgeSelect).not.toHaveBeenCalled()
    expect(onPortLabelOffsetChange).toHaveBeenCalledWith(key, { x: expect.any(Number), y: expect.any(Number) })
    expect(Math.hypot(...Object.values(onPortLabelOffsetChange.mock.calls[0][1]) as [number, number])).toBeCloseTo(Math.hypot(30, 15), 0)
    const moved = { ...topology, VisualRender: { version: 1, portLabelOffsets: { [key]: onPortLabelOffsetChange.mock.calls[0][1] } } }
    rerender(<TopologyDiagram topology={moved} onPortLabelOffsetChange={onPortLabelOffsetChange} onEdgeSelect={onEdgeSelect} />)
    expect(Number(container.querySelector(`[data-port-label-key='${key}']`)!.getAttribute('x')))
      .toBeGreaterThan(initialX)
  })

  it('keeps each port caption a fixed distance from its own connection end when the edge or canvas changes', () => {
    let onResize: ResizeObserverCallback | undefined
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { onResize = callback }
      observe() {}
      disconnect() {}
    })
    try {
      const visual = { version: 1, positions: { d1: { x: 0.2, y: 0.4 }, d2: { x: 0.7, y: 0.4 } },
        portLabelOffsets: {
          [JSON.stringify(['d1', 'eth0'])]: { x: 18, y: 12 },
          [JSON.stringify(['d2', 'GigabitEthernet0/1'])]: { x: -7, y: 5 },
        } }
      const { container, rerender } = render(<TopologyDiagram topology={{ ...topology, VisualRender: visual }} />)
      const distances = () => {
        const edge = container.querySelector('[data-edge="e0"]')!.parentElement!
        const [startX, startY, endX, endY] = edge.querySelector('[data-edge]')!.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
        const captions = Array.from(edge.querySelectorAll('[data-port-label]'))
        return captions.map((caption, index) => Math.hypot(
          Number(caption.getAttribute('x')) - (index === 0 ? startX : endX),
          Number(caption.getAttribute('y')) - (index === 0 ? startY : endY),
        ))
      }
      const initial = distances()
      expect(initial).toHaveLength(2)
      expect(initial[0]).toBeGreaterThan(10)
      rerender(<TopologyDiagram topology={{ ...topology, VisualRender: {
        ...visual, positions: { d1: { x: 0.2, y: 0.4 }, d2: { x: 0.9, y: 0.6 } },
      } }} />)
      distances().forEach((distance, index) => expect(distance).toBeCloseTo(initial[index], 1))
      act(() => onResize?.([{ contentRect: { width: 1440, height: 800 } } as ResizeObserverEntry], {} as ResizeObserver))
      distances().forEach((distance, index) => expect(distance).toBeCloseTo(initial[index], 1))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('identifies connections by visible device names, not internal IDs', () => {
    const { container } = render(<TopologyDiagram topology={topology} onEdgeSelect={vi.fn()} />)
    const edge = container.querySelector('[data-edge="e0"]')!.parentElement!
    expect(edge).toHaveAttribute('aria-label', 'web — sw1')
    expect(edge.querySelector('title')).not.toBeInTheDocument()
    fireEvent.mouseEnter(edge)
    expect(screen.getByRole('tooltip')).toHaveTextContent('web: eth0 — sw1: GigabitEthernet0/1')
    fireEvent.mouseLeave(edge)
    const node = screen.getByTestId('node-d1')
    fireEvent.mouseEnter(node.querySelector('[data-icon-hitbox]')!)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(node.querySelector('title')).not.toBeInTheDocument()
  })

  it('draws each pictogram directly on the board with a label below, without a white tile', () => {
    const { container } = render(<TopologyDiagram topology={topology} />)
    for (const key of ['d1', 'd2', 'vpn']) {
      const node = container.querySelector(`[data-testid="node-${key}"]`)!
      const hitbox = node.querySelector('rect[data-icon-hitbox]')!
      const picture = node.querySelector('[data-topology-glyph]')!
      const label = node.querySelector('text')!
      expect(hitbox).toHaveAttribute('width', hitbox.getAttribute('height'))
      expect(hitbox).toHaveAttribute('fill', 'transparent')
      expect(picture).toBeInTheDocument()
      expect(Number(label.getAttribute('y'))).toBeGreaterThan(Number(hitbox.getAttribute('y')) + Number(hitbox.getAttribute('height')))
      expect(Array.from(node.children).filter((child) => child.tagName.toLowerCase() === 'rect' && child.getAttribute('fill') !== 'none')).toHaveLength(1)
    }
    expect(container.querySelector('[data-testid="node-d2"] [data-topology-glyph]')).toHaveAttribute('data-topology-glyph', 'switch')
  })

  it('keeps a generous click target but outlines only the visible pictogram', () => {
    const { container } = render(<TopologyDiagram topology={topology} selectedNodes={['d1', 'vpn']} />)
    const host = container.querySelector('[data-testid="node-d1"]')!
    expect(host.querySelector('[data-icon-hitbox]')).toHaveAttribute('width', '56')
    expect(Number(host.querySelector('[data-selection-outline]')?.getAttribute('width'))).toBeLessThan(34)
    expect(host.querySelector('[data-selection-outline]')).toHaveClass('stroke-primary')
    expect(host.querySelector('[data-icon-hitbox]')).toHaveClass('stroke-transparent')
    const internetTopology = { ...topology, Internet: { Enabled: true, DHCP: false } }
    const round = render(<TopologyDiagram topology={internetTopology} selectedNodes={['internet']} />)
    expect(Number(round.container.querySelector('[data-testid="node-internet"] circle[data-selection-outline]')?.getAttribute('r'))).toBeLessThan(19)
  })

  it('uses a visual-only pictogram override without changing the device type', () => {
    const visual = { ...topology, VisualRender: { version: 1, icons: { d1: 'firewall' } } }
    const { container } = render(<TopologyDiagram topology={visual} />)
    expect(container.querySelector('[data-testid="node-d1"] [data-topology-glyph]')).toHaveAttribute('data-topology-glyph', 'firewall')
    expect(container.querySelector('[data-testid="node-d2"] [data-topology-glyph]')).toHaveAttribute('data-topology-glyph', 'switch')
  })

  it('draws a line per resolvable connection and labels interfaces', () => {
    const { container } = render(<TopologyDiagram topology={topology} />)
    expect(container.querySelectorAll('[data-edge]')).toHaveLength(2)
    expect(screen.getAllByText('eth0').length).toBeGreaterThanOrEqual(2)
  })

  it('makes a thin connection easy to select without widening its visible stroke', () => {
    const onEdgeSelect = vi.fn()
    const { container } = render(<TopologyDiagram topology={topology} onEdgeSelect={onEdgeSelect} />)
    const edge = container.querySelector('[data-edge="e0"]')!
    const hitTarget = container.querySelector('[data-edge-hit="e0"]')!
    expect(edge).toHaveAttribute('stroke-width', '2')
    expect(hitTarget).toHaveAttribute('stroke-width', '16')
    expect(hitTarget).toHaveAttribute('stroke', 'transparent')
    fireEvent.click(hitTarget)
    expect(onEdgeSelect).toHaveBeenCalledWith(0)
  })

  it('reveals port names only for the active link when many links converge', () => {
    const devices = [topology.Devices[1], ...Array.from({ length: 6 }, (_, index) => ({
      ...topology.Devices[0], ID: `host-${index}`, Name: `host-${index}`,
    }))]
    const connections = devices.slice(1).map((device, index) => ({ Endpoints: [
      { Kind: 'device' as const, DeviceID: topology.Devices[1].ID, Interface: `GigabitEthernet0/${index + 1}` },
      { Kind: 'device' as const, DeviceID: device.ID, Interface: 'eth0' },
    ] }))
    const { container } = render(<TopologyDiagram topology={{ ...topology, Devices: devices, Connections: connections }} selectedConnectionIndex={0} onEdgeSelect={() => {}} />)
    const activeLabels = container.querySelector('[data-edge="e0"]')?.parentElement?.querySelectorAll('[data-port-label]') ?? []
    const quietLabels = container.querySelector('[data-edge="e1"]')?.parentElement?.querySelectorAll('[data-port-label]') ?? []
    expect(activeLabels).toHaveLength(2)
    expect(quietLabels).toHaveLength(2)
    for (const label of activeLabels) expect(label).not.toHaveClass('opacity-0')
    for (const label of quietLabels) {
      expect(label).toHaveClass('opacity-0')
      expect(label).toHaveClass('group-hover:opacity-100')
      expect(label).toHaveClass('group-focus-visible:opacity-100')
    }
  })

  it('keeps a device name readable when several links pass behind it', () => {
    const { container } = render(<TopologyDiagram topology={topology} />)
    const name = container.querySelector('[data-testid="node-d2"] [data-node-label]')!
    expect(name).toHaveAttribute('paint-order', 'stroke')
    expect(name).toHaveAttribute('stroke-width', '4')
  })

  it('joins the visible glyph boundaries without detached endpoint circles', () => {
    const connected: TopologyFormValues = {
      ...topology,
      Internet: { Enabled: true, DHCP: false },
      Connections: [{ Endpoints: [
        { Kind: 'device', DeviceID: 'd1', Interface: 'eth0' },
        { Kind: 'internet', DeviceID: '', Interface: 'eth0' },
      ] }],
      VisualRender: { version: 1, positions: { d1: { x: 0.2, y: 0.4 }, internet: { x: 0.8, y: 0.4 } } },
    }
    const { container } = render(<TopologyDiagram topology={connected} />)
    expect(container.querySelector('[data-edge="e0"]')).toHaveAttribute('d', 'M 204.67 224 L 752.56 224')
    expect(container.querySelector('[data-edge="e0"]')?.parentElement?.querySelectorAll('circle')).toHaveLength(0)
  })

  it('skips connections with unresolved endpoints', () => {
    const broken: TopologyFormValues = {
      ...topology,
      Connections: [{ Endpoints: [{ Kind: 'device', DeviceID: 'ghost', Interface: '' }, { Kind: 'vpn', DeviceID: '', Interface: 'eth0' }] }],
    }
    const { container } = render(<TopologyDiagram topology={broken} />)
    expect(container.querySelectorAll('[data-edge]')).toHaveLength(0)
  })

  it('renders without crashing for an empty topology', () => {
    const empty: TopologyFormValues = {
      VPN: { Enabled: false, DHCP: false },
      Internet: { Enabled: false, DHCP: false },
      Devices: [],
      Connections: [],
      VisualRender: null,
    }
    const { container } = render(<TopologyDiagram topology={empty} />)
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelectorAll('[data-edge]')).toHaveLength(0)
  })

  it('uses saved positions and lets an editor move a node with the keyboard', () => {
    const moved = { ...topology, VisualRender: { version: 1, positions: { d1: { x: 0.2, y: 0.4 } } } }
    const onPositionChange = vi.fn()
    const { container } = render(<TopologyDiagram topology={moved} onPositionChange={onPositionChange} />)
    expect(container.querySelector('[data-testid="node-d1"] rect[data-icon-hitbox]')).toHaveAttribute('x', '164')
    fireEvent.keyDown(screen.getByRole('button', { name: 'web' }), { key: 'ArrowRight' })
    expect(onPositionChange).toHaveBeenCalledWith('d1', expect.objectContaining({ x: expect.any(Number), y: 0.4 }))
    expect(onPositionChange.mock.calls[0][1].x).toBeGreaterThan(0.2)
  })

  it('commits a dragged node position in normalized canvas coordinates', () => {
    const onPositionChange = vi.fn()
    const { container } = render(<TopologyDiagram topology={topology} onPositionChange={onPositionChange} />)
    const svg = container.querySelector('svg')!
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 960, height: 560 } as DOMRect)
    fireEvent(screen.getByRole('button', { name: 'web' }), new MouseEvent('pointerdown', { bubbles: true, clientX: 480, clientY: 56 }))
    fireEvent(svg, new MouseEvent('pointermove', { bubbles: true, clientX: 384, clientY: 280 }))
    fireEvent(svg, new MouseEvent('pointerup', { bubbles: true, clientX: 384, clientY: 280 }))
    expect(onPositionChange).toHaveBeenCalledWith('d1', { x: 0.4, y: 0.5 })
  })

  it('captures a pointer on the pressed node so the later click can select it', () => {
    const onNodeSelect = vi.fn()
    const onPositionChange = vi.fn()
    const { container } = render(<TopologyDiagram topology={topology} onNodeSelect={onNodeSelect} onPositionChange={onPositionChange} />)
    const node = container.querySelector('[data-testid="node-d1"]') as SVGGElement
    const svg = container.querySelector('svg')!
    const captureNode = vi.fn()
    const captureCanvas = vi.fn()
    node.setPointerCapture = captureNode
    svg.setPointerCapture = captureCanvas
    fireEvent(node, new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    expect(captureNode).toHaveBeenCalledOnce()
    expect(captureCanvas).not.toHaveBeenCalled()
    fireEvent.pointerUp(node, { pointerId: 4 })
    fireEvent.click(node)
    expect(onNodeSelect).toHaveBeenCalledWith('d1')
  })

  it('still selects the second node after small pointer movement while starting a link', () => {
    const onNodeSelect = vi.fn()
    const onPositionChange = vi.fn()
    const { container } = render(<TopologyDiagram topology={topology} onNodeSelect={onNodeSelect} onPositionChange={onPositionChange} />)
    const node = screen.getByRole('button', { name: 'sw1' })
    const svg = container.querySelector('svg')!
    fireEvent(node, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 400, clientY: 260 }))
    fireEvent(svg, new MouseEvent('pointermove', { bubbles: true, clientX: 402, clientY: 261 }))
    fireEvent(svg, new MouseEvent('pointerup', { bubbles: true, clientX: 402, clientY: 261 }))
    fireEvent.click(node)
    expect(onNodeSelect).toHaveBeenCalledWith('d2')
    expect(onPositionChange).not.toHaveBeenCalled()
  })

  it('opens the VPN connector configuration from its context menu', () => {
    const onNodeSettings = vi.fn()
    const onNodeLinkStart = vi.fn()
    render(<TopologyDiagram topology={topology} onNodeSettings={onNodeSettings} onNodeLinkStart={onNodeLinkStart} onNodeRemove={vi.fn()} />)
    fireEvent.contextMenu(screen.getByTestId('node-vpn'))
    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
    fireEvent.click(screen.getByRole('menuitem', { name: 'admin.exTopo.configure' }))
    expect(onNodeSettings).toHaveBeenCalledWith('vpn')
  })

  it('opens a canvas context menu at empty space and starts a link from a node menu', () => {
    const onCanvasAddNode = vi.fn()
    const onNodeLinkStart = vi.fn()
    const { container } = render(<TopologyDiagram topology={topology} onCanvasAddNode={onCanvasAddNode} onNodeLinkStart={onNodeLinkStart} />)
    const svg = container.querySelector('svg')!
    fireEvent.contextMenu(svg, { clientX: 250, clientY: 220 })
    expect(screen.getByRole('menu', { name: 'admin.exTopo.diagram' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'admin.exTopo.type.container' }))
    expect(onCanvasAddNode).toHaveBeenCalledWith('container', expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }))
    fireEvent.contextMenu(screen.getByTestId('node-d1'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'admin.exTopo.addConnection' }))
    expect(onNodeLinkStart).toHaveBeenCalledWith('d1')
  })

  it('keeps the connection action card open when its empty area is clicked', () => {
    render(<TopologyDiagram topology={topology} onNodeLinkStart={vi.fn()} />)
    fireEvent.contextMenu(screen.getByTestId('node-d1'))
    const menu = screen.getByRole('menu', { name: 'admin.exTopo.deviceSettings' })
    fireEvent.pointerDown(menu)
    fireEvent.click(menu)
    expect(menu).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu', { name: 'admin.exTopo.deviceSettings' })).not.toBeInTheDocument()
    fireEvent.contextMenu(screen.getByTestId('node-d1'))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'admin.exTopo.deviceSettings' })).not.toBeInTheDocument()
  })

  it('renders the context menu in a portal on the page body, bordered and without a shadow', () => {
    const { container } = render(<TopologyDiagram topology={topology} onNodeSettings={vi.fn()} />)
    fireEvent.contextMenu(screen.getByTestId('node-d1'), { clientX: 40, clientY: 40 })
    const menu = screen.getByRole('menu', { name: 'admin.exTopo.deviceSettings' })
    expect(container).not.toContainElement(menu)
    expect(menu.parentElement).toBe(document.body)
    expect(menu).toHaveClass('fixed', 'border', 'border-border')
    expect(menu.className).not.toMatch(/shadow/)
  })

  it('opens the node menu from the keyboard, moves with arrows and returns focus on Escape', () => {
    render(<TopologyDiagram topology={topology} onNodeSelect={vi.fn()} onNodeSettings={vi.fn()} onNodeLinkStart={vi.fn()} onNodeRemove={vi.fn()} />)
    const node = screen.getByTestId('node-d1')
    node.focus()
    fireEvent.keyDown(node, { key: 'F10', shiftKey: true })
    const items = screen.getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual(['admin.exTopo.configure', 'admin.exTopo.addConnection', 'admin.exTopo.removeDevice'])
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(items[0], { key: 'ArrowDown' })
    expect(items[1]).toHaveFocus()
    fireEvent.keyDown(items[1], { key: 'End' })
    expect(items[2]).toHaveFocus()
    fireEvent.keyDown(items[2], { key: 'ArrowDown' })
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(items[0], { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(node).toHaveFocus()
    fireEvent.keyDown(node, { key: 'ContextMenu' })
    expect(screen.getByRole('menu', { name: 'admin.exTopo.deviceSettings' })).toBeInTheDocument()
  })

  it('offers configure and delete on a connection, by mouse and by keyboard', () => {
    const onEdgeSettings = vi.fn()
    const onEdgeRemove = vi.fn()
    const onEdgeSelect = vi.fn()
    const { container } = render(<TopologyDiagram topology={topology} onEdgeSelect={onEdgeSelect} onEdgeSettings={onEdgeSettings} onEdgeRemove={onEdgeRemove} />)
    const edge = container.querySelector('[data-edge="e0"]')!.parentElement!
    fireEvent.contextMenu(edge)
    expect(onEdgeSelect).toHaveBeenCalledWith(0)
    expect(screen.getByRole('menu', { name: 'admin.exTopo.connectionMenu' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'admin.exTopo.configure' }))
    expect(onEdgeSettings).toHaveBeenCalledWith(0)
    edge.focus()
    fireEvent.keyDown(edge, { key: 'F10', shiftKey: true })
    const remove = screen.getByRole('menuitem', { name: 'admin.exTopo.removeConnection' })
    expect(remove).toHaveClass('text-destructive')
    fireEvent.click(remove)
    expect(onEdgeRemove).toHaveBeenCalledWith(0)
    fireEvent.keyDown(edge, { key: 'Delete' })
    expect(onEdgeRemove).toHaveBeenCalledTimes(2)
  })

  it('removes a focused node with Delete through the same confirmation path', () => {
    const onNodeRemove = vi.fn()
    render(<TopologyDiagram topology={topology} onNodeSelect={vi.fn()} onNodeRemove={onNodeRemove} />)
    fireEvent.keyDown(screen.getByTestId('node-d1'), { key: 'Delete' })
    expect(onNodeRemove).toHaveBeenCalledWith('d1')
  })

  it('keeps «add connection» visible but disabled with the reason when a link cannot start', () => {
    const onCanvasLinkStart = vi.fn()
    const onNodeLinkStart = vi.fn()
    const { container } = render(<TopologyDiagram topology={topology} onCanvasAddNode={vi.fn()} onCanvasLinkStart={onCanvasLinkStart}
      onNodeLinkStart={onNodeLinkStart} linkUnavailableReason="need-two" />)
    fireEvent.contextMenu(container.querySelector('svg')!, { clientX: 100, clientY: 100 })
    const canvasLink = screen.getByRole('menuitem', { name: 'admin.exTopo.addConnection' })
    expect(canvasLink).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(canvasLink)
    expect(onCanvasLinkStart).not.toHaveBeenCalled()
    fireEvent.pointerEnter(canvasLink.parentElement!)
    expect(screen.getByRole('tooltip')).toHaveTextContent('need-two')
    fireEvent.pointerDown(document.body)
    fireEvent.contextMenu(screen.getByTestId('node-d1'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'admin.exTopo.addConnection' }))
    expect(onNodeLinkStart).not.toHaveBeenCalled()
  })

  it('opens only «configure» in a read-only diagram and no menu on the empty canvas', () => {
    const { container } = render(<TopologyDiagram topology={topology} onNodeSettings={vi.fn()} onEdgeSettings={vi.fn()} />)
    fireEvent.contextMenu(screen.getByTestId('node-d1'))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['admin.exTopo.configure'])
    fireEvent.pointerDown(document.body)
    fireEvent.contextMenu(container.querySelector('svg')!, { clientX: 100, clientY: 100 })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('uses unique grid patterns across two simultaneous diagrams', () => {
    const { container } = render(<><TopologyDiagram topology={topology} /><TopologyDiagram topology={topology} /></>)
    const patterns = Array.from(container.querySelectorAll('pattern')).map((pattern) => pattern.id)
    expect(patterns).toHaveLength(2)
    expect(new Set(patterns).size).toBe(2)
  })

  it('shows the one-port labels and distinct pictograms for both connector kinds', () => {
    const both = { ...topology, Internet: { Enabled: true, DHCP: false }, Connections: [
      ...topology.Connections,
      { Endpoints: [{ Kind: 'internet' as const, DeviceID: '', Interface: 'eth0' }, { Kind: 'device' as const, DeviceID: 'd1', Interface: 'eth1' }] },
    ] }
    const { container } = render(<TopologyDiagram topology={both} selectedConnectionIndex={2} />)
    expect(container.querySelector('[data-testid="node-vpn"] [data-topology-glyph]')).toHaveAttribute('data-topology-glyph', 'vpn')
    expect(container.querySelector('[data-testid="node-internet"] [data-topology-glyph]')).toHaveAttribute('data-topology-glyph', 'internet')
    expect(container.querySelectorAll('text')).not.toHaveLength(0)
    expect(container.querySelector('[data-edge="e2"]')).toHaveClass('stroke-primary')
    expect(container.querySelector('[data-edge="e2"]')?.parentElement).toHaveTextContent('eth0')
  })

  it('offers keyboard-accessible zoom and fit controls without changing topology data', () => {
    const { container } = render(<TopologyDiagram topology={topology} />)
    const content = container.querySelector('[data-viewport-content]')!
    expect(content).toHaveAttribute('transform', 'translate(0 0) scale(1)')
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.zoomIn' }))
    expect(content).toHaveAttribute('transform', expect.stringContaining('scale(1.25)'))
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.zoomOut' }))
    expect(content).toHaveAttribute('transform', 'translate(0 0) scale(1)')
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.fitCanvas' }))
    expect(content.getAttribute('transform')).not.toBe('translate(0 0) scale(1)')
    expect(topology.VisualRender).toBeNull()
  })

  it('offers preset and entered zoom levels and a compact dotted grid', () => {
    const { container } = render(<TopologyDiagram topology={topology} />)
    const content = container.querySelector('[data-viewport-content]')!
    const pattern = container.querySelector('pattern')!
    expect(pattern).toHaveAttribute('width', '10')
    expect(pattern).toHaveAttribute('height', '10')
    expect(pattern.querySelector('circle')).toHaveAttribute('r', '0.9')
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.zoomLevel' }))
    fireEvent.click(screen.getByRole('button', { name: '150%' }))
    expect(content.getAttribute('transform')).toContain('scale(1.5)')
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.zoomLevel' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'admin.exTopo.zoomCustom' }), { target: { value: '88' } })
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.zoomApply' }))
    expect(content.getAttribute('transform')).toContain('scale(0.88)')
    expect(topology.VisualRender).toBeNull()
  })

  it('fits moved node labels and port captions with breathing room', () => {
    const moved = { ...topology, VisualRender: { version: 1, positions: { d1: { x: 1.18, y: 0.5 } }, labelOffsets: { d1: { x: 0.32, y: 0 } } } }
    const { container } = render(<TopologyDiagram topology={moved} />)
    const content = container.querySelector('[data-viewport-content]')!
    expect(Number(container.querySelector('[data-testid="node-d1"] [data-icon-hitbox]')!.getAttribute('x'))).toBeGreaterThan(960)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.fitCanvas' }))
    const transform = content.getAttribute('transform')!
    const match = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(transform)!
    const [, tx, , scale] = match.map(Number)
    const label = container.querySelector('[data-testid="node-d1"] [data-node-label]')!
    const rightEdge = Number(label.getAttribute('x')) * scale + tx + 35 * scale
    expect(rightEdge).toBeLessThan(920)
    expect(rightEdge).toBeGreaterThan(100)
  })

  it('does not trap a dragged node inside an invisible inset', () => {
    const onPositionChange = vi.fn()
    const { container } = render(<TopologyDiagram topology={topology} onPositionChange={onPositionChange} />)
    const svg = container.querySelector('svg[role="img"]')!
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 960, height: 560 } as DOMRect)
    const node = screen.getByTestId('node-d1')
    fireEvent(node, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 450, clientY: 300 }))
    fireEvent(svg, new MouseEvent('pointermove', { bubbles: true, clientX: 1100, clientY: 300 }))
    fireEvent(svg, new MouseEvent('pointerup', { bubbles: true, clientX: 1100, clientY: 300 }))
    expect(onPositionChange.mock.calls[0][1].x).toBeGreaterThan(1)
  })

  it('pans on blank background without selecting or moving a device', () => {
    const onNodeSelect = vi.fn()
    const onPositionChange = vi.fn()
    const onCanvasSelect = vi.fn()
    const { container } = render(<TopologyDiagram topology={topology} onNodeSelect={onNodeSelect}
      onPositionChange={onPositionChange} onCanvasSelect={onCanvasSelect} />)
    const svg = container.querySelector('svg[role="img"]')!
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 960, height: 560 } as DOMRect)
    const background = container.querySelector('[data-canvas-background]')!
    expect(svg).toHaveClass('cursor-grab')
    fireEvent(background, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 200, clientY: 200 }))
    expect(svg).toHaveClass('cursor-grabbing')
    fireEvent(svg, new MouseEvent('pointermove', { bubbles: true, clientX: 300, clientY: 220 }))
    fireEvent(svg, new MouseEvent('pointerup', { bubbles: true, clientX: 300, clientY: 220 }))
    expect(svg).toHaveClass('cursor-grab')
    fireEvent.click(background)
    expect(container.querySelector('[data-viewport-content]')).toHaveAttribute('transform', 'translate(100 20) scale(1)')
    expect(onNodeSelect).not.toHaveBeenCalled()
    expect(onPositionChange).not.toHaveBeenCalled()
    expect(onCanvasSelect).not.toHaveBeenCalled()
    expect(topology.VisualRender).toBeNull()
  })

  it('uses Space-drag over a node for panning rather than moving or selecting that node', () => {
    const onNodeSelect = vi.fn()
    const onPositionChange = vi.fn()
    const { container } = render(<TopologyDiagram topology={topology} onNodeSelect={onNodeSelect} onPositionChange={onPositionChange} />)
    const svg = container.querySelector('svg[role="img"]')!
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 960, height: 560 } as DOMRect)
    fireEvent.pointerEnter(svg)
    fireEvent.keyDown(document, { key: ' ', code: 'Space' })
    const node = screen.getByTestId('node-d1')
    fireEvent(node, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 400, clientY: 300 }))
    fireEvent(svg, new MouseEvent('pointermove', { bubbles: true, clientX: 450, clientY: 300 }))
    fireEvent(svg, new MouseEvent('pointerup', { bubbles: true, clientX: 450, clientY: 300 }))
    fireEvent.click(node)
    fireEvent.keyUp(document, { key: ' ', code: 'Space' })
    expect(container.querySelector('[data-viewport-content]')).toHaveAttribute('transform', 'translate(50 0) scale(1)')
    expect(onNodeSelect).not.toHaveBeenCalled()
    expect(onPositionChange).not.toHaveBeenCalled()
  })

  it('maps add-node coordinates through the zoomed viewport', () => {
    const onCanvasAddNode = vi.fn()
    const { container } = render(<TopologyDiagram topology={topology} onCanvasAddNode={onCanvasAddNode} />)
    const svg = container.querySelector('svg[role="img"]')!
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 960, height: 560 } as DOMRect)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.zoomIn' }))
    fireEvent.contextMenu(svg, { clientX: 200, clientY: 200 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'admin.exTopo.type.container' }))
    expect(onCanvasAddNode).toHaveBeenCalledWith('container', expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }))
    expect(onCanvasAddNode.mock.calls[0][1].x).toBeCloseTo(256 / 960, 3)
  })

  it('zooms the wheel around the pointer and keeps the same world point beneath it', () => {
    const { container } = render(<TopologyDiagram topology={topology} />)
    const svg = container.querySelector('svg[role="img"]')!
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 960, height: 560 } as DOMRect)
    fireEvent.wheel(svg, { clientX: 200, clientY: 150, deltaY: -500 })
    const transform = container.querySelector('[data-viewport-content]')!.getAttribute('transform')!
    const match = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(transform)!
    const [, tx, ty, scale] = match.map(Number)
    expect(scale).toBeGreaterThan(1)
    expect(scale).toBeLessThanOrEqual(2.5)
    expect((200 - tx) / scale).toBeCloseTo(200, 3)
    expect((150 - ty) / scale).toBeCloseTo(150, 3)
  })

  it('persists a node move in world coordinates after zooming', () => {
    const onPositionChange = vi.fn()
    const { container } = render(<TopologyDiagram topology={topology} onPositionChange={onPositionChange} />)
    const svg = container.querySelector('svg[role="img"]')!
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 960, height: 560 } as DOMRect)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.zoomIn' }))
    const node = screen.getByTestId('node-d1')
    const hitbox = node.querySelector('[data-icon-hitbox]')!
    const worldX = Number(hitbox.getAttribute('x')) + 28
    const startClientX = worldX * 1.25 - 120
    fireEvent(node, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: startClientX, clientY: 200 }))
    fireEvent(svg, new MouseEvent('pointermove', { bubbles: true, clientX: startClientX + 125, clientY: 200 }))
    expect(node).toHaveClass('cursor-grabbing')
    fireEvent(svg, new MouseEvent('pointerup', { bubbles: true, clientX: startClientX + 125, clientY: 200 }))
    expect(node).toHaveClass('cursor-grab')
    expect(onPositionChange.mock.calls[0][1].x).toBeCloseTo((worldX + 100) / 960, 3)
  })
})
