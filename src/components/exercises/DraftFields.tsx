"use client"

import type { UseFormReturn } from "react-hook-form"
import { ChevronDown } from "lucide-react"
import { t } from "@/i18n/t"
import { VariantTabs } from "./VariantTabs"
import { TaskAccordion } from "./TaskAccordion"
import { TopologySection } from "./TopologySection"
import { Textarea } from "@/components/ui/textarea"
import { FieldHelp } from "@/components/ui/field-help"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { useEditorPosition } from "./EditorPosition"
import { InfrastructureBlockedNote } from "./EventBanners"

export function DraftVariants({ form, disabled, infrastructureBlocked = false }: {
  form: UseFormReturn<DraftFormValues>
  disabled: boolean
  /** The owner event forbids lab infrastructure: the topology editor is replaced by a note. */
  infrastructureBlocked?: boolean
}) {
  const [section, setSection] = useEditorPosition("section")
  return <section data-testid="draft-variants" className="flex min-h-[min(36rem,calc(100dvh-20rem))] min-w-0 flex-1 flex-col">
    <VariantTabs disabled={disabled} toolbar={() => <>
      <div role="tablist" aria-label={t("admin.exDraft.sections")} className="inline-flex h-9 items-center rounded-md bg-muted p-1">
        {(["tasks", "topology"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={section === value}
          onClick={() => setSection(value)}
          className={`h-7 rounded px-3 text-sm ${section === value ? "bg-card font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          {t(`admin.exDraft.tab.${value}`)}
        </button>)}
      </div>
    </>} renderVariant={(variantIndex) => <div data-variant-sections data-variant-index={variantIndex} className="min-h-[24rem] pt-2">
      <details key={variantIndex} className="group/notes mb-3 border-b border-border pb-2">
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
        {section === "tasks" ? <TaskAccordion variantIndex={variantIndex} disabled={disabled} />
          : infrastructureBlocked ? <InfrastructureBlockedNote />
          : <TopologySection variantIndex={variantIndex} disabled={disabled} />}
      </div>
    </div>} />
  </section>
}

