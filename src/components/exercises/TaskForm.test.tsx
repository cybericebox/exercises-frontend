import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { createEditor, $createParagraphNode, $getRoot } from 'lexical'
import { $createVariableNode, VariableNode } from '@/components/editor/RichTextEditor'
import { TaskForm } from './TaskForm'
import { draftSchema, emptyDevice, emptyDraft, type DraftFormValues } from '@/lib/exerciseSchemas'

vi.mock('@/api/exercises/flagPolicy', () => ({ getFlagPolicy: vi.fn().mockResolvedValue({ RandomHexLength: 40, RandomBits: 160, WarningBits: 20 }) }))

function Harness({ initial }: { initial?: DraftFormValues }) {
  const [draft] = useState(() => {
    const value = initial ? structuredClone(initial) : emptyDraft()
    value.Variants[0].Topology.VPN.Enabled = true
    return value
  })
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  const placeholders = useWatch({ control: form.control, name: 'Variants.0.Tasks.0.Placeholders' }) ?? []
  const description = useWatch({ control: form.control, name: 'Variants.0.Tasks.0.Description' })
  return <FormProvider {...form}>
    <TaskForm variantIndex={0} taskIndex={0} disabled={false} />
    <output data-testid="saved-placeholders">{JSON.stringify(placeholders)}</output>
    <output data-testid="saved-description">{JSON.stringify(description)}</output>
  </FormProvider>
}

function ConflictHarness() {
  const draft = emptyDraft()
  const device = emptyDevice()
  device.EnvVars = [{ Name: 'FLAG', Value: 'manual', Secret: false, HasValue: false }]
  draft.Variants[0].Topology.Devices = [device]
  draft.Variants[0].Tasks[0].LinkedDeviceID = device.ID
  draft.Variants[0].Tasks[0].DeviceFlagVar = 'FLAG'
  const form = useForm<DraftFormValues>({ defaultValues: draft, resolver: zodResolver(draftSchema) })
  return <FormProvider {...form}>
    <form noValidate onSubmit={form.handleSubmit(() => {})}>
      <TaskForm variantIndex={0} taskIndex={0} disabled={false} />
      <button type="submit">Validate</button>
    </form>
  </FormProvider>
}

