import { describe, expect, it } from 'vitest'
import type { HintLevel } from '@/api/exercises/versions'
import { addHint, hintsAligned, hintsForNewVariant, moveHint, removeHint, setHintLevel } from './hintSync'

type H = { ID: string; Text: string; Level: HintLevel }
const variants = (a: H[], b: H[]) => [{ Tasks: [{ Hints: a }, { Hints: [] as H[] }] }, { Tasks: [{ Hints: b }, { Hints: [] as H[] }] }]
const h = (ID: string, Text: string, Level: HintLevel = 'nudge'): H => ({ ID, Text, Level })

describe('hint sync across variants', () => {
  it('adds an empty hint to the same task of every variant', () => {
    const next = addHint(variants([h('a', 'one', 'steps')], [h('a', 'uno', 'steps')]), 0, 'direction')
    expect(next[0].Tasks[0].Hints).toEqual([h('a', 'one', 'steps'), h('', '', 'direction')])
    expect(next[1].Tasks[0].Hints).toEqual([h('a', 'uno', 'steps'), h('', '', 'direction')])
    expect(next[0].Tasks[1].Hints).toEqual([])
    expect(addHint(variants([], []), 0)[0].Tasks[0].Hints).toEqual([h('', '', 'nudge')])
  })

  it('stops at 10 hints', () => {
    const ten = Array.from({ length: 10 }, (_, i) => h(String(i), ''))
    const start = variants(ten, ten)
    expect(addHint(start, 0)).toBe(start)
  })

  it('removes, moves and re-levels by position, keeping per-variant texts', () => {
    const start = variants([h('a', 'A1'), h('b', 'B1', 'steps'), h('c', 'C1')], [h('a', 'A2'), h('b', 'B2', 'steps'), h('c', 'C2')])
    const removed = removeHint(start, 0, 1)
    expect(removed[1].Tasks[0].Hints.map((x) => x.Text)).toEqual(['A2', 'C2'])
    const moved = moveHint(start, 0, 2, 0)
    expect(moved[0].Tasks[0].Hints.map((x) => x.ID)).toEqual(['c', 'a', 'b'])
    expect(moved[1].Tasks[0].Hints.map((x) => x.Text)).toEqual(['C2', 'A2', 'B2'])
    expect(moveHint(start, 0, 0, 5)).toBe(start)
    const leveled = setHintLevel(start, 0, 0, 'near_solution')
    expect(leveled.map((v) => v.Tasks[0].Hints[0].Level)).toEqual(['near_solution', 'near_solution'])
    expect(leveled[1].Tasks[0].Hints[0].Text).toBe('A2')
  })

  it('checks alignment by count, level and known IDs', () => {
    expect(hintsAligned([h('a', 'x')], [h('a', 'y')])).toBe(true)
    expect(hintsAligned([h('', 'x')], [h('a', 'y')])).toBe(true)
    expect(hintsAligned([h('a', 'x', 'steps')], [h('a', 'y')])).toBe(false)
    expect(hintsAligned([h('b', 'x')], [h('a', 'y')])).toBe(false)
    expect(hintsAligned([], [h('a', 'y')])).toBe(false)
  })

  it('gives a new variant the canonical IDs and levels with empty texts', () => {
    expect(hintsForNewVariant([h('a', 'x', 'direction')])).toEqual([h('a', '', 'direction')])
  })
})
