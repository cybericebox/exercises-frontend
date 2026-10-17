import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { VariantStats } from '@/api/exercises/stats'

vi.mock('@/i18n/t', () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key}${JSON.stringify(vars)}` : key }))
vi.mock('@/api/exercises/stats', () => ({ getVariantStats: vi.fn() }))
vi.mock('@/lib/exerciseStatus', () => ({ formatExerciseDateTime: (value: string) => `fmt:${value}` }))

import { getVariantStats } from '@/api/exercises/stats'
import { VariantStatsDialog } from './VariantStatsDialog'

const stats: VariantStats[] = [
  {
    VersionID: 'v2', Status: 'published', CreatedAt: '2026-09-20T10:00:00Z', PublishedAt: '2026-09-21T09:00:00Z',
    Variants: [
      { VariantID: 'a', Number: 1, Issued: 5, Solved: 3, Tasks: [{ TaskID: 't1', Name: 'Scan', Solved: 4 }, { TaskID: 't2', Name: 'Exploit', Solved: 3 }] },
      { VariantID: 'b', Number: 2, Issued: 0, Solved: 0, Tasks: [{ TaskID: 't3', Name: 'Scan', Solved: 0 }] },
    ],
  },
  {
    VersionID: 'v1', Status: 'unpublished', CreatedAt: '2026-09-01T10:00:00Z', PublishedAt: null,
    Variants: [{ VariantID: 'c', Number: 1, Issued: 2, Solved: 1, Tasks: [{ TaskID: 't4', Name: 'Old', Solved: 1 }] }],
  },
]

const open = () => render(<VariantStatsDialog exerciseId="ex-1" onClose={vi.fn()} />)

describe('VariantStatsDialog', () => {
  beforeEach(() => vi.mocked(getVariantStats).mockReset())

  it('shows the crest loader centered while loading', async () => {
    let finish!: (value: VariantStats[]) => void
    vi.mocked(getVariantStats).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    open()
    const block = screen.getByTestId('variant-stats-block')
    expect(block).toHaveClass('min-h-64')
    expect(within(block).getByRole('status')).toBeInTheDocument()
    await act(async () => finish([]))
  })

  it('shows the empty state for no issues', async () => {
    vi.mocked(getVariantStats).mockResolvedValue([])
    open()
    expect(await screen.findByText('admin.exStats.empty')).toBeInTheDocument()
    expect(screen.getByTestId('variant-stats-block')).toHaveClass('min-h-64')
  })

  it('shows the load error with retry and reloads on retry', async () => {
    vi.mocked(getVariantStats).mockRejectedValueOnce(new Error('offline'))
    vi.mocked(getVariantStats).mockResolvedValueOnce([])
    open()
    expect(await screen.findByText('admin.exStats.loadError')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /error\.load\.retry|retry/i }))
    expect(await screen.findByText('admin.exStats.empty')).toBeInTheDocument()
    expect(getVariantStats).toHaveBeenCalledTimes(2)
  })

  it('renders a table per version with issued, solved and per-subtask counts', async () => {
    vi.mocked(getVariantStats).mockResolvedValue(stats)
    open()
    const headings = await screen.findAllByRole('heading', { level: 3 })
    expect(headings.map((h) => h.textContent)).toEqual([
      'admin.exStats.version{"date":"fmt:2026-09-21T09:00:00Z"}admin.exHistory.kind.published',
      'admin.exStats.version{"date":"fmt:2026-09-01T10:00:00Z"}admin.exHistory.kind.unpublished',
    ])
    const tables = screen.getAllByRole('table')
    expect(tables).toHaveLength(2)
    const head = within(tables[0]).getAllByRole('columnheader').map((c) => c.textContent)
    expect(head).toEqual(['admin.exStats.variant', 'admin.exStats.issued', 'admin.exStats.solved', 'Scan', 'Exploit'])
    const rows = within(tables[0]).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell').map((c) => c.textContent))).toEqual([
      ['admin.exDraft.variantN{"n":1}', '5', '3', '4', '3'],
      ['admin.exDraft.variantN{"n":2}', '0', '0', '0', ''],
    ])
    expect(within(tables[1]).getAllByRole('row')).toHaveLength(2)
  })
})
