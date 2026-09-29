"use client"

import { useEffect, useState } from "react"
import { useFormState, useWatch, type UseFormReturn } from "react-hook-form"
import { listExerciseTags, type ExerciseTagSuggestion } from "@/api/exercises/catalog"
import { ExerciseFieldLabel } from "@/components/exercises/ExerciseFieldLabel"
import { TagInput } from "@/components/exercises/TagInput"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { DraftFormValues, IdentityFormValues } from "@/lib/exerciseSchemas"

/** The «Загальне» tab. Layout is frozen by the spec; read-only mode uses `disabled`. */
export function ExerciseGeneralFields({ identityForm, draftForm, disabled, autoFocusName = false }: {
  identityForm: UseFormReturn<IdentityFormValues>
  draftForm: UseFormReturn<DraftFormValues>
  disabled: boolean
  autoFocusName?: boolean
}) {
  const tags = useWatch({ control: identityForm.control, name: "Tags" })
  const { errors } = useFormState({ control: identityForm.control })
  const [pendingTag, setPendingTag] = useState("")
  const [tagSuggestions, setTagSuggestions] = useState<ExerciseTagSuggestion[]>([])

  useEffect(() => {
    const prefix = pendingTag.trim()
    if (!prefix) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void listExerciseTags(prefix).then((items) => {
        if (!cancelled) setTagSuggestions(items)
      }).catch(() => {
        if (!cancelled) setTagSuggestions([])
      })
    }, 200)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [pendingTag])

  const tagError = errors.Tags
  const tagErrorMessage = Array.isArray(tagError)
    ? tagError.find(Boolean)?.message
    : tagError?.message ?? (tagError as { 0?: { message?: string } } | undefined)?.[0]?.message

  return <div className="grid w-full gap-x-6 gap-y-3 pt-3 lg:grid-cols-2">
    <div className="min-w-0 space-y-1.5">
      <ExerciseFieldLabel labelKey="admin.ex.field.name" helpKey="admin.ex.help.name" htmlFor="exercise-name" required />
      <Input id="exercise-name" autoFocus={autoFocusName} disabled={disabled} aria-invalid={Boolean(errors.Name)} {...identityForm.register("Name")} />
      <p role={errors.Name ? "alert" : undefined} className="min-h-4 text-xs text-destructive">{errors.Name?.message}</p>
    </div>
    <div className="min-w-0 space-y-1.5">
      <ExerciseFieldLabel labelKey="admin.ex.field.tags" helpKey="admin.ex.field.tagsHelp" htmlFor="exercise-tags" />
      <TagInput id="exercise-tags" value={tags} onChange={(nextTags) => identityForm.setValue("Tags", nextTags, { shouldValidate: true })} disabled={disabled}
        draftValue={pendingTag} suggestions={tagSuggestions} onDraftValueChange={setPendingTag} />
      <p role={tagErrorMessage ? "alert" : undefined} className="min-h-4 text-xs text-destructive">{tagErrorMessage}</p>
    </div>
    <div className="min-w-0 space-y-1.5">
      <ExerciseFieldLabel labelKey="admin.ex.field.description" helpKey="admin.ex.field.descriptionHelp" htmlFor="exercise-description" />
      <Textarea id="exercise-description" rows={5} disabled={disabled} aria-invalid={Boolean(errors.Description)} {...identityForm.register("Description")} />
      <p role={errors.Description ? "alert" : undefined} className="min-h-4 text-xs text-destructive">{errors.Description?.message}</p>
    </div>
    <div className="min-w-0 space-y-1.5">
      <ExerciseFieldLabel labelKey="admin.ex.create.notes" helpKey="admin.exDraft.adminNoteHelp" htmlFor="draft-admin-note" />
      <Textarea id="draft-admin-note" rows={5} disabled={disabled} {...draftForm.register("AdminNote")} />
      <p className="min-h-4 text-xs text-destructive" />
    </div>
  </div>
}
