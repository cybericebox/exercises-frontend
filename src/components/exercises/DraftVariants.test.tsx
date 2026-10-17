import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'

vi.mock('@/i18n/t', () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key}${JSON.stringify(vars)}` : key }))
vi.mock('./TaskAccordion', () => ({ TaskAccordion: ({ linked }: { linked: boolean }) => <h3 data-linked={String(linked)}>Task panel</h3> }))
vi.mock('./TopologySection', () => ({ TopologySection: ({ disabled }: { disabled: boolean }) => <h3 data-disabled={String(disabled)}>Topology panel</h3> }))

import { DraftVariants } from './DraftFields'
import { emptyDraft, emptyTask, emptyVariant, type DraftFormValues } from '@/lib/exerciseSchemas'

function Harness() {
  const draft = emptyDraft()
  draft.Variants[0].Note = 'A long private note for the variant'
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  return <FormProvider {...form}><DraftVariants form={form} disabled={false} exerciseId={null} /></FormProvider>
}

describe('DraftVariants layout', () => {
  it('shows one collapsed note section above tasks without a separate note button or outer panel', () => {
    render(<Harness />)
    const section = screen.getByTestId('draft-variants')
    expect(section).not.toHaveClass('frost-panel')
    const note = screen.getByText('admin.exDraft.variantNoteShort').closest('details') as HTMLDetailsElement
    expect(note).not.toHaveAttribute('open')
    expect(screen.queryByRole('textbox', { name: 'admin.exDraft.variantNote' })).not.toBeVisible()
    expect(note.compareDocumentPosition(screen.getByText('Task panel')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'admin.exDraft.variantNote' })).not.toBeInTheDocument()
    fireEvent.click(note.querySelector('summary')!)
    expect(note).toHaveAttribute('open')
    const input = screen.getByRole('textbox', { name: 'admin.exDraft.variantNote' })
    expect(input).toHaveClass('overflow-y-auto')
    expect(input).toHaveAttribute('rows', '5')
  })
})

function linkedDraft(): DraftFormValues {
  const task = (flag: string) => ({ ...emptyTask(), ID: 't1', Name: 'Scan', Description: { text: 'base text' }, Flag: [flag] })
  return {
    AdminNote: '',
    Variants: [
      { ...emptyVariant(1), ID: 'b', Tasks: [task('ICE{base}')] },
      { ...emptyVariant(2), ID: 'l', LinkedTo: 'b', Note: 'own note', Tasks: [task('ICE{own}')] },
    ],
  }
}

function LinkedHarness() {
  const form = useForm<DraftFormValues>({ defaultValues: linkedDraft() })
  const linkedTo = useWatch({ control: form.control, name: 'Variants.1.LinkedTo' })
  const name = useWatch({ control: form.control, name: 'Variants.1.Tasks.0.Name' })
  const flag = useWatch({ control: form.control, name: 'Variants.1.Tasks.0.Flag' })
  return <FormProvider {...form}>
    <DraftVariants form={form} disabled={false} exerciseId="ex1" />
    <output data-testid="linked-to">{linkedTo}</output>
    <output data-testid="linked-task">{`${name}|${flag.join(',')}`}</output>
  </FormProvider>
}

function openVariant(n: number) {
  fireEvent.mouseDown(screen.getByRole('tab', { name: `admin.exDraft.variantN{"n":${n}}` }), { button: 0 })
}

describe('DraftVariants linked variant', () => {
  it('marks a linked variant with its base number', () => {
    render(<LinkedHarness />)
    expect(screen.queryByText('admin.exDraft.linkedTo{"n":1}')).not.toBeInTheDocument()
    expect(screen.getByText('Task panel')).toHaveAttribute('data-linked', 'false')
    openVariant(2)
    expect(screen.getByText('admin.exDraft.linkedTo{"n":1}')).toBeInTheDocument()
    expect(screen.getByText('Task panel')).toHaveAttribute('data-linked', 'true')
  })

  it('topology is read-only in a linked variant', () => {
    render(<LinkedHarness />)
    fireEvent.click(screen.getByRole('tab', { name: 'admin.exDraft.tab.topology' }))
    expect(screen.getByText('Topology panel')).toHaveAttribute('data-disabled', 'false')
    openVariant(2)
    expect(screen.getByText('Topology panel')).toHaveAttribute('data-disabled', 'true')
  })

  it('unlinking asks first and keeps the content', async () => {
    render(<LinkedHarness />)
    openVariant(2)
    const toggle = screen.getByRole('switch', { name: 'admin.exDraft.unlink' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    const dialog = await screen.findByRole('dialog', { name: 'admin.exDraft.unlinkTitle' })
    expect(dialog).toHaveTextContent('admin.exDraft.unlinkDescription{"n":2,"base":1}')
    await waitFor(() => expect(screen.getByRole('button', { name: 'confirm.cancel' })).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByTestId('linked-to')).toHaveTextContent('b')

    fireEvent.click(screen.getByRole('switch', { name: 'admin.exDraft.unlink' }))
    fireEvent.click(await screen.findByRole('button', { name: 'admin.exDraft.unlinkConfirm' }))
    await waitFor(() => expect(screen.getByTestId('linked-to')).toBeEmptyDOMElement())
    expect(screen.getByTestId('linked-task')).toHaveTextContent('Scan|ICE{own}')
    expect(screen.queryByRole('switch', { name: 'admin.exDraft.unlink' })).not.toBeInTheDocument()
    expect(screen.queryByText('admin.exDraft.linkedTo{"n":1}')).not.toBeInTheDocument()
    expect(screen.getByText('Task panel')).toHaveAttribute('data-linked', 'false')
  })

  it('the note of a linked variant stays editable', () => {
    render(<LinkedHarness />)
    openVariant(2)
    const note = screen.getByText('admin.exDraft.variantNoteShort').closest('details') as HTMLDetailsElement
    fireEvent.click(note.querySelector('summary')!)
    const input = screen.getByRole('textbox', { name: 'admin.exDraft.variantNote' })
    expect(input).toBeEnabled()
    expect(input).toHaveValue('own note')
  })
})
