import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))

import { VariantTabs } from './VariantTabs'
import { useLinkedVariantSync } from './useLinkedVariantSync'
import { emptyDraft, emptyTask, emptyVariant, type DraftFormValues } from '@/lib/exerciseSchemas'

function openMenu() {
  const trigger = screen.getByRole('button', { name: 'admin.exDraft.addVariant' })
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
}

function addEmpty() {
  openMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'admin.exDraft.addEmptyVariant' }))
}

function Harness({ prepare, onAddLinked, sync = false }: { prepare?: (draft: DraftFormValues) => void; onAddLinked?: () => void; sync?: boolean } = {}) {
  const draft = emptyDraft()
  draft.Variants[0].Tasks = [
    { ...emptyTask(), ID: 'a', Name: 'First task', Difficulty: 'medium', Flag: ['ICE{secret}'] },
    { ...emptyTask(), ID: 'b', Name: 'Second task', Difficulty: 'hard' },
  ]
  prepare?.(draft)
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  useLinkedVariantSync(form, sync)
  const variants = useWatch({ control: form.control, name: 'Variants' })
  return <FormProvider {...form}>
    <VariantTabs disabled={false} onAddLinked={onAddLinked} renderVariant={(index) => <div>Variant content {index}</div>} />
    <output data-testid="variants-json">{JSON.stringify(variants)}</output>
  </FormProvider>
}

