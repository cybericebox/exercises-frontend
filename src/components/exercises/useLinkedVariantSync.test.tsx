import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useForm } from 'react-hook-form'

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))

import { emptyTask, emptyVariant, type DraftFormValues, type VariantFormValues } from '@/lib/exerciseSchemas'
import type { LexicalDoc } from '@/api/exercises/versions'
import { useLinkedVariantSync } from './useLinkedVariantSync'

const doc = (text: string): LexicalDoc => ({ text })

function task(id: string, name: string, flag: string[] = [], description: LexicalDoc | null = null) {
  return { ...emptyTask(), ID: id, Name: name, Flag: flag, Description: description }
}

function variant(id: string, index: number, tasks: ReturnType<typeof task>[], linkedTo = ''): VariantFormValues {
  return { ...emptyVariant(index), ID: id, LinkedTo: linkedTo, Tasks: tasks }
}

function draft(): DraftFormValues {
  return {
    AdminNote: '',
    Variants: [
      variant('base', 1, [task('t1', 'Scan', ['ICE{base}'], doc('base text'))]),
      variant('linked', 2, [task('t1', 'Scan', ['ICE{own}'], doc('base text'))], 'base'),
      variant('free', 3, [task('t1', 'Free', ['ICE{free}'], doc('free text'))]),
    ],
  }
}

function setup(enabled = true) {
  return renderHook(({ on }) => {
    const form = useForm<DraftFormValues>({ defaultValues: draft() })
    useLinkedVariantSync(form, on)
    return form
  }, { initialProps: { on: enabled } })
}

describe('useLinkedVariantSync', () => {
  it('mirrors a base description edit into a linked variant', () => {
    const { result } = setup()
    act(() => result.current.setValue('Variants.0.Tasks.0.Description', doc('new base text'), { shouldDirty: true }))
    expect(result.current.getValues('Variants.1.Tasks.0.Description')).toEqual(doc('new base text'))
    expect(result.current.getValues('Variants.1.Tasks.0.Flag')).toEqual(['ICE{own}'])
    expect(result.current.getValues('Variants.1.LinkedTo')).toBe('base')
  })

  it('mirrors a base task added after linking', () => {
    const { result } = setup()
    act(() => result.current.setValue('Variants.0.Tasks', [
      ...result.current.getValues('Variants.0.Tasks'),
      task('', 'Exploit', ['ICE{base2}'], doc('second')),
    ], { shouldDirty: true }))
    const tasks = result.current.getValues('Variants.1.Tasks')
    expect(tasks).toHaveLength(2)
    expect(tasks[1].Name).toBe('Exploit')
    expect(tasks[1].Flag).toEqual([])
    expect(tasks[0].Flag).toEqual(['ICE{own}'])
  })

  it('does not touch independent variants', () => {
    const { result } = setup()
    const before = structuredClone(result.current.getValues('Variants.2'))
    act(() => result.current.setValue('Variants.0.Tasks.0.Name', 'Renamed', { shouldDirty: true }))
    expect(result.current.getValues('Variants.1.Tasks.0.Name')).toBe('Renamed')
    expect(result.current.getValues('Variants.2')).toEqual(before)
    act(() => result.current.setValue('Variants.2.Tasks.0.Description', doc('free edit'), { shouldDirty: true }))
    expect(result.current.getValues('Variants.1.Tasks.0.Description')).toEqual(doc('base text'))
  })

  it('does nothing when disabled', () => {
    const { result } = setup(false)
    act(() => result.current.setValue('Variants.0.Tasks.0.Description', doc('new base text'), { shouldDirty: true }))
    expect(result.current.getValues('Variants.1.Tasks.0.Description')).toEqual(doc('base text'))
  })
})
