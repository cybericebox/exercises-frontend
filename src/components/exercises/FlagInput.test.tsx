/**
 * FlagInput.test.tsx — 0/1/N flag value semantics.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { useState } from 'react'

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))

import { FlagInput } from './FlagInput'

describe('FlagInput', () => {
  const onChange = vi.fn()
  beforeEach(() => vi.clearAllMocks())

  it('0 values → "random flag" caption', () => {
    render(<FlagInput value={[]} onChange={onChange} />)
    expect(screen.getByText('admin.exTask.flag.semantics0')).toBeInTheDocument()
  })

  it('1 value → selection status appears once in the heading', () => {
    render(<FlagInput value={['CTF{x}']} onChange={onChange} />)
    expect(screen.getByText('admin.exTask.flag.semantics1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('CTF{x}')).toBeInTheDocument()
  })

  it('N values → "random pick" caption', () => {
    render(<FlagInput value={['a', 'b']} onChange={onChange} />)
    expect(screen.getByText('admin.exTask.flag.semanticsN')).toBeInTheDocument()
  })

  it('adds an ICE wrapper and focuses the cursor inside it', async () => {
    function Controlled() {
      const [flags, setFlags] = useState(['ICE{old}'])
      return <FlagInput value={flags} onChange={setFlags} linkedDeviceID="vm-1" />
    }
    render(<Controlled />)
    fireEvent.click(screen.getByText('admin.exTask.flag.add'))
    const newInput = await screen.findByRole('textbox', { name: 'admin.exTask.flag.title 2' }) as HTMLInputElement
    expect(newInput).toHaveValue('ICE{}')
    await waitFor(() => expect(newInput).toHaveFocus())
    expect(newInput.selectionStart).toBe(4)
    expect(newInput.selectionEnd).toBe(4)
  })

  it('offers a visible hint and previews multiline paste as fixed flags by default', () => {
    render(<FlagInput value={['ICE{old}']} onChange={onChange} linkedDeviceID="vm-1" />)
    expect(screen.getByText('admin.exTask.flag.pasteHint')).toBeInTheDocument()
    const addActions = screen.getByTestId('flag-add-actions')
    expect(addActions).toContainElement(screen.getByText('admin.exTask.flag.pasteHint'))
    const pasteHint = screen.getByText('admin.exTask.flag.pasteHint').closest('[tabindex="0"]')
    expect(pasteHint).toBeInTheDocument()
    fireEvent.mouseEnter(pasteHint!)
    expect(screen.getByRole('tooltip')).toHaveTextContent('admin.exTask.flag.pasteHintHelp')
    expect(addActions).toContainElement(screen.getByRole('button', { name: 'admin.exTask.flag.add' }))
    const input = screen.getByRole('textbox', { name: 'admin.exTask.flag.title 1' })
    fireEvent.paste(input, { clipboardData: { getData: () => 'ICE{first}\r\n\r\nICE{second}\n' } })
    const dialog = screen.getByRole('dialog', { name: 'admin.exTask.flag.pasteTitle' })
    expect(dialog).toHaveTextContent('admin.exTask.flag.pasteCount 2')
    expect(within(dialog).getByRole('button', { name: 'admin.exTask.flag.pasteMode' })).toHaveTextContent('admin.exTask.flag.modeFixed')
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'admin.exTask.flag.pasteConfirm' }))
    expect(onChange).toHaveBeenCalledWith(['ICE{first}', 'ICE{second}'])
  })

  it('explains literal-only templates during list import and keeps duplicate and format errors distinct', () => {
    render(<FlagInput value={['ICE{old}']} onChange={onChange} linkedDeviceID="vm-1" />)
    fireEvent.paste(screen.getByRole('textbox', { name: 'admin.exTask.flag.title 1' }), {
      clipboardData: { getData: () => 'ICE{fixed}\nICE{fixed}\nICE{has space}' },
    })
    const dialog = screen.getByRole('dialog', { name: 'admin.exTask.flag.pasteTitle' })
    fireEvent.keyDown(within(dialog).getByRole('button', { name: 'admin.exTask.flag.pasteMode' }), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'admin.exTask.flag.modeTemplate' }))
    expect(within(dialog).getByText(/1\. ICE\{fixed\}/)).toHaveTextContent('admin.ex.val.flagTemplateNeedsRandom')
    expect(within(dialog).getByText(/2\. ICE\{fixed\}/)).toHaveTextContent('admin.ex.val.flagDuplicate')
    expect(within(dialog).getByText(/3\. ICE\{has space\}/)).toHaveTextContent('admin.ex.val.flagFormat')
  })

  it('shows the literal-only template reason after leaving a flag field', () => {
    render(<FlagInput value={['template:ICE{fixed}']} onChange={onChange} linkedDeviceID="vm-1" />)
    fireEvent.blur(screen.getByRole('textbox', { name: 'admin.exTask.flag.title 1' }))
    expect(screen.getByRole('alert')).toHaveTextContent('admin.ex.val.flagTemplateNeedsRandom')
  })

  it('imports a pasted list as templates when that mode is chosen', () => {
    render(<FlagInput value={['ICE{old}', 'ICE{keep}']} onChange={onChange} linkedDeviceID="vm-1" />)
    fireEvent.paste(screen.getByRole('textbox', { name: 'admin.exTask.flag.title 1' }), {
      clipboardData: { getData: () => String.raw`ICE{room-\d}` + '\n' + String.raw`ICE{user-\l}` },
    })
    const dialog = screen.getByRole('dialog', { name: 'admin.exTask.flag.pasteTitle' })
    fireEvent.keyDown(within(dialog).getByRole('button', { name: 'admin.exTask.flag.pasteMode' }), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'admin.exTask.flag.modeTemplate' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'admin.exTask.flag.pasteConfirm' }))
    expect(onChange).toHaveBeenCalledWith([String.raw`template:ICE{room-\d}`, String.raw`template:ICE{user-\l}`, 'ICE{keep}'])
  })

  it('shows invalid lines and imports only valid flags after confirmation', () => {
    render(<FlagInput value={['ICE{old}', 'ICE{keep}']} onChange={onChange} linkedDeviceID="vm-1" />)
    fireEvent.paste(screen.getByRole('textbox', { name: 'admin.exTask.flag.title 1' }), {
      clipboardData: { getData: () => 'ICE{first}\nwrong\nICE{keep}\nICE{second}' },
    })
    const dialog = screen.getByRole('dialog', { name: 'admin.exTask.flag.pasteTitle' })
    expect(dialog).toHaveTextContent('admin.exTask.flag.pasteValid 2')
    expect(dialog).toHaveTextContent('admin.exTask.flag.pasteInvalid 2')
    expect(within(dialog).getByText(/2\. wrong/)).toBeInTheDocument()
    expect(within(dialog).getByText(/3\. ICE\{keep\}/)).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'admin.exTask.flag.pasteValidOnly' }))
    expect(onChange).toHaveBeenCalledWith(['ICE{first}', 'ICE{second}', 'ICE{keep}'])
  })

  it('disables list import when no candidate matches the chosen mode', () => {
    render(<FlagInput value={['ICE{old}']} onChange={onChange} linkedDeviceID="vm-1" />)
    fireEvent.paste(screen.getByRole('textbox', { name: 'admin.exTask.flag.title 1' }), {
      clipboardData: { getData: () => 'wrong\nICE{has space}' },
    })
    const dialog = screen.getByRole('dialog', { name: 'admin.exTask.flag.pasteTitle' })
    expect(dialog).toHaveTextContent('admin.exTask.flag.pasteValid 0')
    expect(within(dialog).getByRole('button', { name: 'admin.exTask.flag.pasteValidOnly' })).toBeDisabled()
  })

  it('cancels a multiline paste without changing the current flag', () => {
    render(<FlagInput value={['ICE{old}']} onChange={onChange} linkedDeviceID="vm-1" />)
    fireEvent.paste(screen.getByRole('textbox', { name: 'admin.exTask.flag.title 1' }), {
      clipboardData: { getData: () => 'ICE{first}\nICE{second}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTask.flag.pasteCancel' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not import multiple values into a task without a linked device', () => {
    render(<FlagInput value={['ICE{old}']} onChange={onChange} linkedDeviceID="" />)
    fireEvent.paste(screen.getByRole('textbox', { name: 'admin.exTask.flag.title 1' }), {
      clipboardData: { getData: () => 'ICE{first}\nICE{second}' },
    })
    const dialog = screen.getByRole('dialog', { name: 'admin.exTask.flag.pasteTitle' })
    expect(dialog).toHaveTextContent('admin.exTask.flag.pasteStaticLimit')
    expect(within(dialog).getByRole('button', { name: 'admin.exTask.flag.pasteConfirm' })).toBeDisabled()
  })

  it('leaves a single pasted flag to the ordinary input behavior', () => {
    render(<FlagInput value={['ICE{old}']} onChange={onChange} linkedDeviceID="vm-1" />)
    const input = screen.getByRole('textbox', { name: 'admin.exTask.flag.title 1' })
    const accepted = fireEvent.paste(input, { clipboardData: { getData: () => 'ICE{one}' } })
    expect(accepted).toBe(true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('edits and removes values', () => {
    render(<FlagInput value={['a', 'b']} onChange={onChange} />)
    fireEvent.change(screen.getByDisplayValue('a'), { target: { value: 'aa' } })
    expect(onChange).toHaveBeenCalledWith(['aa', 'b'])
    fireEvent.click(screen.getAllByRole('button', { name: 'admin.exTask.flag.remove' })[1])
    expect(onChange).toHaveBeenCalledWith(['a'])
  })

  it('disabled hides the buttons', () => {
    render(<FlagInput value={['a']} onChange={onChange} disabled />)
    expect(screen.queryByText('admin.exTask.flag.add')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'admin.exTask.flag.remove' })).not.toBeInTheDocument()
  })

  it('shows an explicit fixed/template switch without the storage marker in the input', () => {
    render(<FlagInput value={[String.raw`template:ICE{\d}`]} onChange={onChange} linkedDeviceID="vm-1" />)
    expect(screen.getByDisplayValue(String.raw`ICE{\d}`)).toBeInTheDocument()
    const type = screen.getByRole('button', { name: 'admin.exTask.flag.mode 1' })
    expect(type).toHaveTextContent('admin.exTask.flag.modeTemplate')
    fireEvent.keyDown(type, { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'admin.exTask.flag.modeFixed' }))
    expect(onChange).toHaveBeenCalledWith([String.raw`ICE{\d}`])
  })

  it('does not offer templates or multiple candidates for a static task', () => {
    render(<FlagInput value={['ICE{fixed}']} onChange={onChange} linkedDeviceID="" />)
    expect(screen.queryByRole('button', { name: 'admin.exTask.flag.mode 1' })).not.toBeInTheDocument()
    expect(screen.getByText('admin.exTask.flag.modeFixed')).toHaveClass('bg-primary', 'text-primary-foreground')
    expect(screen.getByText('admin.exTask.flag.staticTypeHelp')).toBeInTheDocument()
    expect(screen.queryByText('admin.exTask.flag.add')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'admin.exTask.flag.insert' })).not.toBeInTheDocument()
  })

  it('explains that an existing VM or container must be linked before other types appear', () => {
    render(<FlagInput value={['ICE{fixed}']} onChange={onChange} linkedDeviceID="" hasLinkableDevice />)
    expect(screen.getByText('admin.exTask.flag.unlinkedTypeHelp')).toBeInTheDocument()
    expect(screen.queryByText('admin.exTask.flag.staticTypeHelp')).not.toBeInTheDocument()
  })

  it('explains malformed flags after blur and static flags left from device unlinking', () => {
    render(<FlagInput value={['ICE{has space}', 'ICE{second}']} onChange={onChange} linkedDeviceID="" />)
    expect(screen.queryByText('admin.ex.val.flagFormat')).not.toBeInTheDocument()
    fireEvent.blur(screen.getByDisplayValue('ICE{has space}'))
    expect(screen.getByText('admin.ex.val.flagFormat')).toBeInTheDocument()
    expect(screen.getByText('admin.exTask.flag.staticCount')).toBeInTheDocument()
  })

  it('uses compact numbered rows and hides each delete control until row hover or focus', () => {
    render(<FlagInput value={['ICE{first}', 'ICE{second}']} onChange={onChange} linkedDeviceID="vm-1" />)
    const rows = screen.getAllByTestId('flag-candidate-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('1.')
    expect(rows[1]).toHaveTextContent('2.')
    expect(rows[0]).not.toHaveClass('border')
    expect(rows[0].parentElement).not.toHaveClass('divide-y')
    expect(within(rows[0]).getByRole('button', { name: 'admin.exTask.flag.mode 1' }).compareDocumentPosition(rows[0].querySelector('input')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(rows[0]).getByRole('button', { name: 'admin.exTask.flag.mode 1' })).toHaveClass('text-sm', 'bg-primary', 'text-primary-foreground', 'exercise-flag-mode')
    expect(within(rows[0]).getByTestId('flag-candidate-control')).toHaveClass('border')
    expect(rows[0].querySelector('input')).toHaveClass('border-0')
    expect(rows[0].querySelector('input')).toHaveClass('text-sm', 'placeholder:text-sm')
    expect(rows[0].querySelector('span')).toHaveClass('text-sm')
    const remove = within(rows[0]).getByRole('button', { name: 'admin.exTask.flag.remove' })
    expect(rows[0].querySelector('input')!.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'admin.exTask.flag.remove' })[0]).toHaveClass('opacity-0')
  })

  it('offers insertion only for a focused template and keeps deletion available on hover or focus', () => {
    render(<FlagInput value={[String.raw`template:ICE{room-\d}`]} onChange={onChange} linkedDeviceID="vm-1" />)
    const insert = screen.getByRole('button', { name: 'admin.exTask.flag.insert' })
    const remove = screen.getByRole('button', { name: 'admin.exTask.flag.remove' })
    expect(insert).toHaveClass('opacity-0', 'group-focus-within:opacity-100')
    expect(insert).not.toHaveClass('group-hover:opacity-100')
    expect(remove).toHaveClass('group-hover:opacity-100', 'group-focus-within:opacity-100')
    expect(screen.getByTestId('flag-candidate-row')).toContainElement(insert)
    expect(insert.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('inserts a digit-exclusion block at the text cursor', () => {
    render(<FlagInput value={['template:ICE{room-}']} onChange={onChange} linkedDeviceID="vm-1" />)
    const input = screen.getByRole('textbox', { name: 'admin.exTask.flag.title 1' }) as HTMLInputElement
    input.focus()
    input.setSelectionRange(9, 9)
    fireEvent.select(input)
    fireEvent.keyDown(screen.getByRole('button', { name: 'admin.exTask.flag.insert' }), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitem', { name: /admin.exTask.flag.insertDigitsExcept/ }))
    expect(onChange).toHaveBeenCalledWith([String.raw`template:ICE{room-[\d^]}`])
  })

  it('returns the caret inside a newly inserted exclusion block', async () => {
    function Controlled() {
      const [flags, setFlags] = useState(['template:ICE{room-}'])
      return <FlagInput value={flags} onChange={setFlags} linkedDeviceID="vm-1" />
    }
    render(<Controlled />)
    const input = screen.getByRole('textbox', { name: 'admin.exTask.flag.title 1' }) as HTMLInputElement
    input.focus()
    input.setSelectionRange(9, 9)
    fireEvent.select(input)
    fireEvent.keyDown(screen.getByRole('button', { name: 'admin.exTask.flag.insert' }), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitem', { name: /admin.exTask.flag.insertDigitsExcept/ }))
    await waitFor(() => expect(input).toHaveValue(String.raw`ICE{room-[\d^]}`))
    await waitFor(() => expect(input.selectionStart).toBe(13))
  })

  it('puts template details to the right on wide screens, with responsive wrapping', () => {
    render(<FlagInput value={[String.raw`template:ICE{\d}`]} onChange={onChange} linkedDeviceID="vm-1" />)
    const main = screen.getByTestId('flag-candidate-main')
    expect(main).toHaveClass('flex', 'flex-wrap', 'items-start')
    expect(screen.getByTestId('flag-candidate-meta')).toHaveClass('flex-[1_1_16rem]', 'flex', 'min-h-10', 'flex-col', 'justify-center')
    expect(main.querySelector('p[role="status"]')).toBeNull()
    expect(screen.getByRole('button', { name: /admin.exTask.flag.templateExclusionRules/ })).toBeInTheDocument()
  })

  it('keeps only the example on the right and combines errors with weak-template feedback below the input', () => {
    render(<FlagInput value={[String.raw`template:ICE{\d}`]} onChange={onChange} linkedDeviceID="vm-1"
      errors={['Invalid flag.']} policy={{ RandomHexLength: 12, RandomBits: 48, WarningBits: 20 }} />)
    const meta = screen.getByTestId('flag-candidate-meta')
    expect(meta).toHaveTextContent('admin.exTask.flag.example')
    expect(meta).not.toHaveTextContent('admin.exTask.flag.weak')
    const feedback = screen.getByRole('alert')
    expect(feedback).toHaveTextContent('Invalid flag. admin.exTask.flag.weak')
    expect(screen.getByTestId('flag-candidate-main')).toContainElement(feedback)
  })

  it('groups single elements, combinations, exclusion sets and illustrative classes in the insertion menu', () => {
    render(<FlagInput value={[String.raw`template:ICE{\d}`]} onChange={onChange} linkedDeviceID="vm-1" />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'admin.exTask.flag.insert' }), { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: /admin.exTask.flag.insertAllLetters.*\[\\l\\u\]/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /admin.exTask.flag.insertAlphanumeric.*\[\\d\\l\\u\]/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /admin.exTask.flag.insertAllLettersExcept.*\[\\l\\u\^\]/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /admin.exTask.flag.insertTwoLetters.*\[ab\]/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /admin.exTask.flag.insertRangeAndLetter.*\[A-Ce\]/ })).toBeInTheDocument()
  })

  it('keeps syntax guidance in the flag help, not repeated under each template', () => {
    const { rerender } = render(<FlagInput value={['ICE{fixed}']} onChange={onChange} linkedDeviceID="vm-1" />)
    expect(screen.queryByText('admin.exTask.flag.templateRules')).not.toBeInTheDocument()
    rerender(<FlagInput value={[String.raw`template:ICE{\d[abc1-3]\l\u}`]} onChange={onChange} linkedDeviceID="vm-1" />)
    expect(screen.queryByText('admin.exTask.flag.templateRules')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /admin.exTask.flag.templateRules/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /admin.exTask.flag.allowedCharacters/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /admin.exTask.flag.escapeRules/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /admin.exTask.flag.templateCodes/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /admin.exTask.flag.weightHelp/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /\\d/ })).toBeInTheDocument()
  })

  it('groups the flag help into scannable rules and keeps syntax examples distinct', () => {
    render(<FlagInput value={[String.raw`template:ICE{\d}`]} onChange={onChange} linkedDeviceID="vm-1" />)
    fireEvent.mouseEnter(screen.getByRole('button', { name: /admin.exTask.flag.help/ }))

    const tooltip = screen.getByRole('tooltip')
    expect(within(tooltip).getAllByRole('heading').map((heading) => heading.textContent)).toEqual([
      'admin.exTask.flag.sectionFormat',
      'admin.exTask.flag.modeFixed',
      'admin.exTask.flag.modeTemplate',
      'admin.exTask.flag.sectionSelection',
    ])
    expect(within(tooltip).getByText(String.raw`\d`).tagName).toBe('CODE')
    expect(within(tooltip).getByText(String.raw`[\d^13]`).tagName).toBe('CODE')
    expect(within(tooltip).getByText('admin.exTask.flag.weightHelp')).toBeInTheDocument()
    const selection = within(tooltip).getByRole('heading', { name: 'admin.exTask.flag.sectionSelection' }).closest('section')!
    expect(within(selection).getByText('admin.exTask.flag.selectionExample')).toBeInTheDocument()
  })
})