describe('VariantTabs', () => {
  it('a new variant inherits the canonical task structure without copying secret flags', () => {
    render(<Harness />)
    addEmpty()
    const variants = JSON.parse(screen.getByTestId('variants-json').textContent ?? '[]') as DraftFormValues['Variants']
    expect(variants).toHaveLength(2)
    expect(variants[1].Tasks.map((task) => ({ ID: task.ID, Name: task.Name, Difficulty: task.Difficulty, Flag: task.Flag }))).toEqual([
      { ID: 'a', Name: 'First task', Difficulty: 'medium', Flag: [] },
      { ID: 'b', Name: 'Second task', Difficulty: 'hard', Flag: [] },
    ])
  })

  it('keeps the delete action out of the tablist and removes the open variant', () => {
    render(<Harness />)
    addEmpty()
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

  it('copy of the open variant copies everything and stays independent', () => {
    render(<Harness prepare={(draft) => {
      draft.Variants[0].ID = 'src'
      draft.Variants[0].Note = 'Source note'
      draft.Variants[0].Tasks[0].Hints = [{ ...draft.Variants[0].Tasks[0].Hints?.[0], Text: 'Hint text' } as never]
      draft.Variants[0].Tasks[0].Attachments = [{ ID: 'att', Name: 'f.txt' } as never]
    }} />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'admin.exDraft.copyVariant' }))
    const variants = JSON.parse(screen.getByTestId('variants-json').textContent ?? '[]') as DraftFormValues['Variants']
    expect(variants).toHaveLength(2)
    const { ID, LinkedTo, CopyOf, Index, ...rest } = variants[1]
    expect(rest).toEqual({ Note: 'Source note', Tasks: variants[0].Tasks, Topology: variants[0].Topology })
    expect(ID).toBe('')
    expect(LinkedTo).toBe('')
    expect(CopyOf).toBe('src')
    expect(Index).toBe(2)
    expect(rest.Tasks[0].Flag).toEqual(['ICE{secret}'])
    expect(rest.Tasks[0].Attachments).toHaveLength(1)
    expect(screen.getByRole('tab', { name: 'admin.exDraft.variantN', selected: true })).toBeInTheDocument()
    expect(screen.getByText('Variant content 1')).toBeInTheDocument()
  })

  it('linked entry waits for a saved base', () => {
    const onAddLinked = vi.fn()
    function Wrapper() {
      const form = useForm<DraftFormValues>({ defaultValues: (() => { const d = emptyDraft(); return d })() })
      return <FormProvider {...form}>
        <VariantTabs disabled={false} onAddLinked={onAddLinked} renderVariant={() => null} />
        <button type="button" onClick={() => form.setValue('Variants.0.ID', 'saved')}>save</button>
      </FormProvider>
    }
    render(<Wrapper />)
    openMenu()
    const item = screen.getByRole('menuitem', { name: 'admin.exDraft.addLinkedVariants' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    item.focus()
    expect(item).toHaveFocus()
    const reason = item.getAttribute('aria-describedby')
    expect(reason).toBeTruthy()
    expect(document.getElementById(reason as string)).toHaveTextContent('admin.exDraft.linkedNeedsSavedBase')
    // The reason wrapper spans the menu, so the item's highlight does too.
    expect(item.parentElement).toHaveClass('w-full')
    fireEvent.click(item)
    fireEvent.keyDown(item, { key: 'Enter' })
    fireEvent.keyDown(item, { key: ' ' })
    expect(onAddLinked).not.toHaveBeenCalled()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    fireEvent.click(screen.getByText('save'))
    openMenu()
    const enabled = screen.getByRole('menuitem', { name: 'admin.exDraft.addLinkedVariants' })
    expect(enabled).not.toHaveAttribute('aria-disabled', 'true')
    // The same keys do select the enabled item, so the check above is not vacuous.
    fireEvent.keyDown(enabled, { key: 'Enter' })
    expect(onAddLinked).toHaveBeenCalledTimes(1)
  })

  it('removing a base unlinks its dependents', () => {
    render(<Harness prepare={(draft) => {
      const base = draft.Variants[0]
      base.ID = 'base'
      const linked = (id: string, index: number) => ({ ...emptyVariant(index), ID: id, LinkedTo: 'base', Tasks: base.Tasks.map((task) => ({ ...task })) })
      draft.Variants.push(linked('l1', 2), linked('l2', 3))
    }} />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exDraft.removeVariant' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('admin.exDraft.removeBaseVariantDescription')
    fireEvent.click(screen.getByRole('button', { name: 'admin.exDraft.removeVariantConfirm' }))
    const variants = JSON.parse(screen.getByTestId('variants-json').textContent ?? '[]') as DraftFormValues['Variants']
    expect(variants.map((v) => v.ID)).toEqual(['l1', 'l2'])
    expect(variants.map((v) => v.LinkedTo)).toEqual(['', ''])
    expect(variants[0].Tasks.map((task) => task.Name)).toEqual(['First task', 'Second task'])
  })

  it('removing an independent variant keeps the plain description', () => {
    render(<Harness prepare={(draft) => { draft.Variants[0].ID = 'base'; draft.Variants.push({ ...emptyVariant(2), ID: 'other' }) }} />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exDraft.removeVariant' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('admin.exDraft.removeVariantNDescription')
    expect(screen.getByRole('dialog')).not.toHaveTextContent('admin.exDraft.removeBaseVariantDescription')
  })

  it('hides the linked item when onAddLinked is absent', () => {
    render(<Harness />)
    openMenu()
    expect(screen.queryByRole('menuitem', { name: 'admin.exDraft.addLinkedVariants' })).not.toBeInTheDocument()
  })

  it('editing the copy leaves the source unchanged', () => {
    function Editor() {
      const form = useForm<DraftFormValues>({ defaultValues: emptyDraft() })
      const variants = useWatch({ control: form.control, name: 'Variants' })
      return <FormProvider {...form}>
        <VariantTabs disabled={false} renderVariant={() => null} />
        <button type="button" onClick={() => form.setValue('Variants.1.Tasks.0.Flag', ['changed'])}>edit</button>
        <output data-testid="v">{JSON.stringify(variants)}</output>
      </FormProvider>
    }
    render(<Editor />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'admin.exDraft.copyVariant' }))
    fireEvent.click(screen.getByText('edit'))
    const variants = JSON.parse(screen.getByTestId('v').textContent ?? '[]') as DraftFormValues['Variants']
    expect(variants).toHaveLength(2)
    expect(variants[0].Tasks[0].Flag).toEqual([])
    expect(variants[1].Tasks[0].Flag).toEqual(['changed'])
  })

  it('with the sync mounted, removing a base keeps the dependent intact and independent', () => {
    render(<Harness sync prepare={(draft) => {
      const base = draft.Variants[0]
      base.ID = 'base'
      draft.Variants.push({ ...emptyVariant(2), ID: 'l1', LinkedTo: 'base', Tasks: base.Tasks.map((task) => ({ ...task })) })
    }} />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exDraft.removeVariant' }))
    fireEvent.click(screen.getByRole('button', { name: 'admin.exDraft.removeVariantConfirm' }))
    const variants = JSON.parse(screen.getByTestId('variants-json').textContent ?? '[]') as DraftFormValues['Variants']
    expect(variants).toHaveLength(1)
    expect(variants[0].ID).toBe('l1')
    expect(variants[0].LinkedTo).toBe('')
    expect(variants[0].Tasks.map((task) => task.Name)).toEqual(['First task', 'Second task'])
  })
})
