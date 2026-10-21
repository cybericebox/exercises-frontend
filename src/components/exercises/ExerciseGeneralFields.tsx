"use client"

import { useEffect, useState } from "react"
import { useFormState, useWatch, type UseFormReturn } from "react-hook-form"
import { listExerciseTags, type ExerciseTagSuggestion } from "@/api/exercises/catalog"
import { t } from "@/i18n/t"
import { FieldHelp } from "@/components/ui/field-help"
import { ExerciseFieldLabel } from "@/components/exercises/ExerciseFieldLabel"
import { TagInput } from "@/components/exercises/TagInput"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { DraftFormValues, IdentityFormValues } from "@/lib/exerciseSchemas"

/** Read sections participate in heading navigation; edit fields keep the existing labels. */
function GeneralSectionHeading({ labelKey, helpKey }: { labelKey:string; helpKey:string }) {
  return <div className="flex items-center gap-1.5">
    <h2 className="text-sm font-medium leading-5 text-foreground">{t(labelKey)}</h2>
    <FieldHelp text={t(helpKey)} />
  </div>
}

/**
 * The General tab: ordinary text in read mode, the existing forms in edit/new.
 * showNotes: the internal notes are for full access only (admins, the owner event's owners/managers); the API
 * blanks them for everyone else, and the field is left out rather than shown empty.
 */
export function ExerciseGeneralFields({ identityForm, draftForm, disabled, autoFocusName = false, showNotes = true, readOnly = disabled }: {
  identityForm: UseFormReturn<IdentityFormValues>
  draftForm: UseFormReturn<DraftFormValues>
  disabled: boolean
  autoFocusName?: boolean
  showNotes?: boolean
  readOnly?: boolean
}) {
  const tags = useWatch({ control: identityForm.control, name: "Tags" })
  const description = useWatch({ control: identityForm.control, name: "Description" })
  const adminNote = useWatch({ control: draftForm.control, name: "AdminNote" })
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

  return <div className="exercise-general-fields">
    <div className="general-primary-fields">
    {!readOnly && <div className="general-field">
      <ExerciseFieldLabel labelKey="admin.ex.field.name" helpKey="admin.ex.help.name" htmlFor="exercise-name" required />
      <Input disabled={disabled} id="exercise-name" autoFocus={autoFocusName} aria-invalid={Boolean(errors.Name)} aria-describedby={errors.Name ? "exercise-name-error" : undefined} {...identityForm.register("Name", { onChange: () => { if (errors.Name?.type === "server") identityForm.clearErrors("Name") } })} />
      {errors.Name && <p id="exercise-name-error" role="alert" className="text-xs text-destructive">{errors.Name.message}</p>}
    </div>}
    <div className="general-field">
      {readOnly ? <GeneralSectionHeading labelKey="admin.ex.field.description" helpKey="admin.ex.field.descriptionHelp" /> : <ExerciseFieldLabel labelKey="admin.ex.field.description" helpKey="admin.ex.field.descriptionHelp" htmlFor="exercise-description" />}
      {readOnly ? <p className="general-read-value">{description || <span className="text-muted-foreground">{t("admin.exGeneral.noDescription")}</span>}</p> : <>
        <Textarea disabled={disabled} id="exercise-description" className="general-editor" aria-invalid={Boolean(errors.Description)} aria-describedby={errors.Description ? "exercise-description-error" : undefined} {...identityForm.register("Description", { onChange: () => { if (errors.Description?.type === "server") identityForm.clearErrors("Description") } })} />
        {errors.Description && <p id="exercise-description-error" role="alert" className="text-xs text-destructive">{errors.Description.message}</p>}
      </>}
    </div>
    <div className="general-field">
      {readOnly ? <GeneralSectionHeading labelKey="admin.ex.field.tags" helpKey="admin.ex.field.tagsHelp" /> : <ExerciseFieldLabel labelKey="admin.ex.field.tags" helpKey="admin.ex.field.tagsHelp" htmlFor="exercise-tags" />}
      {readOnly ? <div className="flex flex-wrap gap-1.5">{tags.length ? tags.map((tag) => <span key={tag} className="general-tag">{tag}</span>) : <span className="text-sm text-muted-foreground">{t("admin.exGeneral.noTags")}</span>}</div> : <>
        <TagInput disabled={disabled} id="exercise-tags" value={tags} onChange={(nextTags) => identityForm.setValue("Tags", nextTags, { shouldValidate: true })} aria-invalid={Boolean(tagErrorMessage)} aria-describedby={tagErrorMessage ? "exercise-tags-error" : undefined}
          draftValue={pendingTag} suggestions={tagSuggestions} onDraftValueChange={setPendingTag} />
        {tagErrorMessage && <p id="exercise-tags-error" role="alert" className="text-xs text-destructive">{tagErrorMessage}</p>}
      </>}
    </div>
    </div>
    {showNotes && <div className="general-private-field">
      <div className="general-field mb-0">
        {readOnly ? <GeneralSectionHeading labelKey="admin.ex.create.notes" helpKey="admin.exDraft.adminNoteHelp" /> : <ExerciseFieldLabel labelKey="admin.ex.create.notes" helpKey="admin.exDraft.adminNoteHelp" htmlFor="draft-admin-note" />}
        <p className="text-xs leading-relaxed text-muted-foreground">{t("admin.exGeneral.privateHelp")}</p>
        {readOnly ? <p className="general-read-value">{adminNote || <span className="text-muted-foreground">{t("admin.exGeneral.noNotes")}</span>}</p> : <Textarea disabled={disabled} id="draft-admin-note" className="general-editor" {...draftForm.register("AdminNote")} />}
      </div>
    </div>}
  </div>
}
