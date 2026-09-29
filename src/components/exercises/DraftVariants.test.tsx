import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FormProvider, useForm } from 'react-hook-form'

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))
vi.mock('./TaskAccordion', () => ({ TaskAccordion: () => <h3>Task panel</h3> }))
vi.mock('./TopologySection', () => ({ TopologySection: () => <h3>Topology panel</h3> }))

import { DraftVariants } from './DraftFields'
import { emptyDraft, type DraftFormValues } from '@/lib/exerciseSchemas'

function Harness() {
  const draft = emptyDraft()
  draft.Variants[0].Note = 'A long private note for the variant'
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  return <FormProvider {...form}><DraftVariants form={form} disabled={false} /></FormProvider>
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
