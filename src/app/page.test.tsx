/**
 * page.test.tsx — exercises catalog table and create link.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { ApiError } from '@/api/client'

// Mutable permission state for the create link.
const h = vi.hoisted(() => ({ canWrite: true, canExport: true, userId: 'editor-1', push: vi.fn(), access: null as unknown }))

vi.mock('@/i18n/t', () => ({ t: (key: string, vars?: { name?: string }) => key === 'admin.ex.select.rowNamed' ? `${key}: ${vars?.name}` : key === 'exercises.badge.forkOf' ? `${key}: ${vars?.name}` : key }))
vi.mock("@/i18n/tRich", () => import("@/test/tRichMock"))
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
  listExerciseTags: vi.fn(),
  listExerciseAuthors: vi.fn(),
  getExercise: vi.fn(),
  getCatalogColumns: vi.fn(),
  saveCatalogColumns: vi.fn(),
}))
vi.mock('@/api/exercises/archive', () => ({ EXPORT_LIMIT: 100 }))
vi.mock('@/api/events/list', () => ({ listEventOptions: vi.fn().mockResolvedValue([]) }))
vi.mock('@/components/shell/AccessContext', () => ({ useExerciseAccess: () => ({ access: h.access, loading: false }) }))
vi.mock('@/components/exercises/ExportDialog', () => ({
  ExportDialog: ({ exerciseIds }: { exerciseIds: string[] }) => <div data-testid="export-dialog">{exerciseIds.join(',')}</div>,
}))
vi.mock('@/components/exercises/ImportDialog', () => ({
  ImportDialog: ({ jobId, targets, initialTarget }: { jobId?: string; targets?: { value: string }[]; initialTarget?: string | null }) =>
    <div data-testid="import-dialog" data-targets={(targets ?? []).map((target) => target.value || 'catalog').join(',')} data-initial={initialTarget ?? ''}>{jobId ?? ''}</div>,
}))
vi.mock('@/api/exercises/archiveJobs', () => ({ getImportJob: vi.fn(), listRunningImports: vi.fn().mockResolvedValue([]), JOB_POLL_MS: 5, isPassing: () => false }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import { getCatalogColumns, getExercise, listExerciseAuthors, listExercisesPage, listExerciseTags, saveCatalogColumns } from '@/api/exercises/catalog'
import { getImportJob, listRunningImports } from '@/api/exercises/archiveJobs'
import { IMPORT_JOBS_KEY, resetImportJobsForTests } from '@/lib/importJobs'
import Page from './page'
import { LIST_EXTRAS, OWNERSHIP } from '@/test/exerciseFixtures'

const mockList = vi.mocked(listExercisesPage)
const mockTags = vi.mocked(listExerciseTags)
const mockAuthors = vi.mocked(listExerciseAuthors)
const mockCard = vi.mocked(getExercise)
afterEach(() => vi.unstubAllGlobals())

function resetStorage() {
  window.history.replaceState(null, '', '/')
  mockTags.mockResolvedValue([{ Tag: 'crypto', Count: 3 }])
  mockAuthors.mockResolvedValue([{ ID: 'u1', Name: 'Ада Лавлейс', Count: 2 }])
  vi.mocked(getCatalogColumns).mockReset().mockResolvedValue(null)
  vi.mocked(saveCatalogColumns).mockReset().mockResolvedValue(undefined)
  const storage = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => { storage.clear() },
  } })
}

const item = {
  ...OWNERSHIP,
  ...LIST_EXTRAS,
  ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  Name: 'SQLi basics',
  Description: 'Intro to SQL injection',
  Tags: ['web', 'sql'],
  HasDraft: true,
  HasPublished: false,
  Status: null,
  ArchivedAt: null,
  CreatedAt: '2026-01-01T00:00:00Z',
  UpdatedAt: '2026-01-02T00:00:00Z',
}


/** The header labels in order ('' for the selection box). */
const headers = () => screen.getAllByRole('columnheader').map((node) => node.textContent ?? '')

/** Opens a toolbar filter chip by its label (the chip names its value after the label once set). */
const toolbar = () => within(document.querySelector<HTMLElement>('.catalog-toolbar')!)

async function openChip(label: string) {
  fireEvent.click(toolbar().getByRole('button', { name: new RegExp(`^${label.replace(/\./g, '\\.')}`) }))
  return screen.findByRole('dialog')
}

/** Adds a filter through «+ Фільтр» and returns its popover. */
async function addFilter(label: string) {
  fireEvent.click(screen.getByRole('button', { name: 'exercises.filter.add' }))
  fireEvent.click(await screen.findByRole('button', { name: label }))
  return waitFor(() => {
    const dialogs = screen.getAllByRole('dialog')
    expect(dialogs).toHaveLength(1)
    return dialogs[0]
  })
}

