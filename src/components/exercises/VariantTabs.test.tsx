import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))

import { VariantTabs } from './VariantTabs'
import { emptyDraft, emptyTask, type DraftFormValues } from '@/lib/exerciseSchemas'

function Harness() {
  const draft = emptyDraft()
  draft.Variants[0].Tasks = [
    { ...emptyTask(), ID: 'a', Name: 'First task', Difficulty: 'medium', Flag: ['ICE{secret}'] },
    { ...emptyTask(), ID: 'b', Name: 'Second task', Difficulty: 'hard' },
  ]
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  const variants = useWatch({ control: form.control, name: 'Variants' })
  return <FormProvider {...form}>
    <VariantTabs disabled={false} renderVariant={(index) => <div>Variant content {index}</div>} />
    <output data-testid="variants-json">{JSON.stringify(variants)}</output>
  </FormProvider>
}

describe('VariantTabs', () => {
  it('a new variant inherits the canonical task structure without copying secret flags', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exDraft.addVariant' }))
    const variants = JSON.parse(screen.getByTestId('variants-json').textContent ?? '[]') as DraftFormValues['Variants']
    expect(variants).toHaveLength(2)
    expect(variants[1].Tasks.map((task) => ({ ID: task.ID, Name: task.Name, Difficulty: task.Difficulty, Flag: task.Flag }))).toEqual([
      { ID: 'a', Name: 'First task', Difficulty: 'medium', Flag: [] },
      { ID: 'b', Name: 'Second task', Difficulty: 'hard', Flag: [] },
    ])
  })

  it('keeps the delete action out of the tablist and removes the open variant', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exDraft.addVariant' }))
    const remove = screen.getByRole('button', { name: 'admin.exDraft.removeVariant' })
    expect(screen.getByRole('tablist')).not.toContainElement(remove)
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    fireEvent.click(remove)
    expect(screen.getByRole('dialog', { name: 'admin.exDraft.removeVariantTitle' })).toBeInTheDocument()
    expect(JSON.parse(screen.getByTestId('variants-json').textContent ?? '[]')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exDraft.removeVariantCancel' }))
    expect(JSON.parse(screen.getByTestId('variants-json').textContent ?? '[]')).toHaveLength(2)
    fireEvent.click(remove)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exDraft.removeVariantConfirm' }))
    const variants = JSON.parse(screen.getByTestId('variants-json').textContent ?? '[]') as DraftFormValues['Variants']
    expect(variants).toHaveLength(1)
    expect(variants[0].Tasks[0].Flag).toEqual(['ICE{secret}'])
  })
})
