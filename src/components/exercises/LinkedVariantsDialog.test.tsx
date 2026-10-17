import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('@/i18n/t', () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key}${JSON.stringify(vars)}` : key }))
const upload = vi.fn()
vi.mock('@/api/exercises/files', () => ({
  uploadExerciseAttachment: (...args: unknown[]) => upload(...args),
  exerciseFileURL: (id: string) => `/files/${id}`,
}))

import { LinkedVariantsDialog } from './LinkedVariantsDialog'
import { ExerciseIdContext } from './ExerciseIdContext'
import { emptyTask, emptyVariant, type VariantFormValues } from '@/lib/exerciseSchemas'

function task(id: string, name: string, flag: string[]) {
  return { ...emptyTask(), ID: id, Name: name, Description: { text: `${name} text` }, Flag: flag }
}

function base(): VariantFormValues {
  return { ...emptyVariant(1), ID: 'b', Note: 'base note', Tasks: [task('t1', 'Scan', ['ICE{base1}']), task('t2', 'Exploit', ['ICE{base2}'])] }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function setup(variants: VariantFormValues[] = [base()]) {
  const onCreate = vi.fn()
  const onClose = vi.fn()
  render(<ExerciseIdContext.Provider value="ex1">
    <LinkedVariantsDialog open variants={variants} onClose={onClose} onCreate={onCreate} />
  </ExerciseIdContext.Provider>)
  return { onCreate, onClose }
}

const variantName = (n: number) => `admin.exDraft.variantN{"n":${n}}`
const flagInput = (n: number, subtask: string) => screen.getByRole('textbox', { name: `${variantName(n)} ${subtask} admin.exLinked.flag` })
const noteInput = (n: number) => screen.getByRole('textbox', { name: `${variantName(n)} admin.exLinked.note` })
const addFile = (n: number, subtask: string) => screen.getByRole('button', { name: `admin.exLinked.addFile ${variantName(n)} ${subtask}` })
const countInput = () => screen.getByRole('spinbutton', { name: 'admin.exLinked.count' })
// A busy button also announces the loader, so the name is matched by its end.
const createButton = () => screen.getByRole('button', { name: /admin\.exLinked\.create$/ })

function type(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } })
}

function pickFile(n: number, subtask: string, file: File) {
  const input = document.getElementById(addFile(n, subtask).getAttribute('aria-controls') as string) as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
}

beforeEach(() => upload.mockReset())

describe('LinkedVariantsDialog', () => {
  it('creates N linked variants with their flags, files and notes', async () => {
    const { onCreate, onClose } = setup()
    type(countInput(), '3')
    expect(screen.getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual([variantName(2), variantName(3), variantName(4)])
    expect(screen.getByRole('columnheader', { name: 'Scan' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Exploit' })).toBeInTheDocument()
    type(flagInput(2, 'Scan'), 'ICE{a1}')
    type(flagInput(2, 'Exploit'), 'ICE{a2}')
    type(flagInput(3, 'Scan'), 'ICE{b1}')
    type(flagInput(4, 'Exploit'), 'ICE{c2}')
    type(noteInput(3), 'second note')
    upload.mockResolvedValue({ FileID: 'f1', Name: 'dump.pcap', Size: 4 })
    await act(async () => pickFile(3, 'Exploit', new File(['abcd'], 'dump.pcap')))
    expect(upload).toHaveBeenCalledWith('ex1', expect.any(File), expect.any(Function), expect.any(AbortSignal))
    expect(screen.getByRole('link', { name: 'dump.pcap' })).toBeInTheDocument()
    fireEvent.click(createButton())
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    const created = onCreate.mock.calls[0][0] as VariantFormValues[]
    expect(created.map((variant) => ({ ID: variant.ID, Index: variant.Index, LinkedTo: variant.LinkedTo, Note: variant.Note }))).toEqual([
      { ID: '', Index: 2, LinkedTo: 'b', Note: '' },
      { ID: '', Index: 3, LinkedTo: 'b', Note: 'second note' },
      { ID: '', Index: 4, LinkedTo: 'b', Note: '' },
    ])
    expect(created.map((variant) => variant.Tasks.map((t) => t.Name))).toEqual([['Scan', 'Exploit'], ['Scan', 'Exploit'], ['Scan', 'Exploit']])
    expect(created.map((variant) => variant.Tasks.map((t) => t.Flag))).toEqual([
      [['ICE{a1}'], ['ICE{a2}']],
      [['ICE{b1}'], []],
      [[], ['ICE{c2}']],
    ])
    expect(created[1].Tasks[1].Attachments).toEqual([{ FileID: 'f1', Name: 'dump.pcap' }])
    expect(created[0].Tasks[1].Attachments).toEqual([])
    expect(created[1].Tasks[0].Description).toEqual({ text: 'Scan text' })
  })

  it('offers only saved unlinked variants as the base', () => {
    setup([
      base(),
      { ...emptyVariant(2), ID: '', Tasks: [task('t1', 'Scan', [])] },
      { ...emptyVariant(3), ID: 'l', LinkedTo: 'b', Tasks: [task('t1', 'Scan', [])] },
      { ...emptyVariant(4), ID: 'c', Tasks: [task('t1', 'Other', [])] },
    ])
    const select = screen.getByRole('button', { name: 'admin.exLinked.base' })
    expect(select).toHaveAccessibleDescription(variantName(1))
    // New variants are numbered after every existing one.
    expect(screen.getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual([variantName(5)])
    fireEvent.keyDown(select, { key: 'ArrowDown' })
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([variantName(1), variantName(4)])
  })

  it('keeps entered cells for the columns that remain when the base changes', () => {
    const { onCreate } = setup([base(), { ...emptyVariant(2), ID: 'c', Tasks: [task('x1', 'Other', ['ICE{other}'])] }])
    type(flagInput(3, 'Scan'), 'ICE{kept}')
    type(flagInput(3, 'Exploit'), 'ICE{dropped}')
    fireEvent.keyDown(screen.getByRole('button', { name: 'admin.exLinked.base' }), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: variantName(2) }))
    expect(screen.queryByRole('columnheader', { name: 'Exploit' })).not.toBeInTheDocument()
    expect(flagInput(3, 'Other')).toHaveValue('ICE{kept}')
    fireEvent.click(createButton())
    const created = onCreate.mock.calls[0][0] as VariantFormValues[]
    expect(created).toHaveLength(1)
    expect(created[0].LinkedTo).toBe('c')
    expect(created[0].Tasks.map((t) => ({ Name: t.Name, Flag: t.Flag }))).toEqual([{ Name: 'Other', Flag: ['ICE{kept}'] }])
  })

  it('rejects a duplicate flag within a subtask', () => {
    const { onCreate } = setup([base(), { ...emptyVariant(2), ID: 'l', LinkedTo: 'b', Tasks: [task('t1', 'Scan', ['ICE{own1}']), task('t2', 'Exploit', [])] }])
    type(countInput(), '2')
    type(flagInput(3, 'Scan'), 'ICE{same}')
    type(flagInput(3, 'Exploit'), 'ICE{x}')
    type(flagInput(4, 'Scan'), 'ICE{same}')
    // The same value in another subtask is fine.
    type(flagInput(4, 'Exploit'), 'ICE{same}')
    fireEvent.click(createButton())
    expect(onCreate).not.toHaveBeenCalled()
    expect(flagInput(4, 'Scan')).toHaveAttribute('aria-invalid', 'true')
    expect(flagInput(4, 'Scan')).toHaveAccessibleDescription('admin.exLinked.val.flagDuplicate')
    expect(flagInput(3, 'Scan')).not.toHaveAttribute('aria-invalid', 'true')
    expect(flagInput(4, 'Exploit')).not.toHaveAttribute('aria-invalid', 'true')

    // Equal to the base's flag.
    type(flagInput(4, 'Scan'), 'ICE{base1}')
    fireEvent.click(createButton())
    expect(onCreate).not.toHaveBeenCalled()
    expect(flagInput(4, 'Scan')).toHaveAccessibleDescription('admin.exLinked.val.flagDuplicate')

    // Equal to an existing linked variant's flag.
    type(flagInput(4, 'Scan'), 'ICE{own1}')
    fireEvent.click(createButton())
    expect(onCreate).not.toHaveBeenCalled()
    expect(flagInput(4, 'Scan')).toHaveAccessibleDescription('admin.exLinked.val.flagDuplicate')

    // A malformed flag fails the flag format check.
    type(flagInput(4, 'Scan'), 'not a flag')
    fireEvent.click(createButton())
    expect(onCreate).not.toHaveBeenCalled()
    expect(flagInput(4, 'Scan')).toHaveAccessibleDescription('admin.ex.val.flagFormat')

    type(flagInput(4, 'Scan'), 'ICE{fresh}')
    fireEvent.click(createButton())
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('rejects a count outside 1..50', () => {
    const { onCreate } = setup()
    for (const value of ['0', '51', '']) {
      type(countInput(), value)
      fireEvent.click(createButton())
      expect(onCreate).not.toHaveBeenCalled()
      expect(countInput()).toHaveAttribute('aria-invalid', 'true')
      expect(countInput()).toHaveAccessibleDescription('admin.exLinked.val.count{"max":50}')
    }
    type(countInput(), '50')
    expect(screen.getAllByRole('rowheader')).toHaveLength(50)
    fireEvent.click(createButton())
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect((onCreate.mock.calls[0][0] as VariantFormValues[]).map((variant) => variant.Index)).toEqual(Array.from({ length: 50 }, (_, i) => i + 2))
  })

  it('only the create button is busy while a file uploads', async () => {
    const { onCreate } = setup()
    type(countInput(), '2')
    const pending = deferred<{ FileID: string; Name: string; Size: number }>()
    upload.mockReturnValueOnce(pending.promise)
    await act(async () => pickFile(2, 'Scan', new File(['x'], 'a.bin')))
    expect(createButton()).toHaveAttribute('aria-busy', 'true')
    expect(createButton()).toBeDisabled()
    for (const control of [addFile(2, 'Scan'), addFile(2, 'Exploit'), addFile(3, 'Scan'), flagInput(2, 'Scan'), flagInput(3, 'Exploit'), noteInput(2), countInput(),
      screen.getByRole('button', { name: 'admin.exLinked.base' }), screen.getByRole('button', { name: 'confirm.cancel' })]) {
      expect(control).toBeEnabled()
      expect(control).not.toHaveAttribute('aria-busy')
    }
    // Typing elsewhere while the upload runs is kept.
    type(flagInput(3, 'Exploit'), 'ICE{during}')
    fireEvent.click(createButton())
    expect(onCreate).not.toHaveBeenCalled()

    const failing = deferred<never>()
    upload.mockReturnValueOnce(failing.promise)
    await act(async () => pickFile(3, 'Scan', new File(['y'], 'b.bin')))
    await act(async () => { failing.reject(new Error('boom')) })
    const errorCell = screen.getByRole('alert')
    expect(errorCell).toHaveTextContent(/.+/)
    expect(createButton()).toHaveAttribute('aria-busy', 'true')

    await act(async () => { pending.resolve({ FileID: 'f1', Name: 'a.bin', Size: 1 }) })
    expect(createButton()).not.toHaveAttribute('aria-busy')
    expect(createButton()).toBeEnabled()
    fireEvent.click(createButton())
    const created = onCreate.mock.calls[0][0] as VariantFormValues[]
    expect(created[0].Tasks[0].Attachments).toEqual([{ FileID: 'f1', Name: 'a.bin' }])
    expect(created[1].Tasks[0].Attachments).toEqual([])
    expect(created[1].Tasks[1].Flag).toEqual(['ICE{during}'])
  })

  it('keeps entered cells when the count is lowered and raised again within the remaining rows', () => {
    setup()
    type(countInput(), '3')
    type(flagInput(2, 'Scan'), 'ICE{one}')
    type(noteInput(3), 'two')
    type(flagInput(4, 'Exploit'), 'ICE{three}')
    type(countInput(), '2')
    expect(screen.getAllByRole('rowheader')).toHaveLength(2)
    type(countInput(), '3')
    expect(flagInput(2, 'Scan')).toHaveValue('ICE{one}')
    expect(noteInput(3)).toHaveValue('two')
    // A row that was dropped comes back empty.
    expect(flagInput(4, 'Exploit')).toHaveValue('')
  })

  it('removes an uploaded file from its cell', async () => {
    const { onCreate } = setup()
    upload.mockResolvedValue({ FileID: 'f1', Name: 'a.bin', Size: 1 })
    await act(async () => pickFile(2, 'Scan', new File(['x'], 'a.bin')))
    const cell = screen.getByRole('link', { name: 'a.bin' }).closest('td') as HTMLElement
    fireEvent.click(within(cell).getByRole('button', { name: 'admin.exLinked.removeFile{"name":"a.bin"}' }))
    expect(screen.queryByRole('link', { name: 'a.bin' })).not.toBeInTheDocument()
    fireEvent.click(createButton())
    expect((onCreate.mock.calls[0][0] as VariantFormValues[])[0].Tasks[0].Attachments).toEqual([])
  })

  it('cancel closes without creating', () => {
    const { onCreate, onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onCreate).not.toHaveBeenCalled()
  })
})