function phone() {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('max-width'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
}

describe('catalog columns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStorage()
    h.access = null
    h.canWrite = true
    h.canExport = true
    mockList.mockReset().mockResolvedValue({ Items: [item], Total: 1, Page: 1, PageSize: 50 })
  })

  it('shows the default columns and lets the user hide, show and reorder them, kept for the next visit', async () => {
    const { unmount } = render(<Page />)
    await screen.findByText('SQLi basics')
    expect(headers()).toEqual(['', 'admin.ex.col.name', 'admin.ex.col.access', 'admin.ex.col.status', 'admin.ex.col.subtasks', 'admin.ex.col.variants', 'admin.ex.col.author', 'admin.ex.col.updated'])
    fireEvent.click(screen.getByRole('button', { name: 'exercises.catalog.columns' }))
    const menu = await screen.findByRole('dialog')
    fireEvent.click(within(menu).getByRole('checkbox', { name: 'admin.ex.col.access' }))
    fireEvent.click(within(menu).getByRole('checkbox', { name: 'admin.ex.col.tags' }))
    // Tags sits after difficulty; one step up puts it before difficulty, Alt+↑ on its row one more.
    const rows = within(menu).getAllByRole('listitem')
    const tagsRow = rows.find((row) => row.textContent?.includes('admin.ex.col.tags'))!
    fireEvent.click(within(tagsRow).getByRole('button', { name: 'exercises.catalog.columnUpNamed' }))
    const moved = within(menu).getAllByRole('listitem').find((row) => row.textContent?.includes('admin.ex.col.tags'))!
    fireEvent.keyDown(within(moved).getByRole('checkbox'), { key: 'ArrowUp', altKey: true })
    expect(headers()).toEqual(['', 'admin.ex.col.name', 'admin.ex.col.status', 'admin.ex.col.subtasks', 'admin.ex.col.variants', 'admin.ex.col.author', 'admin.ex.col.tags', 'admin.ex.col.updated'])
    expect(within(menu).getByText('exercises.catalog.columnMoved')).toBeInTheDocument()
    unmount()
    render(<Page />)
    await screen.findByText('SQLi basics')
    expect(headers()).toEqual(['', 'admin.ex.col.name', 'admin.ex.col.status', 'admin.ex.col.subtasks', 'admin.ex.col.variants', 'admin.ex.col.author', 'admin.ex.col.tags', 'admin.ex.col.updated'])
    fireEvent.click(screen.getByRole('button', { name: 'exercises.catalog.columns' }))
    fireEvent.click(await screen.findByRole('button', { name: 'exercises.catalog.columnsReset' }))
    expect(headers()).toContain('admin.ex.col.access')
    expect(headers()).not.toContain('admin.ex.col.tags')
  })

  it('takes the columns from the profile and saves every change there', async () => {
    vi.mocked(getCatalogColumns).mockResolvedValue([{ key: 'author', visible: true }, { key: 'status', visible: true }, { key: 'access', visible: false }])
    render(<Page />)
    await screen.findByText('SQLi basics')
    await waitFor(() => expect(headers().slice(0, 4)).toEqual(['', 'admin.ex.col.name', 'admin.ex.col.author', 'admin.ex.col.status']))
    fireEvent.click(screen.getByRole('button', { name: 'exercises.catalog.columns' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('checkbox', { name: 'admin.ex.col.access' }))
    await waitFor(() => expect(saveCatalogColumns).toHaveBeenCalledTimes(1))
    expect(vi.mocked(saveCatalogColumns).mock.calls[0][0].slice(0, 3)).toEqual([{ key: 'author', visible: true }, { key: 'status', visible: true }, { key: 'access', visible: true }])
  })

  it('keeps a change made before the profile answers', async () => {
    let answer!: (columns: { key: string; visible: boolean }[]) => void
    vi.mocked(getCatalogColumns).mockReturnValue(new Promise((resolve) => { answer = resolve }))
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('button', { name: 'exercises.catalog.columns' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('checkbox', { name: 'admin.ex.col.tags' }))
    await act(async () => answer([{ key: 'owner', visible: true }]))
    expect(headers()).toContain('admin.ex.col.tags')
    expect(headers()).not.toContain('admin.ex.col.owner')
  })

  it('sorts by every sortable column from its header and marks the sorted one', async () => {
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('button', { name: 'admin.ex.col.subtasks' }))
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: 'subtasks', sortDir: 'asc', page: 1 })))
    expect(screen.getByRole('columnheader', { name: /admin.ex.col.subtasks/ })).toHaveAttribute('aria-sort', 'ascending')
    fireEvent.click(screen.getByRole('button', { name: 'admin.ex.col.subtasks' }))
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: 'subtasks', sortDir: 'desc' })))
    fireEvent.click(screen.getByRole('button', { name: 'admin.ex.col.variants' }))
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: 'variants', sortDir: 'asc' })))
    // Access has no server order: a plain header.
    expect(within(screen.getByRole('columnheader', { name: 'admin.ex.col.access' })).queryByRole('button')).toBeNull()
  })

  it('opens the task from its name; rows have no details disclosure and no «?» in headers', async () => {
    render(<Page />)
    const link = await screen.findByRole('link', { name: 'SQLi basics' })
    expect(link).toHaveAttribute('href', `/detail?id=${item.ID}`)
    expect(screen.queryByRole('button', { name: 'exercises.catalog.showDetails' })).not.toBeInTheDocument()
    expect(document.querySelector('thead [aria-label="ui.help"]')).toBeNull()
  })
})

