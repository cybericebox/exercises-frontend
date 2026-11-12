/**
 * TaskAccordion.test.tsx — variant tasks accordion: add/remove with the ≥1 guard.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { helpButton } from '@/test/help'
import { useForm, useWatch, FormProvider } from 'react-hook-form'

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))
vi.mock("@/i18n/tRich", () => import("@/test/tRichMock"))

// Stub the heavy Lexical editor: TaskForm (rendered by an open row) imports it, and
// jsdom does not need the real rich-text stack for these behavior tests.
vi.mock('@/components/editor/RichTextEditor', () => ({
  default: () => <div data-testid="rich-text-editor" />,
}))
vi.mock('@/api/exercises/files', () => ({
  uploadExerciseAttachment: vi.fn(),
  exerciseFileURL: (id: string) => `/api/exercises/files/${id}`,
}))
vi.mock('@/api/exercises/flagPolicy', () => ({
  getFlagPolicy: vi.fn(() => new Promise(() => {})),
}))

import { TaskAccordion } from './TaskAccordion'
import { useLinkedVariantSync } from './useLinkedVariantSync'
import { emptyDraft, emptyTask, emptyVariant, type DraftFormValues, type TaskFormValues } from '@/lib/exerciseSchemas'
import { uploadExerciseAttachment } from '@/api/exercises/files'
import { formTask } from "@/test/editorFixtures"

function Harness({ tasks, otherTasks, disabled = false, linked = false }: { tasks: TaskFormValues[]; otherTasks?: TaskFormValues[]; disabled?: boolean; linked?: boolean }) {
  const draft = emptyDraft()
  draft.Variants[0].Tasks = tasks
  if (otherTasks) {
    const other = emptyVariant(2)
    other.Tasks = otherTasks
    draft.Variants.push(other)
  }
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  const variants = useWatch({ control: form.control, name: 'Variants' })
  return (
    <FormProvider {...form}>
      <TaskAccordion variantIndex={0} disabled={disabled} linked={linked} />
      <output data-testid="variant-tasks">{JSON.stringify(variants.map((variant) => variant.Tasks.map((item) => item.Name)))}</output>
      <output data-testid="variant-difficulty">{JSON.stringify(variants.map((variant) => variant.Tasks.map((item) => item.Difficulty)))}</output>
      <output data-testid="variant-files">{JSON.stringify(variants.map((variant) => variant.Tasks.map((item) => item.Attachments)))}</output>
    </FormProvider>
  )
}

function task(name: string): TaskFormValues {
  return { ...emptyTask(), Name: name }
}

describe('TaskAccordion', () => {
  it('a linked variant cannot add or remove subtasks', () => {
    render(<Harness tasks={[task('first'), task('second')]} linked />)
    expect(screen.queryByRole('button', { name: 'admin.exTask.add' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'admin.exTask.remove' })).not.toBeInTheDocument()
  })
  it('places the task heading and add action inside the task list column', () => {
    render(<Harness tasks={[task('first')]} />)
    const navigation = screen.getByRole('navigation', { name: 'admin.exDraft.tasks.title' })
    expect(within(navigation).getByRole('heading', { name: 'admin.exDraft.tasks.title' })).toBeInTheDocument()
    expect(within(navigation).getByRole('button', { name: 'admin.exTask.add' })).toBeInTheDocument()
  })
  it('single task → the remove-task button is absent (≥1 guard)', () => {
    render(<Harness tasks={[task('only')]} />)
    expect(screen.queryByRole('button', { name: 'admin.exTask.remove' })).not.toBeInTheDocument()
  })

  it('two tasks → remove button present; clicking it drops to one task', () => {
    render(<Harness tasks={[task('first'), task('second')]} />)
    expect(screen.getAllByRole('button', { name: 'admin.exTask.remove' })).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'admin.exTask.remove' })[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTask.removeConfirm' }))
    // Down to one task → the guard hides the remove button again.
    expect(screen.queryByRole('button', { name: 'admin.exTask.remove' })).not.toBeInTheDocument()
  })

  it('add-task button appends an empty task (count increases)', () => {
    render(<Harness tasks={[task('first')]} />)
    // One task → no accordion header shows the untitled fallback yet.
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTask.add' }))
    // The appended empty task has no Name → its header uses the untitled fallback.
    expect(screen.getByText('admin.exTask.numbered 2')).toBeInTheDocument()
    // Two tasks now → the remove-task control becomes available.
    expect(screen.getAllByRole('button', { name: 'admin.exTask.remove' })).toHaveLength(2)
  })

  it('adding a stage updates every variant so the draft remains structurally valid', () => {
    render(<Harness tasks={[task('first')]} otherTasks={[task('alternate')]} />)
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTask.add' }))
    expect(screen.getByTestId('variant-tasks')).toHaveTextContent('[["first",""],["alternate",""]]')
  })

  it('removing a stage removes the same position from every variant', () => {
    render(<Harness tasks={[task('first'), task('second')]} otherTasks={[task('alternate'), task('alternate second')]} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'admin.exTask.remove' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTask.removeConfirm' }))
    expect(screen.getByTestId('variant-tasks')).toHaveTextContent('[["second"],["alternate second"]]')
  })

  it('keeps all variants unchanged when stage deletion is cancelled', () => {
    render(<Harness tasks={[task('first'), task('second')]} otherTasks={[task('alternate'), task('alternate second')]} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'admin.exTask.remove' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTask.removeCancel' }))
    expect(screen.getByTestId('variant-tasks')).toHaveTextContent('[["first","second"],["alternate","alternate second"]]')
  })



  it('drops a file onto the files block of the selected stage rather than its neighbor', async () => {
    vi.mocked(uploadExerciseAttachment).mockResolvedValueOnce({ FileID: 'file-2', Name: 'image.png', Size: 1 })
    render(<Harness tasks={[task('first'), task('second')]} />)
    fireEvent.click(screen.getByRole('button', { name: 'second' }))
    const file = new File(['x'], 'image.png', { type: 'image/png' })
    const dropZone = screen.getByTestId('attachments-drop-zone')
    fireEvent.dragEnter(dropZone, { dataTransfer: { files: [file], types: ['Files'] } })
    fireEvent.drop(dropZone, { dataTransfer: { files: [file], types: ['Files'] } })
    await waitFor(() => expect(screen.getByTestId('variant-files')).toHaveTextContent('[[[],[{"FileID":"file-2","Name":"image.png"}]]]'))
    expect(screen.queryByRole('img', { name: 'image.png' })).not.toBeInTheDocument()
  })

  it('changing task difficulty updates the matching stage in every variant', () => {
    render(<Harness tasks={[task('first')]} otherTasks={[task('alternate')]} />)
    fireEvent.keyDown(screen.getByRole('button', { description: 'admin.ex.difficulty.easy' }), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'admin.ex.difficulty.hard' }))
    expect(screen.getByTestId('variant-difficulty')).toHaveTextContent('[["hard"],["hard"]]')
  })

  it('keeps the shared stage name in sync across variants', () => {
    render(<Harness tasks={[task('first')]} otherTasks={[task('alternate')]} />)
    fireEvent.change(screen.getByDisplayValue('first'), { target: { value: 'renamed stage' } })
    expect(screen.getByTestId('variant-tasks')).toHaveTextContent('[["renamed stage"],["renamed stage"]]')
  })

  it('marks required task fields and exposes explanations', () => {
    render(<Harness tasks={[task('first')]} />)
    expect(screen.getByText('admin.exTask.name').closest('label')).toHaveTextContent('*')
    // «?» only where the field needs explaining: the name does not.
    expect(screen.getByText('admin.exTask.name').closest('div')!.querySelector('button')).toBeNull()
    expect(screen.getByText('admin.exTask.difficulty').closest('label')).toHaveTextContent('*')
    expect(helpButton('admin.exTask.difficultyHelp')).toBeInTheDocument()
    expect(screen.getByText('admin.exTask.description').parentElement).toHaveTextContent('*')
    expect(helpButton('admin.exTask.descriptionHelp')).toBeInTheDocument()
  })

  it('disabled=true → add-task and remove-task controls are absent (read-only)', () => {
    render(<Harness tasks={[task('first'), task('second')]} disabled />)
    expect(screen.queryByText('admin.exTask.add')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'admin.exTask.remove' })).not.toBeInTheDocument()
  })

  it('edits only the selected stage while keeping the other stage in local navigation', () => {
    render(<Harness tasks={[task('first'), task('second')]} />)
    expect(screen.getByDisplayValue('first')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('second')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'second' }))
    expect(screen.getByDisplayValue('second')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('first')).not.toBeInTheDocument()
  })

})

function LinkedOrderHarness() {
  const stage = (id: string, flag: string): TaskFormValues => (formTask({ ID: id, Name: id, flag: [flag] }))
  const form = useForm<DraftFormValues>({
    defaultValues: {
      AdminNote: '',
      Variants: [
        { ...emptyVariant(1), ID: 'b', Tasks: [stage('t1', 'B1'), stage('t2', 'B2'), stage('t3', 'B3')] },
        { ...emptyVariant(2), ID: 'l', LinkedTo: 'b', Tasks: [stage('t1', 'L1'), stage('t2', 'L2'), stage('t3', 'L3')] },
        { ...emptyVariant(3), ID: 'c', Tasks: [stage('t1', 'C1'), stage('t2', 'C2'), stage('t3', 'C3')] },
      ],
    },
  })
  useLinkedVariantSync(form, true)
  const variants = useWatch({ control: form.control, name: 'Variants' })
  return <FormProvider {...form}>
    <TaskAccordion variantIndex={2} disabled={false} linked={false} />
    <output data-testid="linked-order">{JSON.stringify(variants.map((variant) => variant.Tasks.map((item) => `${item.ID}:${item.Check.Answer.Values.join(',')}`)))}</output>
  </FormProvider>
}

describe('TaskAccordion with a linked variant', () => {
  it('adding and removing from an independent variant keeps the linked variant in step with its base', async () => {
    render(<LinkedOrderHarness />)
    const read = () => JSON.parse(screen.getByTestId('linked-order').textContent ?? '[]') as string[][]
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTask.add' }))
    await waitFor(() => expect(read()[2]).toHaveLength(4))
    expect(read()[0]).toHaveLength(4)
    expect(read()[1]).toEqual(['t1:L1', 't2:L2', 't3:L3', ':'])

    fireEvent.click(screen.getAllByRole('button', { name: 'admin.exTask.remove' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTask.removeConfirm' }))
    await waitFor(() => expect(read()[2]).toHaveLength(3))
    expect(read()[0]).toEqual(['t2:B2', 't3:B3', ':'])
    expect(read()[1]).toEqual(['t2:L2', 't3:L3', ':'])
  })
})

describe('TaskAccordion on a phone', () => {
  it('shows the subtasks as one select with the count, picks another and adds one from it', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('max-width'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    try {
      render(<Harness tasks={[task('Recon'), task('Exploit')]} otherTasks={[task('Recon'), task('Exploit')]} />)
      expect(screen.queryByRole('navigation', { name: 'admin.exDraft.tasks.title' })).not.toBeInTheDocument()
      const picker = screen.getByRole('button', { name: 'admin.exTask.pick 1 Recon' })
      expect(picker).toHaveTextContent('admin.exTask.count.few 2')
      fireEvent.keyDown(picker, { key: 'ArrowDown' })
      fireEvent.click(await screen.findByRole('menuitemradio', { name: 'admin.exDraft.subtaskColumn 2 Exploit' }))
      expect(await screen.findByRole('button', { name: 'admin.exTask.pick 2 Exploit' })).toBeInTheDocument()
      fireEvent.keyDown(screen.getByRole('button', { name: 'admin.exTask.pick 2 Exploit' }), { key: 'ArrowDown' })
      fireEvent.click(await screen.findByRole('menuitem', { name: 'admin.exTask.add' }))
      await waitFor(() => expect(screen.getByTestId('variant-tasks')).toHaveTextContent('[["Recon","Exploit",""],["Recon","Exploit",""]]'))
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
