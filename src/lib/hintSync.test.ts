import { describe, expect, it } from 'vitest'
import { addHint, clampHintCost, hintsAligned, hintsForNewVariant, moveHint, removeHint, setHintCost } from './hintSync'

type H = { ID: string; Text: string; Cost: number }
const variants = (a: H[], b: H[]) => [{ Tasks: [{ Hints: a }, { Hints: [] as H[] }] }, { Tasks: [{ Hints: b }, { Hints: [] as H[] }] }]
const h = (ID: string, Text: string, Cost: number): H => ({ ID, Text, Cost })

describe('hint sync across variants', () => {
  it('adds an empty hint to the same task of every variant', () => {
    const next = addHint(variants([h('a', 'one', 5)], [h('a', 'uno', 5)]), 0, 20)
    expect(next[0].Tasks[0].Hints).toEqual([h('a', 'one', 5), h('', '', 20)])
    expect(next[1].Tasks[0].Hints).toEqual([h('a', 'uno', 5), h('', '', 20)])
    expect(next[0].Tasks[1].Hints).toEqual([])
  })

  it('stops at 10 hints', () => {
    const ten = Array.from({ length: 10 }, (_, i) => h(String(i), '', 0))
    const start = variants(ten, ten)
    expect(addHint(start, 0)).toBe(start)
  })

  it('removes, moves and re-costs by position, keeping per-variant texts', () => {
    const start = variants([h('a', 'A1', 1), h('b', 'B1', 2), h('c', 'C1', 3)], [h('a', 'A2', 1), h('b', 'B2', 2), h('c', 'C2', 3)])
    const removed = removeHint(start, 0, 1)
    expect(removed[1].Tasks[0].Hints.map((x) => x.Text)).toEqual(['A2', 'C2'])
    const moved = moveHint(start, 0, 2, 0)
    expect(moved[0].Tasks[0].Hints.map((x) => x.ID)).toEqual(['c', 'a', 'b'])
    expect(moved[1].Tasks[0].Hints.map((x) => x.Text)).toEqual(['C2', 'A2', 'B2'])
    expect(moveHint(start, 0, 0, 5)).toBe(start)
    const costed = setHintCost(start, 0, 0, 40)
    expect(costed.map((v) => v.Tasks[0].Hints[0].Cost)).toEqual([40, 40])
    expect(costed[1].Tasks[0].Hints[0].Text).toBe('A2')
  })

  it('clamps costs to 0..10000 integers', () => {
    expect(clampHintCost(-5)).toBe(0)
    expect(clampHintCost(12.7)).toBe(12)
    expect(clampHintCost(20000)).toBe(10000)
    expect(clampHintCost(Number.NaN)).toBe(0)
  })

  it('checks alignment by count, cost and known IDs', () => {
    expect(hintsAligned([h('a', 'x', 1)], [h('a', 'y', 1)])).toBe(true)
    expect(hintsAligned([h('', 'x', 1)], [h('a', 'y', 1)])).toBe(true)
    expect(hintsAligned([h('a', 'x', 2)], [h('a', 'y', 1)])).toBe(false)
    expect(hintsAligned([h('b', 'x', 1)], [h('a', 'y', 1)])).toBe(false)
    expect(hintsAligned([], [h('a', 'y', 1)])).toBe(false)
  })

  it('gives a new variant the canonical IDs and costs with empty texts', () => {
    expect(hintsForNewVariant([h('a', 'x', 7)])).toEqual([h('a', '', 7)])
  })
})
