/**
 * SecretInput.test.tsx — write-only secret: stored state, replace, entering a value.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))

import { SecretInput } from './SecretInput'

describe('SecretInput', () => {
  const onChange = vi.fn()
  beforeEach(() => vi.clearAllMocks())

  it('hasValue + empty value → "stored" label and a replace icon button, no input', () => {
    render(<SecretInput value="" hasValue onChange={onChange} />)
    expect(screen.getByText('ed.c.env.stored')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ed.c.env.replace' })).toBeInTheDocument()
    expect(screen.queryByTestId('secret-value-input')).not.toBeInTheDocument()
  })

  it('replace reveals a masked input with a "keep" hint', () => {
    render(<SecretInput value="" hasValue onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'ed.c.env.replace' }))
    const input = screen.getByTestId('secret-value-input')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('placeholder', 'ed.c.env.keep')
    fireEvent.change(input, { target: { value: 'hunter2' } })
    expect(onChange).toHaveBeenCalledWith('hunter2')
  })

  it('has an eye to reveal what is typed', () => {
    render(<SecretInput value="hunter2" hasValue onChange={onChange} />)
    const input = screen.getByTestId('secret-value-input')
    fireEvent.click(screen.getByRole('button', { name: 'ed.ui.showValue' }))
    expect(input).toHaveAttribute('type', 'text')
  })

  it('new secret (hasValue=false) shows the input immediately', () => {
    render(<SecretInput value="" hasValue={false} onChange={onChange} />)
    expect(screen.getByTestId('secret-value-input')).toBeInTheDocument()
  })

  it('disabled in stored state does not offer replacing', () => {
    render(<SecretInput value="" hasValue disabled onChange={onChange} />)
    expect(screen.getByText('ed.c.env.stored')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ed.c.env.replace' })).not.toBeInTheDocument()
  })
})
