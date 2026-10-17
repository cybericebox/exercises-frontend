import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useFieldArray, useForm } from 'react-hook-form'

vi.mock('@/i18n/t', () => ({ t: (key: string) => key }))

import { emptyTask, emptyVariant, type DraftFormValues, type VariantFormValues } from '@/lib/exerciseSchemas'
import type { LexicalDoc, Version } from '@/api/exercises/versions'
import { capturedDraftIds, serverIdUpdates } from '@/lib/serverIdUpdates'
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

  it('keeps the linked subtask forms mounted when a save assigns ids to a new base task', () => {
    const { result } = renderHook(() => {
      const form = useForm<DraftFormValues>({ defaultValues: draft() })
      useLinkedVariantSync(form, true)
      const linkedTasks = useFieldArray({ control: form.control, name: 'Variants.1.Tasks' })
      // A mounted subtask field of the linked tab (TaskForm registers its inputs like this).
      form.register('Variants.1.Tasks.0.Name')
      return { form, linkedTasks }
    })
    // A new base subtask is mirrored into the linked variant, both without ids yet.
    act(() => result.current.form.setValue('Variants.0.Tasks', [
      ...result.current.form.getValues('Variants.0.Tasks'),
      task('', 'Exploit', ['ICE{base2}'], doc('second')),
    ], { shouldDirty: true }))
    act(() => result.current.form.setValue('Variants.1.Tasks.1.Flag', ['ICE{own2}'], { shouldDirty: true }))
    const mountedIds = result.current.linkedTasks.fields.map((field) => field.id)
    const sent = capturedDraftIds(result.current.form.getValues())
    // The daemon deep-copies the base: the linked copy gets the same task id.
    const savedVariants = structuredClone(result.current.form.getValues('Variants'))
    savedVariants.forEach((variant) => { if (variant.ID !== 'free') variant.Tasks[1].ID = 't2' })
    const saved = { ID: 'draft-1', Variants: savedVariants } as unknown as Version
    act(() => {
      for (const update of serverIdUpdates(sent, saved, result.current.form.getValues())) result.current.form.setValue(update.path, update.value)
    })
    expect(result.current.form.getValues('Variants.1.Tasks.1.ID')).toBe('t2')
    expect(result.current.form.getValues('Variants.1.Tasks.1.Flag')).toEqual(['ICE{own2}'])
    expect(result.current.linkedTasks.fields.map((field) => field.id)).toEqual(mountedIds)
  })
})
