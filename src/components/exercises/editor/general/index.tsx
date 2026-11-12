"use client"

import { useState } from "react"
import { BarChart3, Plus } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { copyVariant } from "@/lib/linkedVariants"
import { toSaveDraftInput } from "@/lib/exerciseSchemas"
import { ExerciseGeneralFields } from "../../ExerciseGeneralFields"
import { ExerciseGeneralMetadata } from "../../ExerciseGeneralMetadata"
import { AllVariantsTable } from "../../AllVariantsTable"
import { LinkedVariantsDialog } from "../../LinkedVariantsDialog"
import { VariantStatsDialog } from "../../VariantStatsDialog"
import { useWatch } from "react-hook-form"
import type { DraftFormValues, VariantFormValues } from "@/lib/exerciseSchemas"
import { baseCandidates } from "@/lib/linkedVariants"
import { useEditor } from "../context"

/*
 * Package A. The foundation seeds each view with what the old editor showed, behind the final names, so the shell works
 * today; the package replaces the bodies (the exports and their (no) props stay).
 */

/** «Загальне»: the identity fields and the facts of the task. */
export function GeneralView() {
  const { form, page, disabled, showNotes } = useEditor()
  return <div className="editor-general">
    <ExerciseGeneralFields identityForm={page.identityForm} draftForm={form} disabled={disabled} readOnly={page.viewing} autoFocusName={page.autoFocusName} showNotes={showNotes} />
    {page.exercise && <ExerciseGeneralMetadata exercise={page.exercise} publishedVersion={page.publishedVersion} publishedAt={page.publishedAt}
      eventName={page.eventName} draftForm={form} status={page.status} resources={page.resources} usageEvents={page.usageEvents} />}
  </div>
}

/** «Усі варіанти»: the variants as a list; the weights; the add action (once). */
export function AllVariantsView() {
  const { form, exerciseId, disabled, selectVariant, goTo, openWizard } = useEditor()
  const [statsOpen, setStatsOpen] = useState(false)
  return <>
    <AllVariantsTable form={form} disabled={disabled} onOpen={(index) => { selectVariant(index); goTo({ tab: "tasks", variant: index }) }} actions={<>
      {exerciseId && <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setStatsOpen(true)}><BarChart3 aria-hidden="true" className="h-4 w-4" />{t("admin.exStats.open")}</Button>}
      {!disabled && <Button type="button" size="sm" className="gap-2" onClick={openWizard}><Plus aria-hidden="true" className="h-4 w-4" />{t("admin.exDraft.addVariant")}</Button>}
    </>} />
    {statsOpen && exerciseId && <VariantStatsDialog exerciseId={exerciseId} onClose={() => setStatsOpen(false)} />}
  </>
}

/** «Додати варіант»: a copy of the current variant, or one based on a saved variant. */
export function AddVariantWizard({ onClose }: { onClose: () => void }) {
  const { form, variantIndex, selectVariant, goTo } = useEditor()
  const [linkedOpen, setLinkedOpen] = useState(false)
  const variants = useWatch({ control: form.control, name: "Variants" })
  const canLink = baseCandidates(variants).length > 0
  const open = (index: number) => { selectVariant(index); goTo({ tab: "tasks", variant: index }) }
  function addCopy() {
    const current = form.getValues("Variants")
    form.setValue("Variants", [...current, copyVariant(current[variantIndex], current.length + 1)], { shouldDirty: true })
    open(current.length)
    onClose()
  }
  function appendLinked(created: VariantFormValues[]) {
    const current = form.getValues("Variants")
    form.setValue("Variants", [...current, ...created], { shouldDirty: true })
    open(current.length)
    onClose()
  }
  if (linkedOpen) return <LinkedVariantsDialog open variants={variants} onClose={onClose} onCreate={appendLinked} />
  return <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{t("admin.exDraft.addVariant")}</DialogTitle><DialogDescription className="sr-only">{t("admin.exDraft.addVariant")}</DialogDescription></DialogHeader>
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" className="h-auto justify-start whitespace-normal py-2 text-left" onClick={addCopy}>
          <span className="flex flex-col"><span>{t("admin.exDraft.addIndependent", { n: variantIndex + 1 })}</span><span className="text-xs font-normal text-muted-foreground">{t("admin.exDraft.addIndependentHint")}</span></span>
        </Button>
        <Button type="button" variant="outline" disabled={!canLink} className="h-auto justify-start whitespace-normal py-2 text-left" onClick={() => setLinkedOpen(true)}>
          <span className="flex flex-col"><span>{t("admin.exDraft.addBased")}</span><span className="text-xs font-normal text-muted-foreground">{canLink ? t("admin.exDraft.addBasedHint") : t("admin.exDraft.linkedNeedsSavedBase")}</span></span>
        </Button>
      </div>
    </DialogContent>
  </Dialog>
}

/** «Документ»: what the editor builds from the current state, read-only. */
export function DocumentDialog({ onClose }: { onClose: () => void }) {
  const { form } = useEditor()
  const values = form.getValues() as DraftFormValues
  return <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
    <DialogContent className="max-w-3xl">
      <DialogHeader><DialogTitle>{t("ed.shell.menu.document")}</DialogTitle><DialogDescription className="sr-only">{t("ed.shell.menu.document")}</DialogDescription></DialogHeader>
      <pre tabIndex={0} aria-label={t("ed.shell.menu.document")} className="max-h-[60dvh] overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-xs">{JSON.stringify(toSaveDraftInput(values), null, 2)}</pre>
      <div className="flex justify-end"><Button type="button" onClick={onClose}>{t("ed.ui.close")}</Button></div>
    </DialogContent>
  </Dialog>
}