describe('TaskForm inline placeholders', () => {
  it('shows the flag target collision beside the environment variable field', async () => {
    render(<ConflictHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))
    expect(await screen.findByText('Ця змінна вже зайнята звичайною змінною оточення або прапором іншого підзавдання.')).toBeInTheDocument()
  })
  it('marks an unavailable linked device in red inside and outside its dropdown', () => {
    const initial = emptyDraft()
    initial.Variants[0].Tasks[0].LinkedDeviceID = 'removed-device'
    render(<Harness initial={initial} />)
    const trigger = screen.getByRole('button', { description: 'джерело недоступне' })
    expect(trigger.querySelector('span')).toHaveClass('text-destructive')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitemradio', { name: 'джерело недоступне' })).toHaveClass('text-destructive')
  })
  it('marks the participant description as required and keeps the editor near the title fields', () => {
    render(<Harness />)
    expect(screen.getByText('Опис').parentElement).toHaveTextContent('*')
    expect(screen.getByText('Опис').parentElement).toHaveTextContent('Обовʼязкове поле')
    expect(screen.getByTestId('task-drop-zone')).toHaveClass('space-y-3')
  })
  it('places attachments immediately after the description and flag settings last', () => {
    const initial = emptyDraft()
    initial.Variants[0].Topology.Devices = [{ ...emptyDevice(), Name: 'web' }]
    render(<Harness initial={initial} />)
    const attachments = screen.getByText('Вкладення')
    const flag = screen.getByText('Прапор')
    const delivery = screen.getByRole('heading', { name: 'Передача прапора до лабораторії' })
    expect(attachments.compareDocumentPosition(flag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(flag.compareDocumentPosition(delivery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('creates the definition and inline token in one insert action without a bottom configuration list', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Вставити підстановку' }))
    expect(screen.getByRole('dialog', { name: 'Вставити підстановку' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Підмережа VPN/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Вставити' }))
    await waitFor(() => {
      expect(screen.getByTestId('saved-placeholders').textContent).toContain('"Kind":"vpn.subnet"')
      expect(screen.getByTestId('saved-description').textContent).toContain('"type":"variable"')
    })
    expect(screen.queryByRole('button', { name: 'Додати підстановку' })).not.toBeInTheDocument()
  })

  it('inserts a token without a duplicate formatting menu', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Вставити підстановку' }))
    fireEvent.click(screen.getByRole('button', { name: /^Підмережа VPN/ }))
    expect(screen.queryByRole('button', { name: 'Курсив' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Вставити' }))
    await waitFor(() => expect(screen.getByTestId('saved-description').textContent).toContain('"type":"variable"'))
  })

  it('opens an existing inline token for editing and updates its preview', async () => {
    const initial = emptyDraft()
    initial.Variants[0].Tasks[0].Placeholders = [{ Key: 'ph_subnet', Kind: 'vpn.subnet', IPReference: '', Octets1to3: '', LastOctet: 0, ShowMask: false, DeviceName: '' }]
    const editor = createEditor({ nodes: [VariableNode] })
    editor.update(() => {
      const paragraph = $createParagraphNode()
      paragraph.append($createVariableNode('ph_subnet'))
      $getRoot().append(paragraph)
    }, { discrete: true })
    initial.Variants[0].Tasks[0].Description = editor.getEditorState().toJSON() as unknown as Record<string, unknown>
    render(<Harness initial={initial} />)
    fireEvent.click(await screen.findByRole('button', { name: /Редагувати підстановку: 10\.0\.0\.0\/24/ })) // a subnet previews as a CIDR even without ShowMask
    expect(screen.getByRole('dialog', { name: 'Редагувати підстановку' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Показувати маску' }))
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }))
    await waitFor(() => expect(screen.getByTestId('saved-placeholders').textContent).toContain('"ShowMask":true'))
    expect(await screen.findByRole('button', { name: /10\.0\.0\.0\/24/ })).toBeInTheDocument()
  })

  it('shows a universal device label and name for a disabled external-link source, without a technical key', async () => {
    const initial = emptyDraft()
    const device = { ...emptyDevice(), Name: 'web-01', Type: 'container' as const }
    initial.Variants[0].Topology.Devices = [device]
    initial.Variants[0].Tasks[0].Placeholders = [{ Key: 'ph_external', Kind: 'external.link', IPReference: '', Octets1to3: '', LastOctet: 0, ShowMask: false, DeviceName: 'web-01' }]
    const editor = createEditor({ nodes: [VariableNode] })
    editor.update(() => {
      const paragraph = $createParagraphNode()
      paragraph.append($createVariableNode('ph_external'))
      $getRoot().append(paragraph)
    }, { discrete: true })
    initial.Variants[0].Tasks[0].Description = editor.getEditorState().toJSON() as unknown as Record<string, unknown>
    render(<Harness initial={initial} />)
    expect(await screen.findByText('Пристрій «web-01» — джерело недоступне')).toBeInTheDocument()
    expect(within(screen.getByTestId('task-drop-zone')).queryByText(/ph_external/)).not.toBeInTheDocument()
  })

  it('uses a realistic example domain for an available external link', async () => {
    const initial = emptyDraft()
    const device = { ...emptyDevice(), Name: 'web-01', External: { Enabled: true, Port: 80, Protocol: 'http' as const } }
    initial.Variants[0].Topology.Devices = [device]
    initial.Variants[0].Tasks[0].Placeholders = [{ Key: 'ph_external', Kind: 'external.link', IPReference: '', Octets1to3: '', LastOctet: 0, ShowMask: false, DeviceName: 'web-01' }]
    const editor = createEditor({ nodes: [VariableNode] })
    editor.update(() => {
      const paragraph = $createParagraphNode()
      paragraph.append($createVariableNode('ph_external'))
      $getRoot().append(paragraph)
    }, { discrete: true })
    initial.Variants[0].Tasks[0].Description = editor.getEditorState().toJSON() as unknown as Record<string, unknown>
    render(<Harness initial={initial} />)
    expect(await screen.findByText('https://web-01-k3x.labs.example.com')).toBeInTheDocument()
  })
})
