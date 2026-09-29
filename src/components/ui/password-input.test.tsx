/**
 * password-input.test.tsx — the «Показати» / «Сховати» button reveals / hides the value,
 * can share its state with another field, and is hidden while disabled.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))

import { PasswordInput } from './password-input'

describe('PasswordInput', () => {
  it('toggles the input type and the button text', () => {
    render(<PasswordInput aria-label="field" autoComplete="new-password" defaultValue="s3cret" />)
    const input = screen.getByLabelText('field')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('autocomplete', 'new-password')
    const button = screen.getByRole('button', { name: 'admin.password.show' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(button)
    expect(input).toHaveAttribute('type', 'text')
    const hide = screen.getByRole('button', { name: 'admin.password.hide' })
    expect(hide).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(hide)
    expect(input).toHaveAttribute('type', 'password')
  })

  it('follows a controlled shown state', () => {
    const onShownChange = vi.fn()
    render(<PasswordInput aria-label="field" shown onShownChange={onShownChange} />)
    expect(screen.getByLabelText('field')).toHaveAttribute('type', 'text')
    fireEvent.click(screen.getByRole('button', { name: 'admin.password.hide' }))
    expect(onShownChange).toHaveBeenCalledWith(false)
  })

  it('has no toggle while disabled', () => {
    render(<PasswordInput aria-label="field" disabled />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
