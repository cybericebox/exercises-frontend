import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { helpButton } from '@/test/help'
import { FormProvider, useForm } from 'react-hook-form'

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))

import { NetworkToggles } from './NetworkToggles'
import { emptyDraft, type DraftFormValues } from '@/lib/exerciseSchemas'

function Harness() {
  const form = useForm<DraftFormValues>({ defaultValues: emptyDraft() })
  return <FormProvider {...form}><NetworkToggles variantIndex={0} disabled={false} /></FormProvider>
}

describe('NetworkToggles', () => {
  it('edits multiple DHCP ranges and DNS only on the Internet gateway', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('switch', { name: 'admin.exTopo.internet' }))
    expect(screen.getByRole('spinbutton', { name: 'admin.exTopo.dhcp.rangeStart 1' })).toHaveValue(2)
    expect(screen.getByRole('spinbutton', { name: 'admin.exTopo.dhcp.rangeEnd 1' })).toHaveValue(254)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'admin.exTopo.dhcp.rangeEnd 1' }), { target: { value: '51' } })
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.dhcp.addRange' }))
    expect(screen.getByRole('spinbutton', { name: 'admin.exTopo.dhcp.rangeStart 2' })).toHaveValue(52)
    fireEvent.change(screen.getByLabelText('admin.exTopo.dhcp.dns'), { target: { value: '1.1.1.1' } })
    expect(screen.getByLabelText('admin.exTopo.dhcp.dns')).toHaveValue('1.1.1.1')
    fireEvent.click(screen.getByRole('switch', { name: 'admin.exTopo.vpn' }))
    expect(screen.getAllByRole('button', { name: 'admin.exTopo.dhcp.addRange' })).toHaveLength(2)
    expect(screen.getAllByLabelText('admin.exTopo.dhcp.dns')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTopo.dhcp.removeRange 2' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'admin.exTopo.dhcp.removeRange 1' })[1])
    expect(screen.getByRole('alert')).toHaveTextContent('admin.ex.val.dhcpRangesRequired')
  })

  it('shows DHCP only for enabled networks and explains its effect', () => {
    render(<Harness />)
    expect(screen.queryByRole('switch', { name: 'admin.exTopo.vpnDhcp' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'admin.exTopo.internetDhcp' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'admin.exTopo.vpn' }))
    expect(screen.getByRole('switch', { name: 'admin.exTopo.vpnDhcp' })).toBeInTheDocument()
    expect(helpButton('admin.exTopo.dhcpHelp')).toBeInTheDocument()
    expect(screen.getByText('admin.exTopo.dhcp.enabled.vpn')).toBeInTheDocument()
    expect(screen.getByText('admin.exTopo.dhcp.disabled')).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    expect(screen.queryByText('admin.exTopo.dhcp.limit')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'admin.exTopo.internetDhcp' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'admin.exTopo.internet' }))
    expect(screen.getByText('admin.exTopo.dhcp.enabled.internet')).toBeInTheDocument()
    expect(screen.getAllByRole('note')).toHaveLength(2)
    for (const note of screen.getAllByRole('note')) {
      expect(note).toHaveTextContent('admin.exTopo.dhcp.warning')
      expect(note).toHaveTextContent('admin.exTopo.dhcp.warningConsequence')
      expect(within(note).getByText('admin.exTopo.dhcp.warningConsequence')).toHaveClass('block')
    }

    fireEvent.click(screen.getByRole('switch', { name: 'admin.exTopo.internetDhcp' }))
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'admin.exTopo.internetDhcp' }))
    expect(screen.getAllByRole('note')).toHaveLength(2)

    fireEvent.click(screen.getByRole('switch', { name: 'admin.exTopo.vpn' }))
    expect(screen.queryByRole('switch', { name: 'admin.exTopo.vpnDhcp' })).not.toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
