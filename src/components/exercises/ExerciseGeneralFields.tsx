"use client"

import { useEffect, useState } from "react"
import { useFormState, useWatch, type UseFormReturn } from "react-hook-form"
import { listExerciseTags, type ExerciseTagSuggestion } from "@/api/exercises/catalog"
import { t } from "@/i18n/t"
import { FieldLabel } from "@/components/ui/field-label"
import type { HelpContent } from "@/components/ui/help-content"
import { FieldError } from "@/components/exercises/editor/fieldErrors"
import { TagInput } from "@/components/exercises/TagInput"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { DraftFormValues, IdentityFormValues } from "@/lib/exerciseSchemas"

type FieldKey = "name" | "description" | "tags" | "note"

/** The «?» of a field (A5): what the field is, the limit, the default. */
function helpOf(key: FieldKey): HelpContent {
  return { intro: t(`ed.a.general.${key}.helpIntro`), ...(key === "note" ? {} : { items: [{ term: t("ed.a.general.limit"), text: t(`ed.a.general.${key}.helpLimit`) }] }), default: t(`ed.a.general.${key}.helpDefault`) }
}

/** Read sections participate in heading navigation; edit fields use the one label rule. */
function GeneralSectionHeading({ field }: { field: FieldKey }) {
  return <FieldLabel as="h3" text={t(`ed.a.general.${field}.label`)} help={helpOf(field)} />
}

/**
 * The General tab: in read mode every field is the same outlined box as in edit (border, 6px radius, padding,
 * control height), its text read-only; the forms in edit/new.
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
    {!readOnly && <div className="general-field">
      <FieldLabel text={t("ed.a.general.name.label")} htmlFor="exercise-name" required help={helpOf("name")} />
      <Input disabled={disabled} id="exercise-name" autoFocus={autoFocusName} aria-invalid={Boolean(errors.Name)} aria-describedby={errors.Name ? "fe-Name-error" : undefined} {...identityForm.register("Name", { onChange: () => { if (errors.Name?.type === "server") identityForm.clearErrors("Name") } })} />
      <FieldError path="Name" message={errors.Name?.message} />
    </div>}
    <div className="general-field">
      {readOnly ? <GeneralSectionHeading field="description" /> : <FieldLabel text={t("ed.a.general.description.label")} htmlFor="exercise-description" help={helpOf("description")} />}
      {readOnly ? <p className="general-read-value general-read-box" data-read-field>{description || <span className="text-muted-foreground">{t("ed.a.general.description.empty")}</span>}</p> : <>
        <Textarea disabled={disabled} id="exercise-description" rows={4} className="general-editor" aria-invalid={Boolean(errors.Description)} aria-describedby={errors.Description ? "fe-Description-error" : undefined} {...identityForm.register("Description", { onChange: () => { if (errors.Description?.type === "server") identityForm.clearErrors("Description") } })} />
        <FieldError path="Description" message={errors.Description?.message} />
      </>}
    </div>
    <div className="general-field">
      {readOnly ? <GeneralSectionHeading field="tags" /> : <FieldLabel text={t("ed.a.general.tags.label")} htmlFor="exercise-tags" help={helpOf("tags")} />}
      {readOnly ? <div className="general-read-box general-read-tags" data-read-field>{tags.length ? tags.map((tag) => <span key={tag} className="general-tag">{tag}</span>) : <span className="text-sm text-muted-foreground">{t("ed.a.general.tags.empty")}</span>}</div> : <>
        <TagInput disabled={disabled} id="exercise-tags" value={tags} onChange={(nextTags) => identityForm.setValue("Tags", nextTags, { shouldValidate: true })} aria-invalid={Boolean(tagErrorMessage)} aria-describedby={tagErrorMessage ? "fe-Tags-error" : undefined}
          draftValue={pendingTag} suggestions={tagSuggestions} onDraftValueChange={setPendingTag} />
        <FieldError path="Tags" message={tagErrorMessage} />
      </>}
    </div>
    {showNotes && <div className="general-field">
      {readOnly ? <GeneralSectionHeading field="note" /> : <FieldLabel text={t("ed.a.general.note.label")} htmlFor="draft-admin-note" help={helpOf("note")} />}
      {readOnly ? <p className="general-read-value general-read-box" data-read-field>{adminNote || <span className="text-muted-foreground">{t("ed.a.general.note.empty")}</span>}</p> : <Textarea disabled={disabled} id="draft-admin-note" rows={3} className="general-editor general-editor-notes" {...draftForm.register("AdminNote")} />}
    </div>}
  </div>
}
