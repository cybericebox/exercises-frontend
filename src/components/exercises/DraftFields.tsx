"use client"

import { useState } from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { ChevronDown } from "lucide-react"
import { t } from "@/i18n/t"
import { VariantTabs } from "./VariantTabs"
import { TaskAccordion } from "./TaskAccordion"
import { TopologySection } from "./TopologySection"
import { Textarea } from "@/components/ui/textarea"
import { FieldHelp } from "@/components/ui/field-help"
import type { DraftFormValues, VariantFormValues } from "@/lib/exerciseSchemas"
import { SharedEditorPosition, useEditorPosition } from "./EditorPosition"
import { InfrastructureBlockedNote } from "./EventBanners"
import { ExerciseIdContext } from "./ExerciseIdContext"
import { Switch } from "@/components/ui/switch"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useLinkedVariantSync } from "./useLinkedVariantSync"
import { LinkedVariantsDialog } from "./LinkedVariantsDialog"

type DraftVariantsProps = {
  form: UseFormReturn<DraftFormValues>
  disabled: boolean
  /** The saved exercise the attachments belong to; null until the first save. */
  exerciseId: string | null
  /** The owner event forbids lab infrastructure: the topology editor is replaced by a note. */
  infrastructureBlocked?: boolean
}

export function DraftVariants(props: DraftVariantsProps) {
  // The bulk dialog selects the variants it adds, so this editor and its tabs share one position.
  return <SharedEditorPosition><DraftVariantsEditor {...props} /></SharedEditorPosition>
}

function DraftVariantsEditor({ form, disabled, exerciseId, infrastructureBlocked = false }: DraftVariantsProps) {
  const [section, setSection] = useEditorPosition("section")
  const [, setVariant] = useEditorPosition("variant")
  const [linkedOpen, setLinkedOpen] = useState(false)
  useLinkedVariantSync(form, !disabled)

  function appendLinked(created: VariantFormValues[]) {
    const current = form.getValues("Variants")
    // At once in the form; the autosave queue saves it.
    form.setValue("Variants", [...current, ...created], { shouldDirty: true })
    setVariant(current.length)
  }

  return <ExerciseIdContext.Provider value={exerciseId}><section data-testid="draft-variants" className="flex min-h-[min(36rem,calc(100dvh-20rem))] min-w-0 flex-1 flex-col">
    <VariantTabs disabled={disabled} onAddLinked={() => setLinkedOpen(true)} toolbar={() => <>
      <div role="tablist" aria-label={t("admin.exDraft.sections")} className="inline-flex h-9 items-center rounded-md bg-muted p-1">
        {(["tasks", "topology"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={section === value}
          onClick={() => setSection(value)}
          className={`h-7 rounded px-3 text-sm ${section === value ? "bg-card font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          {t(`admin.exDraft.tab.${value}`)}
        </button>)}
      </div>
    </>} renderVariant={(variantIndex) => <VariantPanel form={form} variantIndex={variantIndex} section={section}
      disabled={disabled} infrastructureBlocked={infrastructureBlocked} />} />
    {linkedOpen && <LinkedVariantsHost form={form} onClose={() => setLinkedOpen(false)} onCreate={appendLinked} />}
  </section></ExerciseIdContext.Provider>
}

/** Mounted only while the dialog is open, so watching every variant costs nothing the rest of the time. */
function LinkedVariantsHost({ form, onClose, onCreate }: {
  form: UseFormReturn<DraftFormValues>
  onClose: () => void
  onCreate: (created: VariantFormValues[]) => void
}) {
  const variants = useWatch({ control: form.control, name: "Variants" })
  return <LinkedVariantsDialog open variants={variants} onClose={onClose} onCreate={onCreate} />
}

/** One variant: its note, the link to a base (if any) and the selected section. */
function VariantPanel({ form, variantIndex, section, disabled, infrastructureBlocked }: {
  form: UseFormReturn<DraftFormValues>
  variantIndex: number
  section: "tasks" | "topology"
  disabled: boolean
  infrastructureBlocked: boolean
}) {
  // Position of the base this variant is linked to, or -1. compute keeps typing elsewhere from re-rendering.
  const baseIndex = useWatch({
    control: form.control,
    name: "Variants",
    compute: (variants: DraftFormValues["Variants"]) => {
      const linkedTo = variants?.[variantIndex]?.LinkedTo
      return linkedTo ? variants.findIndex((variant) => variant.ID !== "" && variant.ID === linkedTo) : -1
    },
  })
  const linked = baseIndex >= 0
  const [confirmUnlink, setConfirmUnlink] = useState(false)
  return <div data-variant-sections data-variant-index={variantIndex} className="min-h-[24rem] pt-2">
    {linked && <div data-testid="variant-link" className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border pb-2">
      <span className="flex items-center gap-1.5 text-sm font-medium leading-5 text-foreground">
        {t("admin.exDraft.linkedTo", { n: baseIndex + 1 })}
        <span className="flex h-5 items-center"><FieldHelp text={t("admin.exDraft.linkedHelp")} /></span>
      </span>
      <span className="flex items-center gap-2">
        <Switch id={`variant-unlink-${variantIndex}`} checked={false} disabled={disabled}
          onCheckedChange={(next) => { if (next) setConfirmUnlink(true) }} />
        <label htmlFor={`variant-unlink-${variantIndex}`} className="text-sm text-foreground">{t("admin.exDraft.unlink")}</label>
      </span>
    </div>}
    <details className="group/notes mb-3 border-b border-border pb-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1.5 leading-5">
          <span className="text-sm font-medium leading-5">{t("admin.exDraft.variantNoteShort")}</span>
          <span className="flex h-5 items-center" onClick={(event) => event.stopPropagation()}><FieldHelp text={t("admin.exDraft.variantNoteHelp")} /></span>
        </span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/notes:rotate-180" />
      </summary>
      <div className="pt-2">
        <label htmlFor={`variant-note-${variantIndex}`} className="sr-only">{t("admin.exDraft.variantNote")}</label>
        <Textarea id={`variant-note-${variantIndex}`} rows={5} {...form.register(`Variants.${variantIndex}.Note`)} disabled={disabled} />
      </div>
    </details>
    <div role="tabpanel" aria-label={t(`admin.exDraft.tab.${section}`)}>
      {section === "tasks" ? <TaskAccordion variantIndex={variantIndex} disabled={disabled} linked={linked} />
        : infrastructureBlocked ? <InfrastructureBlockedNote />
        : <TopologySection variantIndex={variantIndex} disabled={disabled || linked} />}
    </div>
    <ConfirmDialog open={confirmUnlink} onCancel={() => setConfirmUnlink(false)} tone="danger"
      title={t("admin.exDraft.unlinkTitle")}
      description={t("admin.exDraft.unlinkDescription", { n: variantIndex + 1, base: baseIndex + 1 })}
      cancelLabel={t("confirm.cancel")} confirmLabel={t("admin.exDraft.unlinkConfirm")}
      onConfirm={() => {
        form.setValue(`Variants.${variantIndex}.LinkedTo`, "", { shouldDirty: true })
        setConfirmUnlink(false)
      }} />
  </div>
}
