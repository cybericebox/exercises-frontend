/**
 * page.test.tsx — exercises catalog table and create link.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react'

// Mutable permission state for the create link.
const h = vi.hoisted(() => ({ canWrite: true, canExport: true, userId: 'editor-1', push: vi.fn() }))

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))
vi.mock('@/lib/useRole', () => ({
  useRole: () => ({
    me: { ID: h.userId },
    role: 'admin',
    isLoading: false,
    permissions: ['*'],
    can: (p: string) => (p === 'exercises.write' ? h.canWrite : p === 'exercises.export' ? h.canExport : true),
  }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }))
vi.mock('@/api/exercises/catalog', () => ({
  listExercisesPage: vi.fn(),
}))
vi.mock('@/api/exercises/archive', () => ({ EXPORT_LIMIT: 100 }))
vi.mock('@/components/exercises/ExportDialog', () => ({
  ExportDialog: ({ exerciseIds }: { exerciseIds: string[] }) => <div data-testid="export-dialog">{exerciseIds.join(',')}</div>,
}))
vi.mock('@/components/exercises/ImportDialog', () => ({ ImportDialog: () => <div data-testid="import-dialog" /> }))

import { listExercisesPage } from '@/api/exercises/catalog'
import Page from './page'

const mockList = vi.mocked(listExercisesPage)

function resetStorage() {
  const storage = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => { storage.clear() },
  } })
}

const item = {
  ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  Name: 'SQLi basics',
  Description: 'Intro to SQL injection',
  Tags: ['web', 'sql'],
  HasDraft: true,
  HasPublished: false,
  ArchivedAt: null,
  CreatedAt: '2026-01-01T00:00:00Z',
  UpdatedAt: '2026-01-02T00:00:00Z',
}

describe('exercises catalog page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStorage()
    mockList.mockReset()
    h.canWrite = true
    h.canExport = true
    mockList.mockResolvedValue({ Items: [item], Total: 1, Page: 1, PageSize: 50 })
  })

  it('renders a row with name, tags and draft status', async () => {
    render(<Page />)
    expect(await screen.findByText('SQLi basics')).toBeInTheDocument()
    expect(screen.getByText('web')).toBeInTheDocument()
    expect(screen.getByText('sql')).toBeInTheDocument()
    expect(screen.getByText('admin.ex.status.draft')).toBeInTheDocument()
    expect(screen.getByText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument()
    const link = screen.getByText('SQLi basics').closest('a')
    expect(link).toHaveAttribute('href', `/detail?id=${item.ID}`)
  })

  it('renders the empty state', async () => {
    mockList.mockResolvedValue({ Items: [], Total: 0, Page: 1, PageSize: 50 })
    render(<Page />)
    expect(await screen.findByText('admin.ex.empty')).toBeInTheDocument()
    expect(screen.getByText('admin.ex.empty').closest('[data-empty-state]')?.querySelector('svg')).toBeInTheDocument()
  })

  it('keeps column headings above rows within the scrolling table', async () => {
    const { container } = render(<Page />)
    await screen.findByText('SQLi basics')
    expect(container.querySelector('thead')).toHaveClass('sticky', 'top-0', 'z-10', 'bg-card')
  })

  it('debounces search and passes it to listExercises', async () => {
    render(<Page />)
    await screen.findByText('SQLi basics')
    expect(screen.getByPlaceholderText('admin.ex.search')).toHaveAttribute('type', 'search')
    fireEvent.change(screen.getByPlaceholderText('admin.ex.search'), { target: { value: 'sql' } })
    await waitFor(() => {
      const calls = mockList.mock.calls
      expect(calls[calls.length - 1][0]).toMatchObject({ search: 'sql', page: 1 })
    })
  })

  it('adds a tag filter chip and passes tags to listExercises', async () => {
    render(<Page />)
    await screen.findByText('SQLi basics')
    const tagBox = screen.getByPlaceholderText('admin.ex.filterTags.placeholder')
    fireEvent.change(tagBox, { target: { value: 'crypto' } })
    fireEvent.keyDown(tagBox, { key: 'Enter' })
    await waitFor(() => {
      const calls = mockList.mock.calls
      expect(calls[calls.length - 1][0]).toMatchObject({ tags: ['crypto'] })
    })
  })

  it('offers a retry after the first page fails', async () => {
    mockList.mockRejectedValueOnce(new Error('offline'))
    render(<Page />)
    expect(await screen.findByText('admin.ex.loadError')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'admin.ex.retry' }))
    expect(await screen.findByText('SQLi basics')).toBeInTheDocument()
  })

  it('keeps old rows while sorting and sorts through the API', async () => {
    let resolveSorted: ((page: { Items: typeof item[]; Total: number; Page: number; PageSize: number }) => void) | undefined
    mockList.mockImplementation((filter) => filter.sortBy === 'name'
      ? new Promise((resolve) => { resolveSorted = resolve })
      : Promise.resolve({ Items: [item], Total: 2, Page: 1, PageSize: 50 }))
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('button', { name: 'admin.ex.col.name' }))
    expect(screen.getByText('SQLi basics')).toBeInTheDocument()
    await waitFor(() => expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ sortBy: 'name', sortDir: 'asc' })))
    await act(async () => resolveSorted?.({ Items: [{ ...item, ID: 'sorted', Name: 'Crypto basics' }], Total: 2, Page: 1, PageSize: 50 }))
    expect(screen.getByText('Crypto basics')).toBeInTheDocument()
  })

  it('shows total, changes page size, and keeps pagination below rows', async () => {
    mockList.mockResolvedValue({ Items: [item], Total: 75, Page: 1, PageSize: 50 })
    render(<Page />)
    await screen.findByText('SQLi basics')
    expect(screen.getByText('admin.table.total: 75')).toBeInTheDocument()
    expect(screen.getByText('admin.table.page 1 admin.table.of 2')).toBeInTheDocument()
    const selector = screen.getByRole('button', { name: 'admin.table.perPage' })
    fireEvent.keyDown(selector, { key: 'ArrowDown' })
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '25' }))
    await waitFor(() => expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 25 })))
    expect(screen.queryByText('admin.ex.endOfList')).not.toBeInTheDocument()
  })

  it('keeps search, tag filter, status filter, and create action at the same minimum height', async () => {
    render(<Page />)
    await screen.findByText('SQLi basics')
    expect(screen.getByPlaceholderText('admin.ex.search')).toHaveClass('h-10')
    expect(screen.getByPlaceholderText('admin.ex.filterTags.placeholder').parentElement).toHaveClass('min-h-10')
    expect(screen.getByRole('button', { name: 'admin.ex.filterStatus' })).toHaveClass('h-10')
    expect(screen.getByRole('button', { name: 'admin.ex.create.button' })).toHaveClass('h-10')
  })

  it('ignores a stale next page after the tag filter changes', async () => {
    let resolveOldPage: ((page: { Items: typeof item[]; Total: number; Page: number; PageSize: number }) => void) | undefined
    const fresh = { ...item, ID: 'fresh', Name: 'Crypto basics', Tags: ['crypto'] }
    const stale = { ...item, ID: 'stale', Name: 'Old SQLi' }
    mockList.mockImplementation((filter) => {
      if (filter.page === 2) return new Promise((resolve) => { resolveOldPage = resolve })
      if (filter.tags?.includes('crypto')) return Promise.resolve({ Items: [fresh], Total: 1, Page: 1, PageSize: 50 })
      return Promise.resolve({ Items: [item], Total: 51, Page: 1, PageSize: 50 })
    })
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('button', { name: 'admin.table.next' }))
    await waitFor(() => expect(resolveOldPage).toBeDefined())
    const tagBox = screen.getByPlaceholderText('admin.ex.filterTags.placeholder')
    fireEvent.change(tagBox, { target: { value: 'crypto' } })
    fireEvent.keyDown(tagBox, { key: 'Enter' })
    expect(await screen.findByText('Crypto basics')).toBeInTheDocument()
    await act(async () => resolveOldPage?.({ Items: [stale], Total: 51, Page: 2, PageSize: 50 }))
    expect(screen.queryByText('Old SQLi')).not.toBeInTheDocument()
  })

  it('retries a failed next page without discarding the loaded rows', async () => {
    mockList.mockResolvedValueOnce({ Items: [item], Total: 51, Page: 1, PageSize: 50 })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ Items: [{ ...item, ID: 'second', Name: 'Crypto basics' }], Total: 51, Page: 2, PageSize: 50 })
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('button', { name: 'admin.table.next' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('admin.ex.loadError')
    expect(screen.getByText('SQLi basics')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'admin.ex.retry' }))
    expect(await screen.findByText('Crypto basics')).toBeInTheDocument()
  })
})

describe('exercises catalog — create link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStorage()
    mockList.mockReset()
    h.canWrite = true
    h.canExport = true
    mockList.mockResolvedValue({ Items: [item], Total: 1, Page: 1, PageSize: 50 })
  })

  it('hides the create action without exercises.write permission', async () => {
    h.canWrite = false
    render(<Page />)
    await screen.findByText('SQLi basics')
    expect(screen.queryByRole('button', { name: 'admin.ex.create.button' })).not.toBeInTheDocument()
  })

  it('opens the dedicated creation page when there is no browser draft', async () => {
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('button', { name: 'admin.ex.create.button' }))
    expect(h.push).toHaveBeenCalledWith('/new')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('exercises catalog — archive, export and import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStorage()
    mockList.mockReset()
    h.canWrite = true
    h.canExport = true
    mockList.mockResolvedValue({ Items: [item], Total: 1, Page: 1, PageSize: 50 })
  })

  it('filters archived exercises through archived=only and marks them', async () => {
    mockList.mockResolvedValue({ Items: [{ ...item, ArchivedAt: '2026-09-20T00:00:00Z' }], Total: 1, Page: 1, PageSize: 50 })
    render(<Page />)
    await screen.findByText('SQLi basics')
    expect(screen.getByText('admin.ex.status.archived')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('button', { name: 'admin.ex.filterStatus' }), { key: 'ArrowDown' })
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'admin.ex.filterStatusArchived' }))
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ archived: 'only', status: '' })))
  })

  it('selects rows and opens bulk export', async () => {
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('checkbox', { name: 'admin.ex.select.row: SQLi basics' }))
    expect(screen.getByText('admin.ex.selection.count')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'admin.ex.selection.export' }))
    expect(screen.getByTestId('export-dialog')).toHaveTextContent(item.ID)
    fireEvent.click(screen.getByRole('button', { name: 'admin.ex.selection.clear' }))
    expect(screen.queryByText('admin.ex.selection.count')).not.toBeInTheDocument()
  })

  it('caps the selection at 100 exercises', async () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ ...item, ID: `id-${i}`, Name: `Exercise ${i}` }))
    mockList.mockResolvedValue({ Items: many, Total: 101, Page: 1, PageSize: 101 })
    render(<Page />)
    await screen.findByText('Exercise 0')
    fireEvent.click(screen.getByRole('checkbox', { name: 'admin.ex.select.all' }))
    expect(screen.getByText('admin.ex.selection.limit')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'admin.ex.select.row: Exercise 99' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'admin.ex.select.row: Exercise 100' })).toBeDisabled()
  })

  it('hides selection without export and import without write', async () => {
    h.canExport = false
    h.canWrite = false
    render(<Page />)
    await screen.findByText('SQLi basics')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'admin.exImport.button' })).not.toBeInTheDocument()
  })

  it('opens the import dialog', async () => {
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('button', { name: 'admin.exImport.button' }))
    expect(screen.getByTestId('import-dialog')).toBeInTheDocument()
  })
})
