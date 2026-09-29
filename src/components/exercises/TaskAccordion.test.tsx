/**
 * TaskAccordion.test.tsx — variant tasks accordion: add/remove with the ≥1 guard.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { useForm, useWatch, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))

// Stub the heavy Lexical editor: TaskForm (rendered by an open row) imports it, and
// jsdom does not need the real rich-text stack for these behavior tests.
vi.mock('@/components/editor/RichTextEditor', () => ({
  default: () => <div data-testid="rich-text-editor" />,
}))
vi.mock('@/api/exercises/files', () => ({
  uploadExerciseFile: vi.fn(),
  exerciseFileURL: (id: string) => `/api/exercises/files/${id}`,
}))
vi.mock('@/api/exercises/flagPolicy', () => ({
  getFlagPolicy: vi.fn(() => new Promise(() => {})),
}))

import { TaskAccordion } from './TaskAccordion'
import { draftSchema, emptyDevice, emptyDraft, emptyTask, emptyVariant, type DraftFormValues, type TaskFormValues } from '@/lib/exerciseSchemas'
import { uploadExerciseFile } from '@/api/exercises/files'
import { getFlagPolicy } from '@/api/exercises/flagPolicy'

function Harness({ tasks, otherTasks, disabled = false }: { tasks: TaskFormValues[]; otherTasks?: TaskFormValues[]; disabled?: boolean }) {
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
      <TaskAccordion variantIndex={0} disabled={disabled} />
      <output data-testid="variant-tasks">{JSON.stringify(variants.map((variant) => variant.Tasks.map((item) => item.Name)))}</output>
      <output data-testid="variant-difficulty">{JSON.stringify(variants.map((variant) => variant.Tasks.map((item) => item.Difficulty)))}</output>
      <output data-testid="variant-files">{JSON.stringify(variants.map((variant) => variant.Tasks.map((item) => item.Attachments)))}</output>
    </FormProvider>
  )
}

function task(name: string): TaskFormValues {
  return { ...emptyTask(), Name: name }
}

function InvalidFlagLinkHarness() {
  const draft = emptyDraft()
  draft.Variants[0].Tasks[0].Name = 'Find the flag'
  const device = emptyDevice()
  device.Name = 'web'
  draft.Variants[0].Topology.Devices.push(device)
  draft.Variants[0].Tasks[0].LinkedDeviceID = device.ID
  const form = useForm<DraftFormValues>({ defaultValues: draft, resolver: zodResolver(draftSchema) })
  return <FormProvider {...form}>
    <TaskAccordion variantIndex={0} disabled={false} />
    <button type="button" onClick={() => { void form.trigger() }}>Validate draft</button>
  </FormProvider>
}

function NamedDeviceHarness() {
  const draft = emptyDraft()
  draft.Variants[0].Tasks[0].Name = 'Find the flag'
  const device = emptyDevice()
  device.ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  device.Name = 'web-01'
  draft.Variants[0].Topology.Devices.push(device)
  draft.Variants[0].Tasks[0].LinkedDeviceID = device.ID
  draft.Variants[0].Tasks[0].DeviceFlagVar = 'FLAG'
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  return <FormProvider {...form}><TaskAccordion variantIndex={0} disabled={false} /></FormProvider>
}

describe('TaskAccordion', () => {
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
    expect(screen.getByText('admin.exTask.untitled 2')).toBeInTheDocument()
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

  it('shows a missing linked-device error without erasing entered flags', () => {
    const linked = task('linked')
    linked.LinkedDeviceID = 'removed-container-id'
    linked.Flag = ['ICE{retained}']
    render(<Harness tasks={[linked]} />)
    expect(screen.getByText('admin.ex.val.linkedDeviceUnavailable')).toBeInTheDocument()
    const fields = screen.getByTestId('flag-delivery-fields')
    expect(fields).toHaveClass('items-start')
    expect(screen.getByText('admin.ex.val.linkedDeviceUnavailable').closest('[data-testid="flag-device-field"]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'admin.exPh.missing' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /admin.exTask.deviceFlagVar/ })).toBeInTheDocument()
    expect(screen.getByDisplayValue('ICE{retained}')).toBeInTheDocument()
  })

  it('identifies a linked container by both name and full ID', () => {
    render(<NamedDeviceHarness />)
    expect(screen.getByRole('button', { name: 'web-01 (aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee)' })).toBeInTheDocument()
  })

  it('does not invent a generation policy while unavailable and allows retry', async () => {
    vi.mocked(getFlagPolicy).mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ RandomHexLength: 12, RandomBits: 48, WarningBits: 18 })
    render(<NamedDeviceHarness />)
    expect(await screen.findByText('admin.exTask.flag.policyUnavailable')).toBeInTheDocument()
    expect(screen.queryByText('admin.exTask.flag.randomExample')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'admin.exTask.flag.policyRetry' }))
    expect(await screen.findByText(/ICE\{0{12}\}/)).toBeInTheDocument()
  })

  it('drops a file onto the selected stage rather than its neighbor', async () => {
    vi.mocked(uploadExerciseFile).mockResolvedValueOnce({ FileID: 'file-2', Name: 'image.png', Size: 1 })
    render(<Harness tasks={[task('first'), task('second')]} />)
    fireEvent.click(screen.getByRole('button', { name: 'second' }))
    const file = new File(['x'], 'image.png', { type: 'image/png' })
    const dropZone = screen.getByTestId('task-drop-zone')
    fireEvent.dragEnter(dropZone, { dataTransfer: { files: [file], types: ['Files'] } })
    fireEvent.drop(dropZone, { dataTransfer: { files: [file], types: ['Files'] } })
    await waitFor(() => expect(screen.getByTestId('variant-files')).toHaveTextContent('[[[],[{"FileID":"file-2","Name":"image.png"}]]]'))
    expect(screen.queryByRole('img', { name: 'image.png' })).not.toBeInTheDocument()
  })

  it('changing task difficulty updates the matching stage in every variant', () => {
    render(<Harness tasks={[task('first')]} otherTasks={[task('alternate')]} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'admin.ex.difficulty.easy' }), { key: 'ArrowDown' })
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
    expect(screen.getByRole('button', { name: 'admin.exTask.nameHelp' })).toBeInTheDocument()
    expect(screen.getByText('admin.exTask.difficulty').closest('label')).toHaveTextContent('*')
    expect(screen.getByRole('button', { name: 'admin.exTask.difficultyHelp' })).toBeInTheDocument()
    expect(screen.getByText('admin.exTask.description').parentElement).toHaveTextContent('*')
    expect(screen.getByRole('button', { name: 'admin.exTask.descriptionHelp' })).toBeInTheDocument()
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

  it('shows the flag-variable validation error beside the linked device fields', async () => {
    render(<InvalidFlagLinkHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }))
    expect(await screen.findByText('admin.ex.val.deviceFlagVarRequired')).toBeInTheDocument()
  })
})
