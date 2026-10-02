/**
 * PlaceholderList.test.tsx — row fields depend on Kind (ip / external.link / *.subnet).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useForm, FormProvider } from 'react-hook-form'

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))

import { PlaceholderList } from './PlaceholderList'
import { emptyDraft, type DraftFormValues, type PlaceholderFormValues } from '@/lib/exerciseSchemas'

function Harness({ placeholders, devices }: {
  placeholders: PlaceholderFormValues[]
  devices?: { withExternal: boolean }
}) {
  const draft = emptyDraft()
  draft.Variants[0].Tasks[0].Placeholders = placeholders
  if (devices) {
    draft.Variants[0].Topology.Devices = [{
      ID: 'd1', Name: 'web', Type: 'container', SecurityPreset: '', Image: '', Interfaces: [], EnvVars: [],
      ResourcePreset: "",
      External: { Enabled: devices.withExternal, Port: 80, Protocol: 'http' },
    }]
  }
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  return (
    <FormProvider {...form}>
      <PlaceholderList variantIndex={0} taskIndex={0} disabled={false} />
    </FormProvider>
  )
}

const base: PlaceholderFormValues = {
  Key: 'ph_existing', Kind: 'ip', IPReference: 'vpn', Octets1to3: '', LastOctet: 5, ShowMask: false, DeviceName: '',
}

describe('PlaceholderList', () => {
  it('kind=ip: shows IPReference and LastOctet, Octets1to3 only for static', () => {
    render(<Harness placeholders={[base]} />)
    expect(screen.getByText('admin.exPh.ipref')).toBeInTheDocument()
    expect(screen.getByText('admin.exPh.lastOctet')).toBeInTheDocument()
    expect(screen.queryByText('admin.exPh.octets')).not.toBeInTheDocument()
  })

  it('kind=ip + IPReference=static: shows Octets1to3', () => {
    render(<Harness placeholders={[{ ...base, IPReference: 'static', Octets1to3: '10.0.0' }]} />)
    expect(screen.getByText('admin.exPh.octets')).toBeInTheDocument()
  })

  it('kind=external.link: shows the device picker', () => {
    render(
      <Harness
        placeholders={[{ ...base, Kind: 'external.link', DeviceName: '' }]}
        devices={{ withExternal: true }}
      />,
    )
    expect(screen.getByText('admin.exPh.device')).toBeInTheDocument()
  })

  it('kind=vpn.subnet: no extra fields', () => {
    render(<Harness placeholders={[{ ...base, Kind: 'vpn.subnet' }]} />)
    expect(screen.queryByText('admin.exPh.ipref')).not.toBeInTheDocument()
    expect(screen.queryByText('admin.exPh.device')).not.toBeInTheDocument()
  })

  it('omits impossible topology sources when adding a new placeholder', () => {
    render(<Harness placeholders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exPh.add' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'admin.exPh.kind.ip' }), { key: 'ArrowDown' })
    expect(screen.getByRole('menuitemradio', { name: 'admin.exPh.kind.ip' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitemradio', { name: 'admin.exPh.kind.vpnSubnet' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitemradio', { name: 'admin.exPh.kind.internetSubnet' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitemradio', { name: 'admin.exPh.kind.externalLink' })).not.toBeInTheDocument()
  })

  it('keeps an existing unavailable source visible instead of silently removing it', () => {
    render(<Harness placeholders={[{ ...base, Kind: 'vpn.subnet' }]} />)
    expect(screen.getByText('admin.exPh.kind.vpnSubnet')).toBeInTheDocument()
  })
})
