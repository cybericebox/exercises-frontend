import { useLayoutEffect, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { FormProvider, useForm, useWatch, type UseFormReturn } from 'react-hook-form'

vi.mock('@/i18n/t', () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key}${JSON.stringify(vars)}` : key }))
vi.mock('./TaskAccordion', () => ({ TaskAccordion: vi.fn(({ linked, variantIndex }: { linked: boolean; variantIndex: number }) => <h3 data-linked={String(linked)}>Task panel {variantIndex}</h3>) }))
vi.mock('./TopologySection', () => ({ TopologySection: ({ disabled }: { disabled: boolean }) => <h3 data-disabled={String(disabled)}>Topology panel</h3> }))
vi.mock('./VariantStatsDialog', () => ({ VariantStatsDialog: ({ exerciseId }: { exerciseId: string }) => <div role="dialog">stats for {exerciseId}</div> }))

import { EditorWorkspace } from './EditorWorkspace'
import { EditorPositionProvider } from './EditorPosition'
import { TaskAccordion } from './TaskAccordion'
import { DEFAULT_EDITOR_POSITION, type EditorPosition } from '@/lib/editorPosition'
import { emptyDraft, emptyTask, emptyVariant, type DraftFormValues } from '@/lib/exerciseSchemas'

function Workspace({ form, exerciseId = null, disabled = false, showNotes, start = 'variants' }: { form: UseFormReturn<DraftFormValues>; exerciseId?: string | null; disabled?: boolean; showNotes?: boolean; start?: EditorPosition['tab'] }) {
  const [position, setPosition] = useState<EditorPosition>({ ...DEFAULT_EDITOR_POSITION, tab: start })
  return <EditorPositionProvider position={position} onChange={(key, value) => setPosition((current) => ({ ...current, [key]: value }))}>
    <EditorWorkspace form={form} general={<p>General fields</p>} disabled={disabled} exerciseId={exerciseId} showNotes={showNotes} />
  </EditorPositionProvider>
}

function Harness({ prepare, exerciseId = null, disabled = false, showNotes, start }: { prepare?: (draft: DraftFormValues) => void; exerciseId?: string | null; disabled?: boolean; showNotes?: boolean; start?: EditorPosition['tab'] } = {}) {
  const [draft] = useState(() => {
    const value = emptyDraft()
    value.Variants[0].Tasks = [
      { ...emptyTask(), ID: 'a', Name: 'First task', Difficulty: 'medium', Flag: ['ICE{secret}'] },
      { ...emptyTask(), ID: 'b', Name: 'Second task', Difficulty: 'hard' },
    ]
    prepare?.(value)
    return value
  })
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  const variants = useWatch({ control: form.control, name: 'Variants' })
  return <FormProvider {...form}>
    <Workspace form={form} exerciseId={exerciseId} disabled={disabled} showNotes={showNotes} start={start} />
    <output data-testid="variants-json">{JSON.stringify(variants)}</output>
    <button type="button" onClick={() => form.setValue('Variants.0.ID', 'saved')}>save base</button>
  </FormProvider>
}

const variantsJson = () => JSON.parse(screen.getByTestId('variants-json').textContent ?? '[]') as DraftFormValues['Variants']
const variantTab = (n: number) => screen.getByRole('tab', { name: `admin.exDraft.variantN{"n":${n}}` })

function openAddMenu() {
  fireEvent.keyDown(screen.getByRole('button', { name: 'admin.exDraft.addVariant' }), { key: 'ArrowDown' })
}

function openVariantMenu() {
  fireEvent.keyDown(screen.getByRole('button', { name: 'admin.exDraft.variantActions' }), { key: 'ArrowDown' })
}

function linkedDraft(draft: DraftFormValues) {
  const task = (flag: string) => ({ ...emptyTask(), ID: 't1', Name: 'Scan', Description: { text: 'base text' }, Flag: [flag] })
  draft.Variants = [
    { ...emptyVariant(1), ID: 'b', Tasks: [task('ICE{base}')] },
    { ...emptyVariant(2), ID: 'l', LinkedTo: 'b', Note: 'own note', Tasks: [task('ICE{own}')] },
  ]
}

describe('editor tabs', () => {
  it('puts «Загальне» and every variant number in one tab list; a variant tab opens that variant', () => {
    render(<Harness start="general" prepare={(draft) => draft.Variants.push({ ...emptyVariant(2), Tasks: draft.Variants[0].Tasks })} />)
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent || tab.getAttribute('aria-label'))).toEqual(['admin.ex.create.tab.general', '1', '2', 'admin.exDraft.allVariants'])
    expect(screen.getByText('General fields')).toBeVisible()
    expect(screen.getByText('admin.exDraft.variantsCount{"count":2}')).toBeInTheDocument()
    fireEvent.click(variantTab(2))
    expect(variantTab(2)).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('General fields')).not.toBeVisible()
    expect(screen.getByText('Task panel 1')).toBeInTheDocument()
    // Roving focus across the general tab and the numbers.
    fireEvent.keyDown(variantTab(2), { key: 'Home' })
    expect(screen.getByRole('tab', { name: 'admin.ex.create.tab.general' })).toHaveFocus()
    expect(screen.getByText('General fields')).toBeVisible()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'admin.ex.create.tab.general' }), { key: 'ArrowRight' })
    expect(variantTab(1)).toHaveFocus()
    fireEvent.click(screen.getByRole('tab', { name: 'admin.exDraft.allVariants' }))
    expect(screen.getByRole('region', { name: 'admin.exDraft.allVariants' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'admin.exDraft.openVariant{"n":2}' }))
    expect(variantTab(2)).toHaveAttribute('aria-selected', 'true')
  })

  it('does not re-render the subtasks on a keystroke inside a variant', () => {
    const formRef: { current: UseFormReturn<DraftFormValues> | null } = { current: null }
    function Quiet() {
      const form = useForm<DraftFormValues>({ defaultValues: emptyDraft() })
      useLayoutEffect(() => { formRef.current = form })
      return <FormProvider {...form}><Workspace form={form} /></FormProvider>
    }
    render(<Quiet />)
    const before = vi.mocked(TaskAccordion).mock.calls.length
    act(() => formRef.current?.setValue('Variants.0.Tasks.0.Name', 'Typed', { shouldDirty: true }))
    act(() => formRef.current?.setValue('Variants.0.Note', 'Typed note', { shouldDirty: true }))
    expect(vi.mocked(TaskAccordion).mock.calls.length).toBe(before)
  })

  it('adds an independent copy of the open variant with everything in it', () => {
    render(<Harness prepare={(draft) => { draft.Variants[0].ID = 'src'; draft.Variants[0].Note = 'Source note'; draft.Variants[0].Weight = 3 }} />)
    openAddMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /admin\.exDraft\.addIndependent/ }))
    const variants = variantsJson()
    expect(variants).toHaveLength(2)
    const { ID, LinkedTo, CopyOf, Index, ...rest } = variants[1]
    // A copy keeps the source's issue weight.
    expect(rest).toEqual({ Note: 'Source note', Weight: 3, Tasks: variants[0].Tasks, Topology: variants[0].Topology })
    expect([ID, LinkedTo, CopyOf, Index]).toEqual(['', '', 'src', 2])
    expect(rest.Tasks[0].Flag).toEqual(['ICE{secret}'])
    expect(screen.getByRole('tab', { name: /labelWithWeight.*"n\\":2.*"weight":3/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('offers a variant based on another only once a base is saved, and creates them through the dialog', async () => {
    render(<Harness />)
    openAddMenu()
    const item = screen.getByRole('menuitem', { name: /admin\.exDraft\.addBased/ })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    expect(document.getElementById(item.getAttribute('aria-describedby') as string)).toHaveTextContent('admin.exDraft.linkedNeedsSavedBase')
    fireEvent.keyDown(item, { key: 'Enter' })
    expect(screen.queryByRole('dialog', { name: 'admin.exLinked.title' })).not.toBeInTheDocument()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    fireEvent.click(screen.getByText('save base'))
    openAddMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /admin\.exDraft\.addBased/ }))
    const dialog = await screen.findByRole('dialog', { name: 'admin.exLinked.title' })
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'admin.exLinked.count' }), { target: { value: '2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'admin.exLinked.create' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(variantsJson().map((variant) => variant.LinkedTo)).toEqual(['', 'saved', 'saved'])
    expect(screen.getByRole('tab', { name: 'admin.exDraft.variantBasedOn{"n":2,"base":1}', selected: true })).toBeInTheDocument()
  })

  it('removes the open variant from its menu after a confirmation; the last one cannot be removed', () => {
    render(<Harness prepare={(draft) => { draft.Variants[0].ID = 'base'; draft.Variants.push({ ...emptyVariant(2), ID: 'other' }) }} />)
    fireEvent.click(variantTab(2))
    openVariantMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'admin.exDraft.removeVariant' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('admin.exDraft.removeVariantNDescription')
    fireEvent.click(screen.getByRole('button', { name: 'admin.exDraft.removeVariantCancel' }))
    expect(variantsJson()).toHaveLength(2)
    openVariantMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'admin.exDraft.removeVariant' }))
    fireEvent.click(screen.getByRole('button', { name: 'admin.exDraft.removeVariantConfirm' }))
    expect(variantsJson().map((variant) => variant.ID)).toEqual(['base'])
    expect(screen.queryByRole('button', { name: 'admin.exDraft.variantActions' })).not.toBeInTheDocument()
  })

  it('removing a base unlinks its dependents and keeps their content', () => {
    render(<Harness prepare={(draft) => {
      const base = draft.Variants[0]
      base.ID = 'base'
      draft.Variants.push({ ...emptyVariant(2), ID: 'l1', LinkedTo: 'base', Tasks: base.Tasks.map((task) => ({ ...task })) })
    }} />)
    openVariantMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'admin.exDraft.removeVariant' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('admin.exDraft.removeBaseVariantDescription')
    fireEvent.click(screen.getByRole('button', { name: 'admin.exDraft.removeVariantConfirm' }))
    const variants = variantsJson()
    expect(variants.map((v) => [v.ID, v.LinkedTo])).toEqual([['l1', '']])
    expect(variants[0].Tasks.map((task) => task.Name)).toEqual(['First task', 'Second task'])
  })
})

describe('variant modes', () => {
  it('switches subtasks, infrastructure and the note with roving keys', () => {
    render(<Harness />)
    const tasks = screen.getByRole('tab', { name: 'admin.exDraft.tab.tasks' })
    const topology = screen.getByRole('tab', { name: 'admin.exDraft.tab.topology' })
    expect(tasks).toHaveAttribute('tabindex', '0')
    fireEvent.keyDown(tasks, { key: 'ArrowRight' })
    expect(topology).toHaveFocus()
    expect(screen.getByText('Topology panel')).toBeInTheDocument()
    fireEvent.keyDown(topology, { key: 'End' })
    const note = screen.getByRole('textbox', { name: 'admin.exDraft.variantNote' })
    expect(note).toHaveAttribute('rows', '6')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'admin.exDraft.tab.note' }), { key: 'Home' })
    expect(screen.getByText('Task panel 0')).toBeInTheDocument()
  })

  it('leaves out the note for a reader without full access', () => {
    render(<Harness showNotes={false} />)
    expect(screen.queryByRole('tab', { name: 'admin.exDraft.tab.note' })).not.toBeInTheDocument()
  })

  it('says what a linked variant is, keeps its topology read-only and its note editable', () => {
    render(<Harness prepare={linkedDraft} />)
    expect(screen.getByText('Task panel 0')).toHaveAttribute('data-linked', 'false')
    fireEvent.click(screen.getByRole('tab', { name: 'admin.exDraft.variantBasedOn{"n":2,"base":1}' }))
    expect(screen.getByText('admin.exDraft.summaryLinked{"base":1}')).toBeInTheDocument()
    expect(screen.getByText('Task panel 1')).toHaveAttribute('data-linked', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'admin.exDraft.tab.topology' }))
    expect(screen.getByText('Topology panel')).toHaveAttribute('data-disabled', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'admin.exDraft.tab.note' }))
    expect(screen.getByRole('textbox', { name: 'admin.exDraft.variantNote' })).toHaveValue('own note')
  })

  it('unlinks after a confirmation and keeps the content', async () => {
    render(<Harness prepare={linkedDraft} />)
    fireEvent.click(screen.getByRole('tab', { name: 'admin.exDraft.variantBasedOn{"n":2,"base":1}' }))
    openVariantMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'admin.exDraft.unlinkFrom{"base":1}' }))
    const dialog = await screen.findByRole('dialog', { name: 'admin.exDraft.unlinkTitle' })
    expect(dialog).toHaveTextContent('admin.exDraft.unlinkDescription{"n":2,"base":1}')
    fireEvent.click(within(dialog).getByRole('button', { name: 'admin.exDraft.unlinkConfirm' }))
    await waitFor(() => expect(variantsJson()[1].LinkedTo).toBe(''))
    expect(variantsJson()[1].Tasks[0].Flag).toEqual(['ICE{own}'])
    expect(screen.getByText('admin.exDraft.summaryIndependent')).toBeInTheDocument()
  })

  it('opens the variant statistics from the variant menu once the task is saved', () => {
    const { unmount } = render(<Harness disabled />)
    expect(screen.queryByRole('button', { name: 'admin.exDraft.variantActions' })).not.toBeInTheDocument()
    unmount()
    render(<Harness exerciseId="ex1" disabled />)
    openVariantMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'admin.exStats.open' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('stats for ex1')
  })

  it('names a weight above 1 in the variant tab and in the summary line', () => {
    render(<Harness prepare={(draft) => draft.Variants.push({ ...emptyVariant(2), Weight: 2, Tasks: draft.Variants[0].Tasks })} />)
    expect(screen.getByRole('tab', { name: `admin.exDraft.labelWithWeight{"label":"admin.exDraft.variantN{\\"n\\":2}","weight":2}` })).toBeInTheDocument()
    expect(variantTab(1)).toBeInTheDocument()
    expect(screen.getByText('admin.exDraft.summaryFirst')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /labelWithWeight/ }))
    expect(screen.getByText('admin.exDraft.summaryWithWeight{"summary":"admin.exDraft.summaryIndependent","weight":2}')).toBeInTheDocument()
  })

  it('offers statistics and «Додати варіант» above the all-variants table', () => {
    render(<Harness exerciseId="ex-1" start="all" prepare={(draft) => draft.Variants.push({ ...emptyVariant(2), Note: 'n', Tasks: draft.Variants[0].Tasks })} />)
    const panel = screen.getByRole('region', { name: 'admin.exDraft.allVariants' }).closest('[role="tabpanel"]') as HTMLElement
    fireEvent.click(within(panel).getByRole('button', { name: 'admin.exStats.open' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('stats for ex-1')
    fireEvent.keyDown(within(panel).getByRole('button', { name: 'admin.exDraft.addVariant' }), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitem', { name: /admin\.exDraft\.addIndependent/ }))
    expect(variantsJson()).toHaveLength(3)
  })

  it('turns the variant numbers into one «Варіант N з M» tab with a menu on a phone', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('max-width'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    try {
      render(<Harness prepare={(draft) => draft.Variants.push({ ...emptyVariant(2), Tasks: draft.Variants[0].Tasks })} />)
      const tabs = within(screen.getByRole('tablist', { name: 'admin.exDraft.editorTabs' })).getAllByRole('tab')
      expect(tabs.map((tab) => tab.textContent)).toEqual(['admin.ex.create.tab.general', 'admin.exDraft.variantOf{"n":1,"count":2}'])
      fireEvent.keyDown(screen.getByRole('tab', { name: /variantOf/ }), { key: 'ArrowDown' })
      fireEvent.click(await screen.findByRole('menuitemradio', { name: 'admin.exDraft.variantN{"n":2}' }))
      expect(await screen.findByRole('tab', { name: 'admin.exDraft.variantOf{"n":2,"count":2}' })).toHaveAttribute('aria-selected', 'true')
      fireEvent.keyDown(screen.getByRole('tab', { name: /variantOf/ }), { key: 'ArrowDown' })
      fireEvent.click(await screen.findByRole('menuitemradio', { name: 'admin.exDraft.allVariants' }))
      expect(await screen.findByRole('region', { name: 'admin.exDraft.allVariants' })).toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