describe('catalog on a phone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStorage()
    h.access = null
    h.canWrite = true
    h.canExport = true
    mockList.mockReset().mockResolvedValue({ Items: [item, { ...item, ID: 'two', Name: 'Second task', TaskCount: 3, VariantCount: 2 }], Total: 2, Page: 1, PageSize: 50 })
  })

  it('shows cards instead of the table, each opening its task', async () => {
    phone()
    render(<Page />)
    const link = await screen.findByRole('link', { name: 'Second task' })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(link.closest('li')).toHaveTextContent('exercises.catalog.cardSubtasks')
    expect(link.closest('li')).toHaveTextContent('exercises.catalog.cardVariants')
    expect(link).toHaveAttribute('href', '/detail?id=two')
  })

  it('keeps the search in the toolbar and clears it with ×', async () => {
    phone()
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sql' } })
    await waitFor(() => expect(window.location.search).toBe('?q=sql'))
    fireEvent.click(screen.getByRole('button', { name: 'exercises.catalog.clearSearch' }))
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it('closes the sheet without resetting, resets from its footer and sorts the cards', async () => {
    phone()
    window.history.replaceState(null, '', '/?q=sql&status=draft')
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('button', { name: 'exercises.filter.openCount' }))
    let panel = await screen.findByRole('dialog')
    const beforeClose = window.location.search
    fireEvent.click(within(panel).getByRole('button', { name: 'exercises.filter.close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(window.location.search).toBe(beforeClose)
    fireEvent.click(screen.getByRole('button', { name: 'exercises.filter.openCount' }))
    panel = await screen.findByRole('dialog')
    fireEvent.keyDown(within(panel).getByRole('button', { name: 'exercises.catalog.sortBy' }), { key: 'ArrowDown' })
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'admin.ex.col.name' }))
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: 'name', sortDir: 'asc' })))
    const footer = panel.querySelector('footer')!
    expect(within(footer).getByRole('button', { name: 'exercises.filter.done' })).toBeInTheDocument()
    fireEvent.click(within(footer).getByRole('button', { name: 'exercises.filter.reset' }))
    await waitFor(() => expect(window.location.search).not.toContain('status='))
    expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'sql', sortBy: 'name' }))
  })

  it('closes author suggestions before the sheet on Escape and returns focus to the filter button', async () => {
    phone()
    render(<Page />)
    await screen.findByText('SQLi basics')
    const trigger = screen.getByRole('button', { name: 'exercises.filter.open' })
    act(() => trigger.focus())
    fireEvent.click(trigger)
    const panel = await screen.findByRole('dialog', { name: 'exercises.filter.open' })
    const author = within(panel).getByRole('combobox', { name: 'exercises.filter.author.label' })
    act(() => author.focus())
    await screen.findByRole('option', { name: /Ада Лавлейс/ })
    fireEvent.keyDown(author, { key: 'Escape' })
    expect(author).toHaveAttribute('aria-expanded', 'false')
    expect(panel).toBeInTheDocument()
    fireEvent.keyDown(author, { key: 'Escape' })
    await waitFor(() => expect(panel).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('closes the sheet at desktop width and keeps it closed when returning to phone', async () => {
    let narrow = true
    const listeners = new Set<() => void>()
    vi.stubGlobal('matchMedia', (query: string) => ({ get matches() { return query.includes('max-width') ? narrow : !narrow }, media: query,
      addEventListener: (_event: string, notify: () => void) => listeners.add(notify), removeEventListener: (_event: string, notify: () => void) => listeners.delete(notify) }))
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('button', { name: 'exercises.filter.open' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await act(async () => { narrow = false; for (const notify of [...listeners]) notify() })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await act(async () => { narrow = true; for (const notify of [...listeners]) notify() })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'exercises.filter.open' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps chosen author names when the sheet unmounts and reopens', async () => {
    phone()
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('button', { name: 'exercises.filter.open' }))
    let panel = await screen.findByRole('dialog')
    fireEvent.focus(within(panel).getByRole('combobox', { name: 'exercises.filter.author.label' }))
    fireEvent.click(await screen.findByRole('option', { name: /Ада Лавлейс/ }))
    fireEvent.click(within(panel).getByRole('button', { name: 'exercises.filter.done' }))
    fireEvent.click(screen.getByRole('button', { name: 'exercises.filter.openCount' }))
    panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('Ада Лавлейс')).toBeInTheDocument()
    expect(within(panel).queryByText('u1')).not.toBeInTheDocument()
  })

  it('does not erase newly chosen author labels when the initial linked-author lookup finishes later', async () => {
    phone()
    window.history.replaceState(null, '', '/?author=u0')
    let resolveInitial!: (authors: { ID: string; Name: string; Count: number }[]) => void
    mockAuthors.mockImplementation((_search, _limit, ids) => ids ? new Promise((resolve) => { resolveInitial = resolve }) : Promise.resolve([{ ID: 'u1', Name: 'Ада Лавлейс', Count: 2 }]))
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('button', { name: 'exercises.filter.openCount' }))
    let panel = await screen.findByRole('dialog')
    fireEvent.focus(within(panel).getByRole('combobox', { name: 'exercises.filter.author.label' }))
    fireEvent.click(await screen.findByRole('option', { name: /Ада Лавлейс/ }))
    await act(async () => resolveInitial([{ ID: 'u0', Name: 'Початковий автор', Count: 1 }]))
    fireEvent.click(within(panel).getByRole('button', { name: 'exercises.filter.done' }))
    fireEvent.click(screen.getByRole('button', { name: 'exercises.filter.openCount' }))
    panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('Ада Лавлейс')).toBeInTheDocument()
  })

  it('explains every visible scope tab in order and the tag так/ні cycle in the sheet', async () => {
    phone()
    h.access = { IsAdmin: true, CanCreateCatalog: true, CanPublish: true, CanDelete: true, CanExport: true, CanImport: true, Events: [] }
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('button', { name: 'exercises.filter.open' }))
    const panel = await screen.findByRole('dialog')
    fireEvent.click(within(panel).getAllByRole('button', { name: 'ui.help' }).find((button) => /exercises.help.scope.line/.test(button.getAttribute('aria-describedby') ? document.getElementById(button.getAttribute('aria-describedby')!)?.textContent ?? '' : ''))!)
    const lines = within(await screen.findByRole('tooltip')).getAllByRole('listitem')
    expect(lines.map((line) => line.querySelector('strong')?.textContent)).toEqual(['exercises.scope.all', 'exercises.scope.catalog', 'exercises.scope.event'])
    fireEvent.focus(within(panel).getByRole('combobox', { name: 'exercises.filter.tags.label' }))
    expect(await screen.findByText('exercises.filter.tags.cycleHint')).toBeInTheDocument()
  })
})

