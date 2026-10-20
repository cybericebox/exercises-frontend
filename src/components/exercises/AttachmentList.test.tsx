/**
 * AttachmentList.test.tsx — upload appends a row, download link, size-limit error.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { useForm, FormProvider } from 'react-hook-form'

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))
vi.mock('@/api/exercises/files', () => ({
  uploadExerciseAttachment: vi.fn(),
  exerciseFileURL: (id: string) => `/api/exercises/files/${id}`,
}))
vi.mock('@/lib/exerciseErrors', () => ({
  exerciseErrorMessage: () => 'admin.ex.err.fileTooLarge',
}))

import { uploadExerciseAttachment } from '@/api/exercises/files'
import { ExerciseIdContext } from './ExerciseIdContext'
import { AttachmentList } from './AttachmentList'
import { emptyDraft, type DraftFormValues } from '@/lib/exerciseSchemas'

const mockUpload = vi.mocked(uploadExerciseAttachment)

function Harness({
  attachments = [] as { FileID: string; Name: string }[],
  disabled = false,
  exerciseId = null as string | null,
}) {
  const draft = emptyDraft()
  draft.Variants[0].Tasks[0].Attachments = attachments
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  return (
    <ExerciseIdContext.Provider value={exerciseId}>
      <FormProvider {...form}>
        <AttachmentList variantIndex={0} taskIndex={0} disabled={disabled} />
      </FormProvider>
    </ExerciseIdContext.Provider>
  )
}

describe('AttachmentList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps the upload action but does not reserve an empty-state panel before files exist', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'admin.exFiles.upload' })).toHaveTextContent('admin.exFiles.add')
    expect(screen.queryByText('admin.exFiles.empty')).not.toBeInTheDocument()
  })

  it('renders existing attachments as a filename download button', () => {
    render(<Harness attachments={[{ FileID: 'f1', Name: 'notes.pdf' }]} />)
    const button = screen.getByText('notes.pdf').closest('button')
    expect(button).not.toHaveAttribute('href')
    expect(screen.getByRole('button', { name: 'admin.exFiles.remove' })).toHaveClass('opacity-0')
  })

  it('uploads a picked file and appends a row', async () => {
    mockUpload.mockResolvedValue({ FileID: 'f2', Name: 'dump.bin', Size: 10 })
    render(<Harness />)
    const input = screen.getByTestId('attachment-file-input')
    const file = new File(['x'], 'dump.bin')
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(screen.getByText('dump.bin')).toBeInTheDocument())
    expect(mockUpload).toHaveBeenCalledWith(null, file, expect.any(Function))
  })

  it('shows a determinate upload bar and percent while sending', async () => {
    let complete!: (value: { FileID: string; Name: string; Size: number }) => void
    mockUpload.mockImplementation((_id, _file, onProgress) => {
      onProgress?.(42)
      return new Promise((resolve) => { complete = resolve })
    })
    render(<Harness />)
    fireEvent.change(screen.getByTestId('attachment-file-input'), { target: { files: [new File(['x'], 'partial.bin')] } })
    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
    expect(screen.getByText('42%')).toBeInTheDocument()
    complete({ FileID: 'f3', Name: 'partial.bin', Size: 1 })
    expect(await screen.findByText('partial.bin')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('shows the mapped error when upload fails', async () => {
    mockUpload.mockRejectedValue(new Error('413'))
    render(<Harness />)
    const input = screen.getByTestId('attachment-file-input')
    fireEvent.change(input, { target: { files: [new File(['x'], 'big.bin')] } })
    expect(await screen.findByText('admin.ex.err.fileTooLarge')).toBeInTheDocument()
  })

  it('removes an attachment row when its remove button is clicked', () => {
    render(<Harness attachments={[{ FileID: 'f1', Name: 'a.pdf' }]} />)
    // The row exists before removal.
    const row = screen.getByText('a.pdf').closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'admin.exFiles.remove' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'admin.exFiles.remove' }))
    // After removing, the row (and its name) is gone.
    expect(screen.queryByText('a.pdf')).not.toBeInTheDocument()
  })

  it('disabled read-only: hides upload/remove controls but keeps the download link', () => {
    render(<Harness attachments={[{ FileID: 'f1', Name: 'a.pdf' }]} disabled />)
    // No upload control and no per-row remove control in read-only mode.
    expect(screen.queryByTestId('attachment-file-input')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'admin.exFiles.remove' })).not.toBeInTheDocument()
    // The download link is still rendered so existing files stay reachable.
    expect(screen.getByText('a.pdf').closest('button')).toBeEnabled()
  })

  it('a known file is attached without an upload', async () => {
    mockUpload.mockResolvedValue({ FileID: 'known', Name: 'again.bin', Size: 10 })
    render(<Harness exerciseId="e1" />)
    const file = new File(['x'], 'again.bin')
    fireEvent.change(screen.getByTestId('attachment-file-input'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByText('again.bin')).toBeInTheDocument())
    expect(mockUpload).toHaveBeenCalledWith('e1', file, expect.any(Function))
  })

  it('other rows stay enabled while one uploads', async () => {
    mockUpload.mockImplementation(() => new Promise(() => undefined))
    render(<Harness attachments={[{ FileID: 'f1', Name: 'a.pdf' }]} />)
    fireEvent.change(screen.getByTestId('attachment-file-input'), { target: { files: [new File(['x'], 'slow.bin')] } })
    await screen.findByRole('progressbar')
    expect(screen.getByRole('button', { name: 'admin.exFiles.remove' })).toBeEnabled()
  })
})

it('asks before removing an attachment and preserves it on cancel', () => {
 render(<Harness attachments={[{ FileID: 'f1', Name: 'keep.pdf' }]} />)
 fireEvent.click(screen.getByRole('button', { name: 'admin.exFiles.remove' }))
 expect(screen.getByText('keep.pdf')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }))
 expect(screen.getByText('keep.pdf')).toBeInTheDocument()
})
it('downloads using the whole filename button, without exposing the route', async () => {
 render(<Harness attachments={[{ FileID: 'f1', Name: 'notes.pdf' }]} />)
 const download = screen.getByText('notes.pdf').closest('button')
 expect(download).not.toHaveAttribute('href')
 expect(screen.queryByRole('link')).not.toBeInTheDocument()
})
