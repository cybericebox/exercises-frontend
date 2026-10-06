import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { VariablePickerMenu } from './VariablePickerMenu'
import { t } from '@/i18n/t'

const variables = [
  { name: 'event_name', description: 'Event name', example: 'CyberICEBox CTF' },
  { name: 'user_email', description: 'Recipient email', example: 'participant@example.org' },
  { name: 'custom_unknown_var', description: 'Custom description' },
  { name: 'no_description_var' },
]

function renderMenu(overrides: Partial<Parameters<typeof VariablePickerMenu>[0]> = {}) {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  render(<VariablePickerMenu variables={variables} onSelect={onSelect} onClose={onClose} {...overrides} />)
  return { onSelect, onClose }
}

const search = () => screen.getByRole('searchbox', { name: t('admin.notif.varPicker.search') })
const items = () => within(screen.getByTestId('variable-picker-list')).getAllByRole('button')

describe('VariablePickerMenu', () => {
  it('renders header, close button and autofocused search input', () => {
    renderMenu()
    expect(screen.getByText(t('admin.notif.varPicker.title'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('admin.notif.varPicker.close') })).toBeInTheDocument()
    expect(search()).toHaveAttribute('placeholder', t('admin.notif.varPicker.search'))
    expect(search()).toHaveFocus()
  })

  it('shows translated label, bare key in <code> and example line', () => {
    renderMenu()
    const first = items()[0]
    expect(first).toHaveTextContent(t('admin.notif.var.event_name'))
    expect(first.querySelector('code')?.textContent).toBe('event_name')
    expect(first).toHaveTextContent(t('admin.notif.editor.variableExampleLine', { example: 'CyberICEBox CTF' }))
    expect(first).not.toHaveTextContent('{{')
  })

  it('prefers provided values over VariableDef.example', () => {
    renderMenu({ values: { event_name: 'Live Event' } })
    expect(items()[0]).toHaveTextContent('Live Event')
    expect(items()[0]).not.toHaveTextContent('CyberICEBox CTF')
  })

  it('falls back to description, then to the name, when no translation exists', () => {
    renderMenu()
    const custom = items()[2]
    expect(custom.querySelector('strong')?.textContent).toBe('Custom description')
    const bare = items()[3]
    expect(bare.querySelector('strong')?.textContent).toBe('no_description_var')
    expect(bare).not.toHaveTextContent(t('admin.notif.editor.variableExample'))
  })

  it('filters by label, key and description case-insensitively', () => {
    renderMenu()
    fireEvent.change(search(), { target: { value: 'USER_EM' } })
    expect(items()).toHaveLength(1)
    expect(items()[0].querySelector('code')?.textContent).toBe('user_email')

    fireEvent.change(search(), { target: { value: t('admin.notif.var.event_name').toLowerCase() } })
    expect(items().map((item) => item.querySelector('code')?.textContent)).toContain('event_name')

    fireEvent.change(search(), { target: { value: 'custom DESCRIPTION' } })
    expect(items()).toHaveLength(1)
    expect(items()[0].querySelector('code')?.textContent).toBe('custom_unknown_var')
  })

  it('shows an empty state when nothing matches', () => {
    renderMenu()
    fireEvent.change(search(), { target: { value: 'zzz-nothing' } })
    expect(screen.queryByTestId('variable-picker-list')?.querySelectorAll('button').length ?? 0).toBe(0)
    expect(screen.getByText(t('admin.notif.varPicker.empty'))).toBeInTheDocument()
  })

  it('click inserts the variable and prevents mousedown focus theft', () => {
    const { onSelect } = renderMenu()
    const target = items()[1]
    const mouseDown = fireEvent.mouseDown(target)
    expect(mouseDown).toBe(false) // default prevented
    fireEvent.click(target)
    expect(onSelect).toHaveBeenCalledWith('user_email')
  })

  it('arrow keys move the active item and Enter inserts it', () => {
    const { onSelect } = renderMenu()
    expect(items()[0]).toHaveAttribute('aria-current', 'true')
    fireEvent.keyDown(search(), { key: 'ArrowDown' })
    expect(items()[1]).toHaveAttribute('aria-current', 'true')
    expect(items()[0]).not.toHaveAttribute('aria-current')
    fireEvent.keyDown(search(), { key: 'ArrowDown' })
    fireEvent.keyDown(search(), { key: 'ArrowUp' })
    expect(items()[1]).toHaveAttribute('aria-current', 'true')
    fireEvent.keyDown(search(), { key: 'ArrowUp' })
    fireEvent.keyDown(search(), { key: 'ArrowUp' })
    expect(items()[0]).toHaveAttribute('aria-current', 'true')
    fireEvent.keyDown(search(), { key: 'ArrowDown' })
    fireEvent.keyDown(search(), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('user_email')
  })

  it('Enter inserts the first match after filtering', () => {
    const { onSelect } = renderMenu()
    fireEvent.change(search(), { target: { value: 'email' } })
    fireEvent.keyDown(search(), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('user_email')
  })

  it('Escape and the close button close the menu', () => {
    const { onClose, onSelect } = renderMenu()
    fireEvent.keyDown(search(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: t('admin.notif.varPicker.close') }))
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('seeds the search from initialQuery', () => {
    renderMenu({ initialQuery: 'user' })
    expect(search()).toHaveValue('user')
    expect(items()).toHaveLength(1)
  })
})