describe('exercises catalog page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStorage()
    mockList.mockReset()
    h.access = null
    h.canWrite = true
    h.canExport = true
    mockList.mockResolvedValue({ Items: [item], Total: 1, Page: 1, PageSize: 50 })
  })

  it('renders a row with name, short status and the update day', async () => {
    render(<Page />)
    expect(await screen.findByText('SQLi basics')).toBeInTheDocument()
    expect(screen.getByText('exercises.status.short.draft')).toBeInTheDocument()
    expect(document.querySelector('tbody time')).toHaveAttribute('datetime', item.UpdatedAt)
    // One page: the footer names the rows, no page arrows.
    expect(screen.getByText('exercises.catalog.range')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'admin.table.next' })).not.toBeInTheDocument()
  })

  it('renders the empty state, and after a filter a way back to every task', async () => {
    mockList.mockResolvedValue({ Items: [], Total: 0, Page: 1, PageSize: 50 })
    const { unmount } = render(<Page />)
    expect(await screen.findByText('admin.ex.empty')).toBeInTheDocument()
    expect(screen.getByText('admin.ex.empty').closest('[data-empty-state]')?.querySelector('svg')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'exercises.filter.reset' })).not.toBeInTheDocument()
    unmount()
    window.history.replaceState(null, '', '/?q=zzz&status=draft')
    render(<Page />)
    expect(await screen.findByText('admin.ex.emptyFiltered')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'exercises.filter.reset' }))
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it('keeps the header in the loading state and gives the page one h1', async () => {
    mockList.mockReturnValue(new Promise(() => undefined))
    const { container } = render(<Page />)
    expect(container.querySelectorAll('thead th.catalog-th').length).toBeGreaterThan(0)
    expect(container.querySelector('tbody.ib-table__state')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'accountMenu.exercises' })).toHaveAttribute('tabindex', '0')
  })

  it('debounces search and passes it to listExercises', async () => {
    render(<Page />)
    await screen.findByText('SQLi basics')
    expect(screen.getByPlaceholderText('admin.ex.search')).toHaveAttribute('type', 'search')
    fireEvent.change(screen.getByPlaceholderText('admin.ex.search'), { target: { value: 'sql' } })
    await waitFor(() => expect(mockList.mock.lastCall?.[0]).toMatchObject({ search: 'sql', page: 1 }))
  })

  it('filters by tags: required (all or any of them) and left out', async () => {
    render(<Page />)
    await screen.findByText('SQLi basics')
    const tags = await openChip('exercises.filter.tags.label')
    expect(mockTags).toHaveBeenCalledWith('', 50)
    fireEvent.click(await within(tags).findByRole('button', { name: 'exercises.filter.tags.require' }))
    await waitFor(() => expect(mockList.mock.lastCall?.[0]).toMatchObject({ withTags: ['crypto'] }))
    expect(window.location.search).toBe('?tag=crypto')
    fireEvent.click(within(tags).getByRole('radio', { name: 'exercises.filter.tags.modeAny' }))
    await waitFor(() => expect(mockList.mock.lastCall?.[0]).toMatchObject({ tags: ['crypto'] }))
    expect(window.location.search).toBe('?tag=crypto&tagmode=any')
    fireEvent.click(within(tags).getByRole('button', { name: 'exercises.filter.tags.exclude' }))
    await waitFor(() => expect(mockList.mock.lastCall?.[0]).toMatchObject({ withoutTags: ['crypto'] }))
    expect(mockList.mock.lastCall?.[0]).not.toHaveProperty('tags')
    expect(within(tags).getByRole('button', { name: 'exercises.filter.tags.exclude' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('offers a retry after the first page fails', async () => {
    mockList.mockRejectedValueOnce(new Error('offline'))
    render(<Page />)
    expect(await screen.findByText('admin.ex.loadError')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'error.load.retry' }))
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

  it('names the rows shown, changes the page size and pages with arrows', async () => {
    mockList.mockResolvedValue({ Items: [item], Total: 75, Page: 1, PageSize: 50 })
    render(<Page />)
    await screen.findByText('SQLi basics')
    expect(screen.getByText('exercises.catalog.range')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'admin.table.previous' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'admin.table.next' }))
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })))
    const selector = screen.getByRole('button', { name: 'admin.table.perPage' })
    fireEvent.keyDown(selector, { key: 'ArrowDown' })
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '25' }))
    await waitFor(() => expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 25 })))
  })

  it('keeps every toolbar control at the one control height', async () => {
    render(<Page />)
    await screen.findByText('SQLi basics')
    expect(screen.getByRole('button', { name: 'exercises.catalog.create' })).toHaveClass('h-9')
    for (const name of ['exercises.catalog.columns', 'exercises.catalog.importTip']) expect(screen.getByRole('button', { name })).toHaveClass('catalog-tool')
    for (const name of [/^admin\.ex\.col\.status/, /^exercises\.filter\.author\.label/, /^exercises\.filter\.tags\.label/]) {
      expect(toolbar().getByRole('button', { name }).closest('.catalog-fchip')).not.toBeNull()
    }
    expect(screen.getByRole('link', { name: 'admin.exGuide.zavdannia' })).toHaveClass('h-9', 'w-9')
  })

  it('ignores a stale next page after the tag filter changes', async () => {
    let resolveOldPage: ((page: { Items: typeof item[]; Total: number; Page: number; PageSize: number }) => void) | undefined
    const fresh = { ...item, ID: 'fresh', Name: 'Crypto basics', Tags: ['crypto'] }
    const stale = { ...item, ID: 'stale', Name: 'Old SQLi' }
    mockList.mockImplementation((filter) => {
      if (filter.page === 2) return new Promise((resolve) => { resolveOldPage = resolve })
      if (filter.withTags?.includes('crypto')) return Promise.resolve({ Items: [fresh], Total: 1, Page: 1, PageSize: 50 })
      return Promise.resolve({ Items: [item], Total: 51, Page: 1, PageSize: 50 })
    })
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('button', { name: 'admin.table.next' }))
    await waitFor(() => expect(resolveOldPage).toBeDefined())
    const tags = await openChip('exercises.filter.tags.label')
    fireEvent.click(await within(tags).findByRole('button', { name: 'exercises.filter.tags.require' }))
    expect(await screen.findByText('Crypto basics')).toBeInTheDocument()
    await act(async () => resolveOldPage?.({ Items: [stale], Total: 51, Page: 2, PageSize: 50 }))
    expect(screen.queryByText('Old SQLi')).not.toBeInTheDocument()
  })

  it('retries a failed next page with the shared load error', async () => {
    mockList.mockResolvedValueOnce({ Items: [item], Total: 51, Page: 1, PageSize: 50 })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ Items: [{ ...item, ID: 'second', Name: 'Crypto basics' }], Total: 51, Page: 2, PageSize: 50 })
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('button', { name: 'admin.table.next' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('admin.ex.loadError')
    fireEvent.click(screen.getByRole('button', { name: 'error.load.retry' }))
    expect(await screen.findByText('Crypto basics')).toBeInTheDocument()
  })
})

