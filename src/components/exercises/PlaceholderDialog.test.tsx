import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PlaceholderDialog } from './PlaceholderDialog'
import type { PlaceholderFormValues } from '@/lib/exerciseSchemas'

const unavailable = { gateways: [], externalDevices: [] }
const attack = { name: 'attack', kind: 'vpn' as const }
const out = { name: 'out', kind: 'internet' as const }

describe('PlaceholderDialog', () => {
  it('marks a removed external-link device red in its dropdown', () => {
    const existing: PlaceholderFormValues = { Key: 'ph_old', Kind: 'external.link', IPReference: '', Gateway: '', Octets1to3: '', LastOctet: 0, ShowMask: false, DeviceName: 'deleted-web' }
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={existing} topology={unavailable} onSave={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Пристрій' })
    expect(trigger.querySelector('span')).toHaveClass('text-destructive')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitemradio', { name: /deleted-web.*джерело недоступне/ })).toHaveClass('text-destructive')
  })
  it('shows dynamic sources with reasons when the topology has no gateway and has no static IP choice', () => {
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={null} topology={unavailable} onSave={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Підмережа шлюзу/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^IP-адреса/ })).toBeDisabled()
    expect(screen.getAllByText('Додайте шлюз у топології.')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /Зовнішнє посилання на пристрій/ })).toBeDisabled()
    expect(screen.getByText('Увімкніть зовнішній доступ для пристрою.')).toBeInTheDocument()
    expect(screen.queryByText('Статичні октети')).not.toBeInTheDocument()
  })

  it('creates an IP from a gateway with only relevant fields', () => {
    const save = vi.fn()
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={null}
      topology={{ ...unavailable, gateways: [attack] }} onSave={save} />)
    fireEvent.click(screen.getByRole('button', { name: /^IP-адреса/ }))
    // The gateway is the only source of an address here: no dropdown for a choice of one.
    expect(screen.queryByRole('button', { name: 'Джерело IP' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Шлюз' })).toHaveTextContent('attack')
    expect(screen.getByRole('spinbutton', { name: /^Останній октет/ })).toBeInTheDocument()
    expect(screen.queryByText('Октети 1–3')).not.toBeInTheDocument()
    expect(screen.queryByText('Пристрій')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Останній октет/ }), { target: { value: '42' } })
    fireEvent.click(screen.getByRole('button', { name: 'Вставити' }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ Kind: 'ip', IPReference: 'gateway', Gateway: 'attack', LastOctet: 42, Key: expect.stringMatching(/^ph_/) }))
  })

  it('lists every gateway of the lab by name with its kind, and saves the chosen one', () => {
    const save = vi.fn()
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={null}
      topology={{ ...unavailable, gateways: [attack, out, { name: 'attack-2', kind: 'vpn' }] }} onSave={save} />)
    fireEvent.click(screen.getByRole('button', { name: /^IP-адреса/ }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Шлюз' }), { key: 'ArrowDown' })
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual(['attackVPN-шлюз', 'outІнтернет-шлюз', 'attack-2VPN-шлюз'])
    fireEvent.click(screen.getByRole('menuitemradio', { name: /^outІнтернет/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Вставити' }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ Kind: 'ip', IPReference: 'gateway', Gateway: 'out' }))
  })

  it('marks a gateway that is gone red and unavailable, and does not allow saving it', () => {
    const existing: PlaceholderFormValues = { Key: 'ph_gone', Kind: 'gateway.subnet', IPReference: '', Gateway: 'old-gw', Octets1to3: '', LastOctet: 0, ShowMask: false, DeviceName: '' }
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={existing} topology={{ ...unavailable, gateways: [attack] }} onSave={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Шлюз' })
    expect(trigger.querySelector('span')).toHaveClass('text-destructive')
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled()
    // The reason is written beside the select and tied to it.
    expect(trigger).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Шлюзу «old-gw» немає в цьому варіанті')
    expect((trigger.getAttribute('aria-describedby') ?? '').split(' ')).toContain(screen.getByRole('alert').id)
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitemradio', { name: /old-gw.*джерело недоступне/ })).toHaveClass('text-destructive')
  })

  it('says «Оберіть шлюз» beside the select when the placeholder has no gateway (a removed one is cleared)', () => {
    const existing: PlaceholderFormValues = { Key: 'ph_empty', Kind: 'gateway.subnet', IPReference: '', Gateway: '', Octets1to3: '', LastOctet: 0, ShowMask: false, DeviceName: '' }
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={existing} topology={{ ...unavailable, gateways: [attack] }} onSave={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Шлюз' })
    expect(trigger).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Оберіть шлюз.')
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: /attack/ }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeEnabled()
  })

  it('keeps the address source dropdown while an existing placeholder still has the static octets to choose', () => {
    const existing: PlaceholderFormValues = { Key: 'ph_static', Kind: 'ip', IPReference: 'static', Gateway: '', Octets1to3: '10.0.0', LastOctet: 5, ShowMask: false, DeviceName: '' }
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={existing} topology={{ ...unavailable, gateways: [attack] }} onSave={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Джерело IP' })).toHaveTextContent('Статичні октети')
  })

  it('offers mask control for a gateway subnet and keeps that choice in the saved definition', () => {
    const save = vi.fn()
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={null}
      topology={{ ...unavailable, gateways: [attack] }} onSave={save} />)
    fireEvent.click(screen.getByRole('button', { name: /^Підмережа шлюзу/ }))
    fireEvent.click(screen.getByRole('switch', { name: 'Показувати маску' }))
    fireEvent.click(screen.getByRole('button', { name: 'Вставити' }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ Kind: 'gateway.subnet', Gateway: 'attack', ShowMask: true }))
  })

  it('takes the subnet of the gateway that is the only one, an Internet gateway included', () => {
    const save = vi.fn()
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={null}
      topology={{ ...unavailable, gateways: [out] }} onSave={save} />)
    fireEvent.click(screen.getByRole('button', { name: /^Підмережа шлюзу/ }))
    fireEvent.click(screen.getByRole('switch', { name: 'Показувати маску' }))
    fireEvent.click(screen.getByRole('button', { name: 'Вставити' }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ Kind: 'gateway.subnet', Gateway: 'out', ShowMask: true }))
  })

  it('updates an existing placeholder without changing its key', () => {
    const save = vi.fn()
    const existing: PlaceholderFormValues = { Key: 'ph_existing', Kind: 'external.link', IPReference: '', Gateway: '', Octets1to3: '', LastOctet: 0, ShowMask: false, DeviceName: 'web' }
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={existing}
      topology={{ ...unavailable, externalDevices: [{ name: 'web', access: ['http'] }, { name: 'db', access: ['http'] }] }} onSave={save} />)
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Пристрій' }), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'db' }))
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ Key: 'ph_existing', Kind: 'external.link', DeviceName: 'db' }))
  })

  it('disables visible Save again after reverting the meaningful placeholder fields', () => {
    const existing: PlaceholderFormValues = { Key: 'ph_existing', Kind: 'ip', IPReference: 'gateway', Gateway: 'attack', Octets1to3: '', LastOctet: 5, ShowMask: false, DeviceName: '' }
    const save = vi.fn()
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={existing}
      topology={{ ...unavailable, gateways: [attack] }} onSave={save} />)
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled()
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Останній октет/ }), { target: { value: '6' } })
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeEnabled()
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Останній октет/ }), { target: { value: '5' } })
    // The same kind selection can supply defaults for fields that are omitted in the request.
    fireEvent.click(screen.getByRole('button', { name: /^IP-адреса/ }))
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled()
    expect(save).not.toHaveBeenCalled()
  })

  it('compares the submitted numeric link port rather than its typed representation', () => {
    const existing: PlaceholderFormValues = { Key: 'ph_link', Kind: 'ip', IPReference: 'gateway', Gateway: 'attack', Octets1to3: '', LastOctet: 5, ShowMask: false, DeviceName: '', AsLink: true, Scheme: 'http', PortText: '81', Path: '' }
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={existing}
      topology={{ ...unavailable, gateways: [attack] }} onSave={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox', { name: /^Порт/ }), { target: { value: '00081' } })
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled()
  })

  it('keeps text styling in the editor instead of duplicating its controls in the dialog', () => {
    const save = vi.fn()
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={null} topology={{ ...unavailable, gateways: [attack] }} onSave={save} />)
    fireEvent.click(screen.getByRole('button', { name: /^Підмережа шлюзу/ }))
    expect(screen.queryByRole('button', { name: 'Курсив' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Вставити' }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ Kind: 'gateway.subnet' }))
  })

  describe('IP link form', () => {
    function openIP(save = vi.fn()) {
      render(<PlaceholderDialog open onOpenChange={vi.fn()} value={null}
        topology={{ ...unavailable, gateways: [attack] }} onSave={save} />)
      fireEvent.click(screen.getByRole('button', { name: /^IP-адреса/ }))
      return save
    }

    it('has no link fields until the switch is on, then previews a working link', () => {
      openIP()
      expect(screen.queryByLabelText('Порт')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('switch', { name: 'Як посилання' }))
      expect(screen.getByRole('button', { name: 'Схема' })).toHaveTextContent('http')
      fireEvent.change(screen.getByRole('textbox', { name: /^Порт/ }), { target: { value: '8443' } })
      fireEvent.change(screen.getByRole('textbox', { name: /^Шлях/ }), { target: { value: '/admin' } })
      fireEvent.change(screen.getByRole('spinbutton', { name: /^Останній октет/ }), { target: { value: '5' } })
      const link = document.querySelector<HTMLAnchorElement>('a[data-placeholder-preview]')!
      expect(link.getAttribute('href')).toBe('http://10.0.0.5:8443/admin')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(link.textContent).toBe('http://10.0.0.5:8443/admin')
    })

    it('hides the mask switch for a link and saves the link fields', () => {
      const save = openIP()
      fireEvent.click(screen.getByRole('switch', { name: 'Показувати маску' }))
      fireEvent.click(screen.getByRole('switch', { name: 'Як посилання' }))
      expect(screen.queryByRole('switch', { name: 'Показувати маску' })).not.toBeInTheDocument()
      fireEvent.change(screen.getByRole('textbox', { name: /^Порт/ }), { target: { value: '81' } })
      fireEvent.click(screen.getByRole('button', { name: 'Вставити' }))
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ Kind: 'ip', AsLink: true, Scheme: 'http', PortText: '81', Path: '', ShowMask: false }))
    })

    it('blocks saving an invalid port or path with an inline message', () => {
      openIP()
      fireEvent.click(screen.getByRole('switch', { name: 'Як посилання' }))
      fireEvent.change(screen.getByRole('textbox', { name: /^Порт/ }), { target: { value: '70000' } })
      expect(screen.getByText('Порт — від 1 до 65535 або порожній')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Вставити' })).toBeDisabled()
      fireEvent.change(screen.getByRole('textbox', { name: /^Порт/ }), { target: { value: '' } })
      fireEvent.change(screen.getByRole('textbox', { name: /^Шлях/ }), { target: { value: 'admin' } })
      expect(screen.getByText(/Шлях починається з \//)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Вставити' })).toBeDisabled()
      fireEvent.change(screen.getByRole('textbox', { name: /^Шлях/ }), { target: { value: '/ok' } })
      expect(screen.getByRole('button', { name: 'Вставити' })).toBeEnabled()
    })
  })

  it('offers the access kinds a device has switched on; vnc and rdp stay disabled with the reason', () => {
    const save = vi.fn()
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={null}
      topology={{ ...unavailable, externalDevices: [{ name: 'web', access: ['http', 'terminal', 'vnc'] }, { name: 'db', access: ['terminal'] }] }} onSave={save} />)
    fireEvent.click(screen.getByRole('button', { name: /^Зовнішнє посилання/ }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Вид доступу' }), { key: 'ArrowDown' })
    const items = screen.getAllByRole('menuitemradio')
    expect(items.map((item) => item.textContent)).toEqual([expect.stringContaining('Веб-сторінка'), expect.stringContaining('Консоль'), expect.stringContaining('VNC')])
    expect(screen.getByRole('menuitemradio', { name: /VNC/ })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Консоль/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Вставити' }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ Kind: 'external.link', DeviceName: 'web', Access: 'terminal' }))
  })

  it('an access kind switched off in the device later disables «Вставити»', () => {
    const existing: PlaceholderFormValues = { Key: 'ph_x', Kind: 'external.link', IPReference: '', Gateway: '', Octets1to3: '', LastOctet: 0, ShowMask: false, DeviceName: 'web', Access: 'terminal' }
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={existing}
      topology={{ ...unavailable, externalDevices: [{ name: 'web', access: ['http'] }] }} onSave={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled()
  })

  it('lists only the access kinds switched on for the chosen device', () => {
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={null}
      topology={{ ...unavailable, externalDevices: [{ name: 'db', access: ['terminal'] }] }} onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Зовнішнє посилання/ }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Вид доступу' }), { key: 'ArrowDown' })
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual(['Консоль'])
  })
})
