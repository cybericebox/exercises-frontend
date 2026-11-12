"use client"

import { useRef, type DragEvent } from "react"
import { Controller, useFormContext, useWatch } from "react-hook-form"
import { t } from "@/i18n/t"
import { Separator } from "./Separator"
import RichTextEditor from "@/components/editor/RichTextEditor"
import { richTextHasContent } from "@/lib/hintText"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import type { Difficulty } from "@/api/exercises/versions"
import { AttachmentList, type AttachmentListHandle } from "../../AttachmentList"
import { HintsEditor } from "../../HintsEditor"
import { FieldLabel } from "@/components/ui/field-label"
import { useEditor } from "../context"
import { FieldError, fieldId, useFieldError } from "../fieldErrors"
import { CheckSection } from "./CheckSection"
import { RequiresSection } from "./RequiresSection"
import { ChoiceControl, Field, TextControl } from "./fields"
import { setSharedTaskValue } from "./taskShared"
import { useTextEditor } from "./useTextEditor"

const DIFFICULTIES = ["elementary", "trivial", "easy", "medium", "hard", "insane"] as const

/**
 * The form of the selected subtask, in the order of D2: Назва + Складність; Опис; Файли для учасників; Перевірка;
 * Відкривається після; Підказки. Sections are separated by one divider line. A file dropped anywhere on the form is added
 * to the task. A linked variant changes the answer values and the files only; the rest comes from its base.
 */
export function TaskFormView({ variantIndex, taskIndex }: { variantIndex: number; taskIndex: number }) {
  const form = useFormContext<DraftFormValues>()
  const { control, clearErrors } = form
  const { disabled, baseIndex } = useEditor()
  const linked = baseIndex >= 0
  const lock = disabled || linked
  const base = `Variants.${variantIndex}.Tasks.${taskIndex}` as const
  const files = useWatch({ control, name: `${base}.Attachments` }) ?? []
  const attachments = useRef<AttachmentListHandle>(null)
  const { config, dialog } = useTextEditor(variantIndex, taskIndex)
  const descriptionPath = `${base}.Description`
  const descriptionError = useFieldError(descriptionPath)
  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files")

  return <div data-testid="task-drop-zone" className="subtask-form"
    onDragOver={(event) => { if (!disabled && hasFiles(event)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy" } }}
    onDrop={async (event) => {
      if (disabled || !hasFiles(event)) return
      event.preventDefault()
      for (const file of Array.from(event.dataTransfer.files ?? [])) await attachments.current?.upload(file)
    }}>
    <section className="subtask-fields">
      <div className="subtask-head">
        <Field path={`${base}.Name`} label={t("admin.exTask.name")} required help={{ intro: t("ed.b.name.help"), default: t("ed.b.name.default") }}>
          <TextControl path={`${base}.Name`} ariaLabel={t("admin.exTask.name")} disabled={lock} maxLength={60} onValue={(value) => setSharedTaskValue(form, taskIndex, "Name", value)} />
        </Field>
        <Field path={`${base}.Difficulty`} label={t("admin.exTask.difficulty")} help={{ intro: t("ed.b.difficulty.help"), default: t("ed.b.difficulty.default") }}>
          <ChoiceControl path={`${base}.Difficulty`} ariaLabel={t("admin.exTask.difficulty")} disabled={lock}
            options={DIFFICULTIES.map((value) => ({ value, label: t(`admin.ex.difficulty.${value}`) }))}
            onChoose={(value) => setSharedTaskValue(form, taskIndex, "Difficulty", value as Difficulty)} />
        </Field>
      </div>
      <div className="space-y-1.5">
        <FieldLabel as="span" id={`${base}-description-label`} text={t("admin.exTask.description")} required help={{ intro: t("ed.b.description.help"), default: t("ed.b.description.default") }} />
        {/* Lexical is the one controlled exception: JSON state lives in the form field via Controller. */}
        <Controller control={control} name={`${base}.Description`} render={({ field, fieldState }) => (
          <RichTextEditor {...config} fieldName={field.name} invalid={Boolean(fieldState.error)} ariaLabel={t("admin.exTask.description")}
            ariaDescribedBy={descriptionError ? `${fieldId(descriptionPath)}-error` : undefined} value={field.value}
            onChange={(value) => { field.onChange(value); if (fieldState.error && richTextHasContent(value)) clearErrors(`${base}.Description`) }} disabled={lock} />
        )} />
        <FieldError path={descriptionPath} />
      </div>
    </section>
    {(!disabled || files.length > 0) && <><Separator /><AttachmentList ref={attachments} variantIndex={variantIndex} taskIndex={taskIndex} disabled={disabled} /></>}
    <Separator />
    <CheckSection variantIndex={variantIndex} taskIndex={taskIndex} />
    <Separator />
    <RequiresSection variantIndex={variantIndex} taskIndex={taskIndex} disabled={lock} />
    <Separator />
    <HintsEditor variantIndex={variantIndex} taskIndex={taskIndex} disabled={disabled} textsOnly={linked} editor={config} />
    {dialog}
  </div>
}