describe('exercises catalog — create link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStorage()
    mockList.mockReset()
    h.access = null
    h.canWrite = true
    h.canExport = true
    mockList.mockResolvedValue({ Items: [item], Total: 1, Page: 1, PageSize: 50 })
  })

  it('hides the create action without exercises.write permission', async () => {
    h.canWrite = false
    render(<Page />)
    await screen.findByText('SQLi basics')
    expect(screen.queryByRole('button', { name: 'exercises.catalog.create' })).not.toBeInTheDocument()
  })

  it('opens the dedicated creation page when there is no browser draft', async () => {
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('button', { name: 'exercises.catalog.create' }))
    expect(h.push).toHaveBeenCalledWith('/new')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('exercises catalog — archive, export and import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStorage()
    mockList.mockReset()
    h.access = null
    h.canWrite = true
    h.canExport = true
    mockList.mockResolvedValue({ Items: [item], Total: 1, Page: 1, PageSize: 50 })
  })

  it('filters by several statuses, archived among them, marks archived rows and clears with ×', async () => {
    mockList.mockResolvedValue({ Items: [{ ...item, ArchivedAt: '2026-09-20T00:00:00Z' }], Total: 1, Page: 1, PageSize: 50 })
    render(<Page />)
    await screen.findByText('SQLi basics')
    expect(screen.getByText('exercises.status.short.archived')).toBeInTheDocument()
    const status = await openChip('admin.ex.col.status')
    fireEvent.click(within(status).getByRole('checkbox', { name: 'exercises.status.short.archived' }))
    fireEvent.click(within(status).getByRole('checkbox', { name: 'exercises.status.short.changed' }))
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ statuses: ['archived', 'changed'] })))
    expect(window.location.search).toBe('?status=archived&status=changed')
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(toolbar().getByRole('button', { name: /^admin\.ex\.col\.status/ })).toHaveTextContent('exercises.status.short.archived, exercises.status.short.changed')
    fireEvent.click(screen.getByRole('button', { name: 'exercises.filter.clearField' }))
    await waitFor(() => expect(mockList.mock.lastCall?.[0]).not.toHaveProperty('statuses'))
  })

  it('swaps the toolbar for the selection bar and opens bulk export', async () => {
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('checkbox', { name: 'admin.ex.select.rowNamed: SQLi basics' }))
    expect(screen.getByText('admin.ex.selection.count')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('admin.ex.search')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'admin.ex.selection.export' }))
    expect(screen.getByTestId('export-dialog')).toHaveTextContent(item.ID)
    fireEvent.click(screen.getByRole('button', { name: 'admin.ex.selection.clear' }))
    expect(screen.queryByText('admin.ex.selection.count')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('admin.ex.search')).toBeInTheDocument()
  })

  it('caps the selection at 100 exercises', async () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ ...item, ID: `id-${i}`, Name: `Exercise ${i}` }))
    mockList.mockResolvedValue({ Items: many, Total: 101, Page: 1, PageSize: 101 })
    render(<Page />)
    await screen.findByText('Exercise 0')
    fireEvent.click(screen.getByRole('checkbox', { name: 'admin.ex.select.all' }))
    expect(screen.getByText('admin.ex.selection.limit')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'admin.ex.select.rowNamed: Exercise 99' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'admin.ex.select.rowNamed: Exercise 100' })).toBeDisabled()
  })

  it('hides selection without export and import without write', async () => {
    h.canExport = false
    h.canWrite = false
    render(<Page />)
    await screen.findByText('SQLi basics')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'exercises.catalog.importTip' })).not.toBeInTheDocument()
  })

  it('opens the import dialog', async () => {
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('button', { name: 'exercises.catalog.importTip' }))
    expect(screen.getByTestId('import-dialog')).toBeInTheDocument()
  })
})

