"use client"

import { ChevronDown, Plus, Table2 } from "lucide-react"
import { useWatch } from "react-hook-form"
import { t } from "@/i18n/t"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { cn } from "@/utils/cn"
import { useEditorPosition } from "../EditorPosition"
import { useEditor } from "./context"

type Row = { index: number; kind: string; weight: number }

/** Variants in menu order: each base is followed by the variants based on it; no indent, the text says the relation. */
function rowsOf(variants: { ID: string; LinkedTo: string; Weight: number }[]): Row[] {
  const rows: Row[] = []
  const kind = (index: number) => {
    const linkedTo = variants[index].LinkedTo
    const base = linkedTo ? variants.findIndex((candidate) => candidate.ID !== "" && candidate.ID === linkedTo) : -1
    return base >= 0 ? t("ed.shell.variant.basedOn", { base: base + 1 }) : index === 0 ? t("ed.shell.variant.main") : t("ed.shell.variant.separate")
  }
  const baseOf = (index: number) => variants.findIndex((candidate) => candidate.ID !== "" && candidate.ID === variants[index].LinkedTo)
  const add = (index: number) => {
    rows.push({ index, kind: kind(index), weight: variants[index].Weight })
    variants.forEach((variant, other) => { if (variant.LinkedTo !== "" && baseOf(other) === index) add(other) })
  }
  variants.forEach((variant, index) => { if (variant.LinkedTo === "" || baseOf(index) < 0) add(index) })
  return rows
}

/**
 * The variant dropdown of the tab row (B2, B3): «Варіант N ▾», its menu lists the variants (one of many: a dot in the
 * reserved left column, the weight on the right), then «Додати варіант» and «Усі варіанти».
 */
export function VariantMenu() {
  const { form, variantIndex, selectVariant, goTo, openWizard, disabled } = useEditor()
  const [tab] = useEditorPosition("tab")
  // Only what the menu shows (a string, so a keystroke inside a variant does not re-render it).
  const shown = useWatch({ control: form.control, name: "Variants", compute: (all: DraftFormValues["Variants"]) => JSON.stringify(all.map((v) => [v.ID, v.LinkedTo, v.Weight])) })
  const rows = rowsOf((JSON.parse(shown) as [string, string, number][]).map(([ID, LinkedTo, Weight]) => ({ ID, LinkedTo, Weight })))
  const kind = rows.find((row) => row.index === variantIndex)?.kind ?? ""
  const on = tab === "variants"
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" id="editor-variant-trigger" data-on={on || undefined} aria-pressed={on || undefined}
        aria-label={t("ed.shell.variant.trigger", { n: variantIndex + 1, kind })}
        className={cn("editor-vsel", on && "editor-vsel-on")}>
        <span className="editor-vsel-cap">{t("ed.shell.variant.caption")}</span><b>{variantIndex + 1}</b>
        <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-80 max-h-[60dvh] overflow-y-auto" aria-label={t("ed.shell.variant.menu")}>
      <DropdownMenuRadioGroup value={String(variantIndex)} onValueChange={(value) => { selectVariant(Number(value)); goTo({ tab: "tasks", variant: Number(value) }) }}>
        {rows.map((row) => <DropdownMenuRadioItem key={row.index} value={String(row.index)}>
          <span className="flex w-full items-baseline justify-between gap-6">
            <span className="whitespace-nowrap">{t("ed.shell.variant.option", { n: row.index + 1, kind: row.kind })}</span>
            <span className="whitespace-nowrap text-xs text-muted-foreground">{t("ed.shell.variant.weight", { n: row.weight })}</span>
          </span>
        </DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      {!disabled && <DropdownMenuItem className="gap-2" onSelect={openWizard}><Plus aria-hidden="true" className="h-4 w-4" />{t("ed.shell.variant.add")}</DropdownMenuItem>}
      <DropdownMenuItem className="gap-2" onSelect={() => goTo({ tab: "variants" })}><Table2 aria-hidden="true" className="h-4 w-4" />{t("ed.shell.variant.all")}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}
