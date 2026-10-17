"use client"

import { useState } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { ChevronDown, Plus } from "lucide-react"
import { t } from "@/i18n/t"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { emptyTask, emptyVariant, type DraftFormValues } from "@/lib/exerciseSchemas"
import { hintsForNewVariant } from "@/lib/hintSync"
import { RemoveAction } from "./RemoveAction"
import { useEditorPosition } from "./EditorPosition"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { baseCandidates, copyVariant, dependentsOf } from "@/lib/linkedVariants"

/**
 * VariantTabs — variant tabs on top of useFieldArray("Variants").
 * The tab header is a decorative number (position + 1); variant identity is ID.
 */
export function VariantTabs({
  disabled,
  renderVariant,
  toolbar,
  onAddLinked,
}: {
  disabled: boolean
  renderVariant: (variantIndex: number) => React.ReactNode
  toolbar?: (variantIndex: number) => React.ReactNode
  /** Opens the bulk linked-variants dialog; the menu item is hidden without it. */
  onAddLinked?: () => void
}) {
  const { control, getValues, setValue } = useFormContext<DraftFormValues>()
  const { fields, append, remove } = useFieldArray({ control, name: "Variants" })
  const [selected, setSelected] = useEditorPosition("variant")
  const [pendingRemoval, setPendingRemoval] = useState<number | null>(null)
  const active = Math.min(selected, Math.max(fields.length - 1, 0))
  const variants = useWatch({ control, name: "Variants" })
  const canLink = baseCandidates(variants).length > 0
  const pendingBaseId = pendingRemoval !== null ? variants[pendingRemoval]?.ID ?? "" : ""
  const pendingDependents = pendingRemoval !== null ? dependentsOf(variants, pendingBaseId).length : 0

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

  function addCopy() {
    append(copyVariant(getValues(`Variants.${active}`), fields.length + 1))
    setSelected(fields.length)
  }

  function removeVariant(index: number) {
    // Dependents keep their content and become independent before the base goes away.
    const baseId = getValues(`Variants.${index}.ID`)
    for (const dependent of dependentsOf(getValues("Variants"), baseId)) setValue(`Variants.${dependent}.LinkedTo`, "")
    remove(index)
    setSelected(active > index ? active - 1 : Math.min(active, fields.length - 2))
  }

  return (
    <Tabs value={String(active)} onValueChange={(value) => setSelected(Number(value))} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border pb-3">
        <TabsList className="exercise-variant-tabs max-w-full min-w-0 justify-start overflow-x-auto">
          {fields.map((field, i) => (
            <TabsTrigger key={field.id} value={String(i)} className="exercise-variant-tab">
              {t("admin.exDraft.variantN", { n: i + 1 })}
            </TabsTrigger>
          ))}
        </TabsList>
        {/* Outside the tablist: a tab only selects. The action removes the variant that is open. */}
        {fields.length > 1 && !disabled && <RemoveAction ariaLabel={t("admin.exDraft.removeVariant")} className="h-8 w-8"
          onClick={() => setPendingRemoval(active)} />}
        {!disabled && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Plus className="mr-1 h-4 w-4" />
                {t("admin.exDraft.addVariant")}
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={addVariant}>{t("admin.exDraft.addEmptyVariant")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={addCopy}>{t("admin.exDraft.copyVariant", { n: active + 1 })}</DropdownMenuItem>
              {onAddLinked && (canLink
                ? <DropdownMenuItem onSelect={onAddLinked}>{t("admin.exDraft.addLinkedVariants")}</DropdownMenuItem>
                // Not `disabled`: Radix would drop it from keyboard focus, and the reason must stay reachable.
                : <HoverTooltip text={t("admin.exDraft.linkedNeedsSavedBase")} side="right" describe="always">
                  <DropdownMenuItem aria-disabled="true" className="opacity-50" onSelect={(event) => event.preventDefault()}>
                    {t("admin.exDraft.addLinkedVariants")}
                  </DropdownMenuItem>
                </HoverTooltip>)}
            </DropdownMenuContent>
          </DropdownMenu>
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
        description={pendingRemoval === null ? t("admin.exDraft.removeVariantDescription")
          : pendingDependents > 0 ? t("admin.exDraft.removeBaseVariantDescription", { n: pendingRemoval + 1, count: pendingDependents })
            : t("admin.exDraft.removeVariantNDescription", { n: pendingRemoval + 1 })}
        cancelLabel={t("admin.exDraft.removeVariantCancel")} confirmLabel={t("admin.exDraft.removeVariantConfirm")}
        onConfirm={() => {
          if (pendingRemoval !== null) removeVariant(pendingRemoval)
          setPendingRemoval(null)
        }} />
    </Tabs>
  )
}