describe('exercises catalog — W4 scope, rights and badges', () => {
  const manager = {
    IsAdmin: false, CanCreateCatalog: false, CanPublish: false, CanDelete: false, CanExport: true, CanImport: true,
    Events: [{ ID: 'ev1', Name: 'Winter CTF', Tag: 'winter', CanWrite: true, InfrastructureAllowed: false }],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    resetStorage()
    mockList.mockReset()
    h.canWrite = true
    h.canExport = true
    h.access = null
    mockList.mockResolvedValue({ Items: [item], Total: 1, Page: 1, PageSize: 50 })
    window.history.replaceState(null, '', '/')
  })

  it('adds the scope and infrastructure filters through «Фільтр» and removes them with ×', async () => {
    render(<Page />)
    await screen.findByText('SQLi basics')
    let popover = await addFilter('exercises.catalog.storage')
    expect(within(popover).getAllByRole('radio').map((radio) => radio.closest('label')?.textContent)).toEqual(['exercises.scope.all', 'exercises.scope.catalog', 'exercises.scope.event'])
    fireEvent.click(within(popover).getByRole('radio', { name: 'exercises.scope.catalog' }))
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'catalog' })))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    popover = await addFilter('exercises.filter.infra')
    fireEvent.click(within(popover).getByRole('radio', { name: 'exercises.filter.infraYes' }))
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ infrastructure: 'yes' })))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    for (const clear of screen.getAllByRole('button', { name: 'exercises.filter.clearField' })) fireEvent.click(clear)
    await waitFor(() => expect(window.location.search).toBe(''))
    expect(screen.queryByRole('button', { name: /^exercises\.filter\.infra/ })).not.toBeInTheDocument()
  })

  it('shows the access column, one short status per row and the infrastructure icon', async () => {
    mockList.mockResolvedValue({ Items: [
      { ...item, ID: 'e1', Name: 'Event one', Scope: 'event', OwnerEventID: 'ev1', OwnerEventName: 'Winter CTF', AccessLevel: '', Infrastructure: true, HasPublished: true, HasDraft: true },
      { ...item, ID: 'e2', Name: 'Catalog one', AccessLevel: 'all', HasPublished: true, HasDraft: false },
      { ...item, ID: 'e3', Name: 'Archived one', AccessLevel: 'own', ArchivedAt: '2026-09-20T00:00:00Z' },
      { ...item, ID: 'e4', Name: 'Hidden one', AccessLevel: 'none' },
    ], Total: 4, Page: 1, PageSize: 50 })
    render(<Page />)
    await screen.findByText('Event one')
    expect(screen.getByText('exercises.accessCol.event')).toBeInTheDocument()
    expect(screen.getByText('exercises.access.level.all')).toBeInTheDocument()
    expect(screen.getByText('exercises.access.level.own')).toBeInTheDocument()
    expect(screen.getByText('exercises.access.level.none')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'exercises.infra.tooltip' })).toBeInTheDocument()
    const changed = document.querySelector('[data-status="changed"]')!
    expect([...changed.querySelectorAll('[data-badge]')].map((badge) => [badge.textContent, badge.getAttribute('data-badge')]))
      .toEqual([['exercises.status.short.changed', 'warn']])
    expect(document.querySelector('[data-status="published"] [data-badge="ok"]')).toHaveTextContent('exercises.status.short.published')
    expect(document.querySelector('[data-status="archived"] [data-badge="muted"]')).toHaveTextContent('exercises.status.short.archived')
    expect(document.querySelectorAll('[data-status]')).toHaveLength(4)
  })

  it('lists the selected events of an exercise on demand', async () => {
    h.access = { ...manager, IsAdmin: true, Events: [manager.Events[0], { ...manager.Events[0], ID: 'ev2', Name: 'Spring CTF' }] }
    mockList.mockResolvedValue({ Items: [{ ...item, AccessLevel: 'selected' }], Total: 1, Page: 1, PageSize: 50 })
    mockCard.mockResolvedValue({ ...item, AccessLevel: 'selected', AccessEventIDs: ['ev1', 'ev2'] } as never)
    render(<Page />)
    const trigger = await screen.findByRole('button', { name: 'exercises.access.level.selected' })
    fireEvent.click(trigger)
    expect(await screen.findByText('Spring CTF')).toBeInTheDocument()
    expect(mockCard).toHaveBeenCalledWith(item.ID)
    expect(screen.getByRole('button', { name: 'exercises.accessCol.selectedCount' })).toBeInTheDocument()
  })

  it('filters by several events and keeps the filters in the URL', async () => {
    h.access = { ...manager, Events: [manager.Events[0], { ...manager.Events[0], ID: 'ev2', Name: 'Spring CTF' }] }
    mockList.mockImplementation(async (filter) => ({
      Items: filter.events?.includes('ev2') ? [item, { ...item, ID: 'two', Name: 'Spring task' }] : [item], Total: 1, Page: 1, PageSize: filter.pageSize,
    }))
    render(<Page />)
    await screen.findByText('SQLi basics')
    const popover = await addFilter('exercises.filter.events.event')
    fireEvent.click(within(popover).getByRole('checkbox', { name: /Winter CTF/ }))
    fireEvent.click(within(popover).getByRole('checkbox', { name: /Spring CTF/ }))
    expect(await screen.findByText('Spring task')).toBeInTheDocument()
    expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ events: ['ev1', 'ev2'], page: 1, pageSize: 50 }))
    expect(window.location.search).toBe('?event=ev1&event=ev2')
    fireEvent.change(within(popover).getByRole('searchbox'), { target: { value: 'nothing' } })
    // The chosen events stay listed while the search narrows the rest.
    expect(within(popover).getAllByRole('checkbox')).toHaveLength(2)
  })

  it('restores filters from the URL into the chips', async () => {
    window.history.replaceState(null, '', '/?status=changed&infra=yes&tag=web&notag=old&author=u1&dmin=2&dmax=4&sort=name&dir=asc')
    mockList.mockResolvedValue({ Items: [{ ...item, HasPublished: true, HasDraft: true }], Total: 1, Page: 1, PageSize: 200 })
    render(<Page />)
    await screen.findByText('SQLi basics')
    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({
      statuses: ['changed'], infrastructure: 'yes', withTags: ['web'], withoutTags: ['old'], authors: ['u1'], difficultyMin: 2, difficultyMax: 4, sortBy: 'name', sortDir: 'asc',
    }))
    expect(toolbar().getByRole('button', { name: /^admin\.ex\.col\.status/ })).toHaveTextContent('exercises.status.short.changed')
    expect(screen.getByRole('button', { name: /^exercises\.filter\.tags\.label/ })).toHaveTextContent('web')
    // The author a link chose is named before the author list is opened.
    expect(mockAuthors).toHaveBeenCalledWith('', 100, ['u1'])
    await waitFor(() => expect(screen.getByRole('button', { name: /^exercises\.filter\.author\.label/ })).toHaveTextContent('Ада Лавлейс'))
    expect(screen.getByRole('button', { name: /^exercises\.filter\.difficulty\.label/ })).toHaveTextContent('exercises.catalog.condition.difficultyRange')
    expect(screen.getByRole('button', { name: /^exercises\.filter\.infra/ })).toHaveTextContent('exercises.filter.infraYes')
    expect(screen.getAllByRole('button', { name: 'exercises.filter.clearField' })).toHaveLength(5)
  })

  it('gives moderators their events, event scope by default, import into them and export of their own tasks only', async () => {
    h.access = manager
    const rights = { CanRead: true, CanEdit: false, CanPublish: false, CanDelete: false, CanManageAccess: false, CanPropose: false, CanExport: false }
    mockList.mockResolvedValue({ Items: [
      { ...item, ID: 'own', Name: 'Own task', Scope: 'event', OwnerEventID: 'ev1', Permissions: { ...rights, CanEdit: true, CanExport: true } },
      { ...item, ID: 'cat', Name: 'Catalog task', Permissions: rights },
    ], Total: 2, Page: 1, PageSize: 50 })
    window.history.replaceState(null, '', '/?event=ev1')
    render(<Page />)
    await screen.findByText('Own task')
    expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'event', events: ['ev1'] }))
    fireEvent.click(screen.getByRole('button', { name: 'exercises.filter.add' }))
    fireEvent.click(await screen.findByRole('button', { name: 'exercises.catalog.storage' }))
    expect(await screen.findByRole('radio', { name: 'exercises.scope.catalog' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'exercises.scope.all' })).not.toBeInTheDocument()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'exercises.catalog.importTip' }))
    // Only their event as the target, preselected from the events filter.
    expect(screen.getByTestId('import-dialog')).toHaveAttribute('data-targets', 'ev1')
    expect(screen.getByTestId('import-dialog')).toHaveAttribute('data-initial', 'ev1')
    fireEvent.click(screen.getByRole('button', { name: 'exercises.catalog.create' }))
    expect(h.push).toHaveBeenCalledWith('/new?event=ev1')
    expect(screen.getByRole('checkbox', { name: 'admin.ex.select.rowNamed: Own task' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'admin.ex.select.rowNamed: Catalog task' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'admin.ex.select.all' }))
    expect(screen.getByRole('checkbox', { name: 'admin.ex.select.rowNamed: Own task' })).toBeChecked()
  })

  it('gives admins the catalog and their events as import targets', async () => {
    h.access = { ...manager, IsAdmin: true, CanCreateCatalog: true }
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('button', { name: 'exercises.catalog.importTip' }))
    expect(screen.getByTestId('import-dialog')).toHaveAttribute('data-targets', 'catalog,ev1')
    expect(screen.getByTestId('import-dialog')).toHaveAttribute('data-initial', '')
  })

  it('hides import and export from event viewers', async () => {
    h.access = { ...manager, CanImport: false, CanExport: false, Events: [{ ...manager.Events[0], CanWrite: false }] }
    render(<Page />)
    await screen.findByText('SQLi basics')
    expect(screen.queryByRole('button', { name: 'exercises.catalog.importTip' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('shows the author, counts and average difficulty of each task', async () => {
    mockList.mockResolvedValue({ Items: [
      { ...item, ID: 'a', Name: 'Rated', AuthorID: 'u1', AuthorName: 'Ада Лавлейс', AvgDifficulty: 3.5, TaskCount: 4, TaskNames: ['One', 'Two', 'Three', 'Four'], VariantCount: 7 },
      { ...item, ID: 'b', Name: 'Unrated' },
    ], Total: 2, Page: 1, PageSize: 50 })
    render(<Page />)
    await screen.findByText('Rated')
    fireEvent.click(screen.getByRole('button', { name: 'exercises.catalog.columns' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'admin.ex.col.difficulty' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.getByText('Ада Лавлейс')).toBeInTheDocument()
    expect(screen.getByLabelText('exercises.difficulty.value')).toHaveTextContent('admin.ex.difficulty.medium3,5')
    expect(screen.getByLabelText('exercises.difficulty.none')).toHaveTextContent('—')
    expect(screen.getByLabelText('exercises.author.unknown')).toHaveTextContent('—')
    expect(screen.getByLabelText('exercises.variants.none')).toHaveTextContent('—')
    expect(screen.getByRole('row', { name: /Rated/ })).toHaveTextContent('7')
    expect(screen.getByLabelText('exercises.subtasks.none')).toHaveTextContent('—')
    fireEvent.click(screen.getByRole('button', { name: 'exercises.subtasks.show' }))
    expect((await screen.findAllByRole('listitem')).map((li) => li.textContent)).toEqual(['One', 'Two', 'Three', 'Four'])
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'admin.ex.col.difficulty' }))
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: 'difficulty', sortDir: 'asc' })))
    fireEvent.click(screen.getByRole('button', { name: 'admin.ex.col.author' }))
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: 'author', sortDir: 'asc' })))
  })

  it('filters by author and difficulty range from the chips', async () => {
    render(<Page />)
    await screen.findByText('SQLi basics')
    const authors = await openChip('exercises.filter.author.label')
    fireEvent.click(await within(authors).findByRole('checkbox', { name: /Ада Лавлейс/ }))
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ authors: ['u1'], page: 1 })))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    await waitFor(() => expect(screen.getByRole('button', { name: /^exercises\.filter\.author\.label/ })).toHaveTextContent('Ада Лавлейс'))
    const range = await addFilter('exercises.filter.difficulty.label')
    fireEvent.keyDown(within(range).getByRole('button', { name: 'exercises.filter.difficulty.fromLabel' }), { key: 'ArrowDown' })
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'admin.ex.difficulty.easy' }))
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ authors: ['u1'], difficultyMin: 3 })))
    expect(window.location.search).toBe('?author=u1&dmin=3')
  })

  it('opens the filters as a sheet on a phone', async () => {
    phone()
    render(<Page />)
    await screen.findByText('SQLi basics')
    fireEvent.click(screen.getByRole('button', { name: 'exercises.filter.open' }))
    const panel = await screen.findByRole('dialog', { name: 'exercises.filter.open' })
    fireEvent.focus(within(panel).getByRole('combobox', { name: 'exercises.filter.tags.label' }))
    fireEvent.click(await screen.findByRole('option', { name: /crypto/ }))
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ withTags: ['crypto'] })))
    fireEvent.click(within(panel).getByRole('button', { name: 'exercises.filter.done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'exercises.filter.openCount' })).toBeInTheDocument()
  })

  it('hides create for event viewers', async () => {
    h.access = { ...manager, Events: [{ ...manager.Events[0], CanWrite: false }] }
    render(<Page />)
    await screen.findByText('SQLi basics')
    expect(screen.queryByRole('button', { name: 'exercises.catalog.create' })).not.toBeInTheDocument()
  })
})

