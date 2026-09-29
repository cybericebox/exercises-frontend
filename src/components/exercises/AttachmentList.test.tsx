/**
 * AttachmentList.test.tsx — upload appends a row, download link, size-limit error.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { useForm, FormProvider } from 'react-hook-form'

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))
vi.mock('@/api/exercises/files', () => ({
  uploadExerciseFile: vi.fn(),
  exerciseFileURL: (id: string) => `/api/exercises/files/${id}`,
}))
vi.mock('@/lib/exerciseErrors', () => ({
  exerciseErrorMessage: () => 'admin.ex.err.fileTooLarge',
}))

import { uploadExerciseFile } from '@/api/exercises/files'
import { AttachmentList } from './AttachmentList'
import { emptyDraft, type DraftFormValues } from '@/lib/exerciseSchemas'

const mockUpload = vi.mocked(uploadExerciseFile)

function Harness({
  attachments = [] as { FileID: string; Name: string }[],
  disabled = false,
}) {
  const draft = emptyDraft()
  draft.Variants[0].Tasks[0].Attachments = attachments
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  return (
    <FormProvider {...form}>
      <AttachmentList variantIndex={0} taskIndex={0} disabled={disabled} />
    </FormProvider>
  )
}

describe('AttachmentList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps the upload action but does not reserve an empty-state panel before files exist', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'admin.exFiles.upload' })).toHaveTextContent('admin.exFiles.add')
    expect(screen.queryByText('admin.exFiles.empty')).not.toBeInTheDocument()
  })

  it('renders existing attachments with a download link', () => {
    render(<Harness attachments={[{ FileID: 'f1', Name: 'notes.pdf' }]} />)
    const link = screen.getByText('notes.pdf').closest('a')
    expect(link).toHaveAttribute('href', '/api/exercises/files/f1')
    expect(screen.getByRole('button', { name: 'admin.exFiles.remove' })).toHaveClass('opacity-0')
  })

  it('uploads a picked file and appends a row', async () => {
    mockUpload.mockResolvedValue({ FileID: 'f2', Name: 'dump.bin', Size: 10 })
    render(<Harness />)
    const input = screen.getByTestId('attachment-file-input')
    const file = new File(['x'], 'dump.bin')
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(screen.getByText('dump.bin')).toBeInTheDocument())
    expect(mockUpload).toHaveBeenCalledWith(file, expect.any(Function))
  })

  it('shows a determinate upload bar and percent while sending', async () => {
    let complete!: (value: { FileID: string; Name: string; Size: number }) => void
    mockUpload.mockImplementation((_file, onProgress) => {
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
    // After removing, the row (and its name) is gone.
    expect(screen.queryByText('a.pdf')).not.toBeInTheDocument()
  })

  it('disabled read-only: hides upload/remove controls but keeps the download link', () => {
    render(<Harness attachments={[{ FileID: 'f1', Name: 'a.pdf' }]} disabled />)
    // No upload control and no per-row remove control in read-only mode.
    expect(screen.queryByTestId('attachment-file-input')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'admin.exFiles.remove' })).not.toBeInTheDocument()
    // The download link is still rendered so existing files stay reachable.
    expect(screen.getByText('a.pdf').closest('a')).toHaveAttribute('href', '/api/exercises/files/f1')
  })
})
