/**
 * SecretInput.test.tsx — write-only secret: stored state, "Replace", entering a value.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))

import { SecretInput } from './SecretInput'

describe('SecretInput', () => {
  const onChange = vi.fn()
  beforeEach(() => vi.clearAllMocks())

  it('hasValue + empty value → "stored" label and "Replace" button, no input', () => {
    render(<SecretInput value="" hasValue onChange={onChange} />)
    expect(screen.getByText('admin.exSecret.stored')).toBeInTheDocument()
    expect(screen.getByText('admin.exSecret.replace')).toBeInTheDocument()
    expect(screen.queryByTestId('secret-value-input')).not.toBeInTheDocument()
  })

  it('"Replace" reveals a password input with a "keep" hint', () => {
    render(<SecretInput value="" hasValue onChange={onChange} />)
    fireEvent.click(screen.getByText('admin.exSecret.replace'))
    const input = screen.getByTestId('secret-value-input')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('placeholder', 'admin.exSecret.keep')
    fireEvent.change(input, { target: { value: 'hunter2' } })
    expect(onChange).toHaveBeenCalledWith('hunter2')
  })

  it('new secret (hasValue=false) shows the input immediately', () => {
    render(<SecretInput value="" hasValue={false} onChange={onChange} />)
    expect(screen.getByTestId('secret-value-input')).toBeInTheDocument()
  })

  it('disabled in stored state does not show "Replace"', () => {
    render(<SecretInput value="" hasValue disabled onChange={onChange} />)
    expect(screen.getByText('admin.exSecret.stored')).toBeInTheDocument()
    expect(screen.queryByText('admin.exSecret.replace')).not.toBeInTheDocument()
  })
})