describe('exercises catalog — background imports', () => {
  const running = { state: 'running' as const, stage: 'tasks' as const, imagesDone: 0, imagesTotal: 0, tasksDone: 5, tasksTotal: 12, bytesPushed: 0, bytesTotal: 0, exercises: [] }

  beforeEach(() => {
    vi.clearAllMocks()
    resetStorage()
    resetImportJobsForTests()
    vi.mocked(listRunningImports).mockResolvedValue([])
    h.access = null
    mockList.mockReset()
    h.canWrite = true
    h.canExport = true
    mockList.mockResolvedValue({ Items: [item], Total: 1, Page: 1, PageSize: 50 })
  })

  it('shows a strip above the table for an import resumed after a reload', async () => {
    localStorage.setItem(IMPORT_JOBS_KEY, JSON.stringify(['j1']))
    vi.mocked(getImportJob).mockResolvedValue(running)
    render(<Page />)
    await screen.findByText('SQLi basics')
    const strip = await waitFor(() => {
      const found = document.querySelector('[data-import-job="running"]')
      expect(found).not.toBeNull()
      return found as HTMLElement
    })
    expect(strip).toHaveTextContent('admin.exImport.rowTitle')
    expect(strip).toHaveTextContent('admin.exImport.stage.tasksCount')
    expect(within(strip).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
    // Above the table, outside it, and the rest of the catalog stays usable meanwhile.
    expect(strip.closest('table')).toBeNull()
    expect(strip.compareDocumentPosition(screen.getByRole('table')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: 'exercises.catalog.importTip' })).toBeEnabled()
  })

  it('shows the strip whatever the filters leave in the list', async () => {
    mockList.mockResolvedValue({ Items: [], Total: 0, Page: 1, PageSize: 50 })
    localStorage.setItem(IMPORT_JOBS_KEY, JSON.stringify(['j1']))
    vi.mocked(getImportJob).mockResolvedValue(running)
    render(<Page />)
    await screen.findByText('admin.ex.empty')
    await waitFor(() => expect(document.querySelector('[data-import-job="running"]')).not.toBeNull())
  })

  it('follows an import the server lists even with empty storage', async () => {
    vi.mocked(listRunningImports).mockResolvedValue(['srv1'])
    vi.mocked(getImportJob).mockResolvedValue(running)
    render(<Page />)
    await waitFor(() => expect(document.querySelector('[data-import-job="running"]')).not.toBeNull())
  })

  it('refreshes the list without clearing it when an import ends', async () => {
    localStorage.setItem(IMPORT_JOBS_KEY, JSON.stringify(['j1']))
    vi.mocked(getImportJob).mockResolvedValue({ ...running, state: 'done', stage: 'done', exercises: [] })
    render(<Page />)
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
    expect(screen.getByText('SQLi basics')).toBeInTheDocument()
    expect(document.querySelector('[data-import-job]')).toBeNull()
  })

  it('shows a failed import with its details button', async () => {
    localStorage.setItem(IMPORT_JOBS_KEY, JSON.stringify(['j2']))
    vi.mocked(getImportJob).mockResolvedValue({ ...running, state: 'failed', stage: 'failed', error: new ApiError(409, null) })
    render(<Page />)
    await waitFor(() => expect(document.querySelector('[data-import-job="failed"]')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'admin.exImport.details' }))
    expect(screen.getByTestId('import-dialog')).toHaveTextContent('j2')
    expect(document.querySelector('[data-import-job="failed"]')).toHaveTextContent('admin.exImport.failedWith')
  })

  it('shows no import strip to someone who cannot import', async () => {
    h.canWrite = false
    h.canExport = false
    localStorage.setItem(IMPORT_JOBS_KEY, JSON.stringify(['j1']))
    vi.mocked(getImportJob).mockResolvedValue(running)
    render(<Page />)
    await screen.findByText('SQLi basics')
    expect(document.querySelector('[data-import-job]')).toBeNull()
  })
})
