import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PlaceholderDialog } from './PlaceholderDialog'
import type { PlaceholderFormValues } from '@/lib/exerciseSchemas'

const unavailable = { vpnEnabled: false, internetEnabled: false, externalDeviceNames: [] }

describe('PlaceholderDialog', () => {
  it('marks a removed external-link device red in its dropdown', () => {
    const existing: PlaceholderFormValues = { Key: 'ph_old', Kind: 'external.link', IPReference: '', Octets1to3: '', LastOctet: 0, ShowMask: false, DeviceName: 'deleted-web' }
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={existing} topology={unavailable} onSave={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Пристрій' })
    expect(trigger.querySelector('span')).toHaveClass('text-destructive')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitemradio', { name: /deleted-web.*джерело недоступне/ })).toHaveClass('text-destructive')
  })
  it('shows dynamic sources with reasons when topology cannot supply them and has no static IP choice', () => {
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={null} topology={unavailable} onSave={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Підмережа VPN/ })).toBeDisabled()
    expect(screen.getByText('Увімкніть VPN у топології.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Зовнішнє посилання на пристрій/ })).toBeDisabled()
    expect(screen.getByText('Увімкніть зовнішній доступ для пристрою.')).toBeInTheDocument()
    expect(screen.queryByText('Статичні октети')).not.toBeInTheDocument()
  })

  it('creates a dynamic VPN IP with only relevant fields', () => {
    const save = vi.fn()
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={null}
      topology={{ ...unavailable, vpnEnabled: true }} onSave={save} />)
    fireEvent.click(screen.getByRole('button', { name: /^IP-адреса/ }))
    expect(screen.getByText('Джерело IP')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Джерело IP' })).toHaveTextContent('Підмережа VPN')
    expect(screen.getByText('Останній октет')).toBeInTheDocument()
    expect(screen.queryByText('Октети 1–3')).not.toBeInTheDocument()
    expect(screen.queryByText('Пристрій')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Останній октет' }), { target: { value: '42' } })
    fireEvent.click(screen.getByRole('button', { name: 'Вставити' }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ Kind: 'ip', IPReference: 'vpn', LastOctet: 42, Key: expect.stringMatching(/^ph_/) }))
  })

  it('names both network choices explicitly and uses the shared dropdown control', () => {
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={null}
      topology={{ ...unavailable, vpnEnabled: true, internetEnabled: true }} onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^IP-адреса/ }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Джерело IP' }), { key: 'ArrowDown' })
    expect(screen.getByRole('menuitemradio', { name: 'Підмережа VPN' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'Підмережа Інтернет' })).toBeInTheDocument()
  })

  it('offers mask control for a VPN subnet and keeps that choice in the saved definition', () => {
    const save = vi.fn()
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={null}
      topology={{ ...unavailable, vpnEnabled: true }} onSave={save} />)
    fireEvent.click(screen.getByRole('button', { name: /^Підмережа VPN/ }))
    fireEvent.click(screen.getByRole('switch', { name: 'Показувати маску' }))
    fireEvent.click(screen.getByRole('button', { name: 'Вставити' }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ Kind: 'vpn.subnet', ShowMask: true }))
  })

  it('offers the same mask control for an internet subnet', () => {
    const save = vi.fn()
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={null}
      topology={{ ...unavailable, internetEnabled: true }} onSave={save} />)
    fireEvent.click(screen.getByRole('button', { name: /^Підмережа Інтернет/ }))
    fireEvent.click(screen.getByRole('switch', { name: 'Показувати маску' }))
    fireEvent.click(screen.getByRole('button', { name: 'Вставити' }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ Kind: 'internet.subnet', ShowMask: true }))
  })

  it('updates an existing placeholder without changing its key', () => {
    const save = vi.fn()
    const existing: PlaceholderFormValues = { Key: 'ph_existing', Kind: 'external.link', IPReference: '', Octets1to3: '', LastOctet: 0, ShowMask: false, DeviceName: 'web' }
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={existing}
      topology={{ ...unavailable, externalDeviceNames: ['web', 'db'] }} onSave={save} />)
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Пристрій' }), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'db' }))
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ Key: 'ph_existing', Kind: 'external.link', DeviceName: 'db' }))
  })

  it('keeps text styling in the editor instead of duplicating its controls in the dialog', () => {
    const save = vi.fn()
    render(<PlaceholderDialog open onOpenChange={vi.fn()} value={null} topology={{ ...unavailable, vpnEnabled: true }} onSave={save} />)
    fireEvent.click(screen.getByRole('button', { name: /^Підмережа VPN/ }))
    expect(screen.queryByRole('button', { name: 'Курсив' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Вставити' }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ Kind: 'vpn.subnet' }))
  })

  describe('IP link form', () => {
    function openIP(save = vi.fn()) {
      render(<PlaceholderDialog open onOpenChange={vi.fn()} value={null}
        topology={{ ...unavailable, vpnEnabled: true }} onSave={save} />)
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
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Останній октет' }), { target: { value: '5' } })
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
})
