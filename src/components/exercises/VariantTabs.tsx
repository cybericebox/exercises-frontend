"use client"

import { useState } from "react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { Plus } from "lucide-react"
import { t } from "@/i18n/t"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { emptyTask, emptyVariant, type DraftFormValues } from "@/lib/exerciseSchemas"
import { hintsForNewVariant } from "@/lib/hintSync"
import { RemoveAction } from "./RemoveAction"
import { useEditorPosition } from "./EditorPosition"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

/**
 * VariantTabs — variant tabs on top of useFieldArray("Variants").
 * The tab header is a decorative number (position + 1); variant identity is ID.
 */
export function VariantTabs({
  disabled,
  renderVariant,
  toolbar,
}: {
  disabled: boolean
  renderVariant: (variantIndex: number) => React.ReactNode
  toolbar?: (variantIndex: number) => React.ReactNode
}) {
  const { control, getValues } = useFormContext<DraftFormValues>()
  const { fields, append, remove } = useFieldArray({ control, name: "Variants" })
  const [selected, setSelected] = useEditorPosition("variant")
  const [pendingRemoval, setPendingRemoval] = useState<number | null>(null)
  const active = Math.min(selected, Math.max(fields.length - 1, 0))

  function addVariant() {
    const variant = emptyVariant(fields.length + 1)
    // Task positions/IDs/difficulty are shared across variants. Content and
    // secrets are not: an alternate needs its own description and flags.
    variant.Tasks = getValues("Variants.0.Tasks").map((task) => ({
      ...emptyTask(), ID: task.ID, Name: task.Name, Difficulty: task.Difficulty, Hints: hintsForNewVariant(task.Hints ?? []),
    }))
    append(variant)
    setSelected(fields.length)
  }

  function removeVariant(index: number) {
    remove(index)
    setSelected(active > index ? active - 1 : Math.min(active, fields.length - 2))
  }

  return (
    <Tabs value={String(active)} onValueChange={(value) => setSelected(Number(value))} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border pb-3">
        <TabsList className="exercise-variant-tabs max-w-full min-w-0 justify-start overflow-x-auto">
          {fields.map((field, i) => (
            <TabsTrigger key={field.id} value={String(i)} className="exercise-variant-tab">
              {t("admin.exDraft.variant")} {i + 1}
            </TabsTrigger>
          ))}
        </TabsList>
        {/* Outside the tablist: a tab only selects. The action removes the variant that is open. */}
        {fields.length > 1 && !disabled && <RemoveAction ariaLabel={t("admin.exDraft.removeVariant")} className="h-8 w-8"
          onClick={() => setPendingRemoval(active)} />}
        {!disabled && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={addVariant}>
              <Plus className="mr-1 h-4 w-4" />
              {t("admin.exDraft.addVariant")}
            </Button>
          </>
        )}
        {toolbar && <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">{toolbar(active)}</div>}
      </div>
      {fields.map((field, i) => (
        <TabsContent key={field.id} value={String(i)} className="flex-1">
          {renderVariant(i)}
        </TabsContent>
      ))}
      <ConfirmDialog open={pendingRemoval !== null} onCancel={() => setPendingRemoval(null)} tone="danger"
        title={t("admin.exDraft.removeVariantTitle")}
        description={`${t("admin.exDraft.removeVariantDescription")}${pendingRemoval !== null ? ` ${t("admin.exDraft.variant")} ${pendingRemoval + 1}.` : ""}`}
        cancelLabel={t("admin.exDraft.removeVariantCancel")} confirmLabel={t("admin.exDraft.removeVariantConfirm")}
        onConfirm={() => {
          if (pendingRemoval !== null) removeVariant(pendingRemoval)
          setPendingRemoval(null)
        }} />
    </Tabs>
  )
}
