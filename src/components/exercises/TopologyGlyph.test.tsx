import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { TopologyGlyph } from './TopologyGlyph'

describe('TopologyGlyph', () => {
  it('gives L2 switches, hubs and routers recognizably different silhouettes', () => {
    const switchGlyph = render(<TopologyGlyph kind="switch" />).container
    expect(switchGlyph.querySelector('[data-switch-chassis]')).toHaveAttribute('rx', '2')
    expect(switchGlyph.querySelector('[data-switch-flow]')).toBeInTheDocument()

    const layer3 = render(<TopologyGlyph kind="switch-l3" />).container
    expect(layer3.querySelector('[data-layer3-rays]')).toBeInTheDocument()
    expect(layer3.querySelector('[data-switch-chassis]')).toBeInTheDocument()

    const hubGlyph = render(<TopologyGlyph kind="hub" />).container
    expect(hubGlyph.querySelector('[data-hub-chassis]')).toBeInTheDocument()
    expect(hubGlyph.querySelector('[data-hub-spokes]')).toBeInTheDocument()

    const routerGlyph = render(<TopologyGlyph kind="router" />).container
    expect(routerGlyph.querySelector('[data-router-disc]')).toHaveAttribute('r', '10')
    expect(routerGlyph.querySelector('[data-router-flow]')).toBeInTheDocument()
  })

  it('uses distinct server rack and firewall shield silhouettes', () => {
    const host = render(<TopologyGlyph kind="host" />).container
    expect(host.querySelector('[data-server-rack]')).toBeInTheDocument()
    const firewall = render(<TopologyGlyph kind="firewall" />).container
    expect(firewall.querySelector('[data-firewall-shield]')).toBeInTheDocument()
    expect(firewall.querySelector('[data-firewall-bricks]')).toBeInTheDocument()
  })
})
