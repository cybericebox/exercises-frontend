"use client"

import { useId, useState, type KeyboardEvent, type ReactNode } from "react"
import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form"
import { BarChart3, ChevronDown, Ellipsis, Link2Off, Network, Plus, Table2, Trash2 } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useMediaQuery } from "@/components/shell/useMediaQuery"
import { FieldHelp } from "@/components/ui/field-help"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { Textarea } from "@/components/ui/textarea"
import type { DraftFormValues, VariantFormValues } from "@/lib/exerciseSchemas"
import type { EditorPosition } from "@/lib/editorPosition"
import { baseCandidates, copyVariant, dependentsOf, ownImages } from "@/lib/linkedVariants"
import { useEditorPosition } from "./EditorPosition"
import { ExerciseIdContext } from "./ExerciseIdContext"
import { InfrastructureBlockedNote } from "./EventBanners"
import { LinkedVariantsDialog } from "./LinkedVariantsDialog"
import { TaskAccordion } from "./TaskAccordion"
import { AllVariantsTable } from "./AllVariantsTable"
import { TopologySection } from "./TopologySection"
import { VariantStatsDialog } from "./VariantStatsDialog"
import { useLinkedVariantSync } from "./useLinkedVariantSync"

type Section = EditorPosition["section"]

type WorkspaceProps = {
  form: UseFormReturn<DraftFormValues>
  /** The «Загальне» tab: identity fields and the task's facts. */
  general: ReactNode
  disabled: boolean
  /** The saved exercise the attachments belong to; null until the first save. */
  exerciseId: string | null
  /** The owner event forbids lab infrastructure: the topology editor is replaced by a note. */
  infrastructureBlocked?: boolean
  /** The variant notes are internal: only full access (admins, the owner event's owners/managers) sees them. */
  showNotes?: boolean
  /** Beside the topology actions in the infrastructure mode (the task's resources). */
  resources?: ReactNode
}

/** Arrow keys, Home and End move between the tabs of one tab list (roving focus). */
function moveFocus(event: KeyboardEvent<HTMLElement>) {
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'))
  const index = tabs.indexOf((event.target as HTMLElement).closest<HTMLElement>('[role="tab"]') as HTMLElement)
  if (index < 0) return
  const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
    : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null
  if (next === null) return
  event.preventDefault()
  tabs[next].focus()
  tabs[next].click()
}

/**
 * The editor below the header: one row of tabs — «Загальне», then the variants by number (a variant is a whole
 * unit: its subtasks and its infrastructure) with «+» to add one — and the open tab's content. A variant has three
 * modes: subtasks, infrastructure and its note.
 */
export function EditorWorkspace({ form, general, disabled, exerciseId, infrastructureBlocked = false, showNotes = true, resources }: WorkspaceProps) {
  const uid = useId()
  // A phone has no room for a strip of numbers: the variants are one tab with a menu («Варіант 1 з 9 ⌄»).
  const phone = useMediaQuery("(max-width: 639px)", false)
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "Variants" })
  const [tab, setTab] = useEditorPosition("tab")
  const [selected, setSelected] = useEditorPosition("variant")
  const [linkedOpen, setLinkedOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const active = Math.min(selected, Math.max(fields.length - 1, 0))
  // Only the link structure: a keystroke inside a variant leaves it equal, so no re-render.
  const links = useWatch({ control: form.control, name: "Variants", compute: (variants: DraftFormValues["Variants"]) => variants.map((variant) => ({ ID: variant.ID, LinkedTo: variant.LinkedTo, Weight: variant.Weight })) })
  const canLink = baseCandidates(links).length > 0
  const baseOf = (index: number) => {
    const linkedTo = links[index]?.LinkedTo
    return linkedTo ? links.findIndex((variant) => variant.ID !== "" && variant.ID === linkedTo) : -1
  }
  useLinkedVariantSync(form, !disabled)

  function open(index: number) {
    setSelected(index)
    setTab("variants")
  }

  function addCopy() {
    append(copyVariant(form.getValues(`Variants.${active}`), fields.length + 1))
    open(fields.length)
  }

  function appendLinked(created: VariantFormValues[]) {
    const current = form.getValues("Variants")
    // At once in the form; the autosave queue saves it.
    form.setValue("Variants", [...current, ...created], { shouldDirty: true })
    open(current.length)
  }

  function removeVariant(index: number) {
    // Dependents keep their content and become independent before the base goes away.
    const baseId = form.getValues(`Variants.${index}.ID`)
    for (const dependent of dependentsOf(form.getValues("Variants"), baseId)) form.setValue(`Variants.${dependent}.LinkedTo`, "")
    remove(index)
    setSelected(active > index ? active - 1 : Math.min(active, fields.length - 2))
  }

  // The add-variant choices, shared by the «+» in the tab row and «Додати варіант» above the all-variants table.
  const addMenu = (align: "start" | "end") => <DropdownMenuContent align={align} className="w-80">
    <DropdownMenuItem className="flex-col items-start gap-0.5" onSelect={addCopy}>
      <span>{t("admin.exDraft.addIndependent", { n: active + 1 })}</span>
      <span className="text-xs text-muted-foreground">{t("admin.exDraft.addIndependentHint")}</span>
    </DropdownMenuItem>
    {canLink
      ? <DropdownMenuItem className="flex-col items-start gap-0.5" onSelect={() => setLinkedOpen(true)}>
        <span>{t("admin.exDraft.addBased")}</span>
        <span className="text-xs text-muted-foreground">{t("admin.exDraft.addBasedHint")}</span>
      </DropdownMenuItem>
      // Not `disabled`: Radix would drop it from keyboard focus, and the reason must stay reachable.
      : <HoverTooltip text={t("admin.exDraft.linkedNeedsSavedBase")} side="right" describe="always" className="w-full">
        <DropdownMenuItem aria-disabled="true" className="flex-col items-start gap-0.5 opacity-50" onSelect={(event) => event.preventDefault()}>
          <span>{t("admin.exDraft.addBased")}</span>
          <span className="text-xs text-muted-foreground">{t("admin.exDraft.addBasedHint")}</span>
        </DropdownMenuItem>
      </HoverTooltip>}
  </DropdownMenuContent>

  const variantLabel = (index: number) => {
    const base = baseOf(index)
    const label = base >= 0 ? t("admin.exDraft.variantBasedOn", { n: index + 1, base: base + 1 }) : t("admin.exDraft.variantN", { n: index + 1 })
    const weight = links[index]?.Weight ?? 1
    return weight > 1 ? t("admin.exDraft.labelWithWeight", { label, weight }) : label
  }
  const onVariants = tab === "variants"
  const onAll = tab === "all"
  return <ExerciseIdContext.Provider value={exerciseId}>
    <div className="editor-tabs">
      <div role="tablist" aria-label={t("admin.exDraft.editorTabs")} className="editor-tablist" onKeyDown={moveFocus}>
        <button type="button" role="tab" id={`${uid}-general`} aria-selected={tab === "general"} aria-controls={`${uid}-general-panel`} tabIndex={tab === "general" ? 0 : -1}
          className="editor-tab" onClick={() => setTab("general")}>{t("admin.ex.create.tab.general")}</button>
        <span className="editor-tabs-divider" aria-hidden="true" />
        {phone ? <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" role="tab" id={onAll ? `${uid}-all` : `${uid}-variant-${active}`} aria-selected={onVariants || onAll} aria-controls={onAll ? `${uid}-all-panel` : `${uid}-variant-panel`}
              tabIndex={onVariants || onAll ? 0 : -1} className="editor-tab editor-tab-picker">
              {onAll ? t("admin.exDraft.allVariants") : t("admin.exDraft.variantOf", { n: active + 1, count: fields.length })}<ChevronDown aria-hidden="true" className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[60dvh] w-72 overflow-y-auto">
            <DropdownMenuRadioGroup value={onAll ? "all" : onVariants ? String(active) : ""} onValueChange={(value) => value === "all" ? setTab("all") : open(Number(value))}>
              {fields.map((field, index) => <DropdownMenuRadioItem key={field.id} value={String(index)}>{variantLabel(index)}</DropdownMenuRadioItem>)}
              {fields.length > 1 && <DropdownMenuRadioItem value="all">{t("admin.exDraft.allVariants")}</DropdownMenuRadioItem>}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu> : <>
        <span className="editor-tabs-label" aria-hidden="true">{t("admin.exDraft.variantsCount", { count: fields.length })}</span>
        <div className="editor-variant-strip">
          {fields.map((field, index) => <HoverTooltip key={field.id} text={variantLabel(index)}>
            <button type="button" role="tab" id={`${uid}-variant-${index}`} aria-selected={onVariants && index === active} aria-controls={`${uid}-variant-panel`}
              aria-label={variantLabel(index)} tabIndex={onVariants && index === active ? 0 : -1}
              className="editor-tab editor-tab-number" onClick={() => open(index)}>{index + 1}</button>
          </HoverTooltip>)}
        </div>
        {fields.length > 1 && <HoverTooltip text={t("admin.exDraft.allVariants")}>
          <button type="button" role="tab" id={`${uid}-all`} aria-selected={onAll} aria-controls={`${uid}-all-panel`} aria-label={t("admin.exDraft.allVariants")} tabIndex={onAll ? 0 : -1}
            className="editor-tab editor-tab-icon" onClick={() => setTab("all")}><Table2 aria-hidden="true" className="h-4 w-4" /></button>
        </HoverTooltip>}
        </>}
      </div>
      {!disabled && <DropdownMenu>
        <HoverTooltip text={t("admin.exDraft.addVariant")}>
          <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={t("admin.exDraft.addVariant")}><Plus aria-hidden="true" className="h-4 w-4" /></Button></DropdownMenuTrigger>
        </HoverTooltip>
        {addMenu("start")}
      </DropdownMenu>}
    </div>
    <div role="tabpanel" id={`${uid}-general-panel`} aria-labelledby={`${uid}-general`} hidden={tab !== "general"} className="editor-panel">{general}</div>
    {onAll && <div role="tabpanel" id={`${uid}-all-panel`} aria-labelledby={`${uid}-all`} className="editor-panel"><AllVariantsTable form={form} disabled={disabled} onOpen={open} actions={<>
      {exerciseId && <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setStatsOpen(true)}><BarChart3 aria-hidden="true" className="h-4 w-4" />{t("admin.exStats.open")}</Button>}
      {!disabled && <DropdownMenu>
        <DropdownMenuTrigger asChild><Button type="button" size="sm" className="gap-2"><Plus aria-hidden="true" className="h-4 w-4" />{t("admin.exDraft.addVariant")}</Button></DropdownMenuTrigger>
        {addMenu("end")}
      </DropdownMenu>}
    </>} /></div>}
    {statsOpen && exerciseId && <VariantStatsDialog exerciseId={exerciseId} onClose={() => setStatsOpen(false)} />}
    {onVariants && fields[active] && <div role="tabpanel" id={`${uid}-variant-panel`} aria-labelledby={`${uid}-variant-${active}`} className="editor-panel">
      <VariantWorkspace key={fields[active].id} form={form} variantIndex={active} count={fields.length} baseIndex={baseOf(active)} weight={links[active]?.Weight ?? 1} disabled={disabled}
        exerciseId={exerciseId} infrastructureBlocked={infrastructureBlocked} showNotes={showNotes} resources={resources}
        onRemove={fields.length > 1 ? () => removeVariant(active) : undefined} />
    </div>}
    {linkedOpen && <LinkedVariantsHost form={form} onClose={() => setLinkedOpen(false)} onCreate={appendLinked} />}
  </ExerciseIdContext.Provider>
}

/** Mounted only while the dialog is open, so watching every variant costs nothing the rest of the time. */
function LinkedVariantsHost({ form, onClose, onCreate }: { form: UseFormReturn<DraftFormValues>; onClose: () => void; onCreate: (created: VariantFormValues[]) => void }) {
  const variants = useWatch({ control: form.control, name: "Variants" })
  return <LinkedVariantsDialog open variants={variants} onClose={onClose} onCreate={onCreate} />
}

const SECTIONS: Section[] = ["tasks", "topology", "note"]

/** One variant: the mode switch with what this variant is, its actions, and the open mode. */
function VariantWorkspace({ form, variantIndex, count, baseIndex, weight, disabled, exerciseId, infrastructureBlocked, showNotes, resources, onRemove }: {
  form: UseFormReturn<DraftFormValues>
  variantIndex: number
  count: number
  baseIndex: number
  /** Issue weight; shown in the summary when above 1. */
  weight: number
  disabled: boolean
  exerciseId: string | null
  infrastructureBlocked: boolean
  showNotes: boolean
  resources?: ReactNode
  onRemove?: () => void
}) {
  const uid = useId()
  const [stored, setSection] = useEditorPosition("section")
  const sections = showNotes ? SECTIONS : SECTIONS.filter((section) => section !== "note")
  const section = sections.includes(stored) ? stored : "tasks"
  const [confirm, setConfirm] = useState<"unlink" | "remove" | null>(null)
  const [statsOpen, setStatsOpen] = useState(false)
  const linked = baseIndex >= 0
  // A linked variant's own device images, by name (only the string: a keystroke elsewhere does not re-render).
  const ownImageNames = useWatch({ control: form.control, name: "Variants", compute: (variants: DraftFormValues["Variants"]) =>
    linked && variants[variantIndex] && variants[baseIndex] ? ownImages(variants[variantIndex], variants[baseIndex]).map((image) => image.Name).join(", ") : "" })
  const linkedSummary = t("admin.exDraft.summaryLinked", { base: baseIndex + 1 })
  const kind = linked ? ownImageNames ? t("admin.exDraft.summaryOwnImages", { summary: linkedSummary, devices: ownImageNames }) : linkedSummary
    : variantIndex === 0 ? count > 1 ? t("admin.exDraft.summaryFirst") : ""
    : t("admin.exDraft.summaryIndependent")
  const summary = kind && weight > 1 ? t("admin.exDraft.summaryWithWeight", { summary: kind, weight }) : kind
  const menu = !disabled && (linked || onRemove) || exerciseId
  return <div data-variant-sections data-variant-index={variantIndex} className="variant-workspace">
    <div className="variant-modebar">
      <div role="tablist" aria-label={t("admin.exDraft.sections")} className="variant-modes" onKeyDown={moveFocus}>
        {sections.map((value) => <button key={value} type="button" role="tab" id={`${uid}-tab-${value}`} aria-selected={section === value} aria-controls={`${uid}-panel`}
          tabIndex={section === value ? 0 : -1} onClick={() => setSection(value)} className="variant-mode">
          {value === "topology" && <Network aria-hidden="true" className="h-4 w-4" />}{t(`admin.exDraft.tab.${value}`)}
        </button>)}
      </div>
      {summary && <p className="variant-summary">{summary}</p>}
      {menu && <DropdownMenu>
        <HoverTooltip text={t("admin.exDraft.variantActions")}>
          <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="ml-auto" aria-label={t("admin.exDraft.variantActions")}><Ellipsis aria-hidden="true" className="h-4 w-4" /></Button></DropdownMenuTrigger>
        </HoverTooltip>
        <DropdownMenuContent align="end" className="w-64">
          {exerciseId && <DropdownMenuItem className="gap-2" onSelect={() => setStatsOpen(true)}><BarChart3 aria-hidden="true" className="h-4 w-4" />{t("admin.exStats.open")}</DropdownMenuItem>}
          {!disabled && linked && <DropdownMenuItem className="gap-2" onSelect={() => setConfirm("unlink")}><Link2Off aria-hidden="true" className="h-4 w-4" />{t("admin.exDraft.unlinkFrom", { base: baseIndex + 1 })}</DropdownMenuItem>}
          {!disabled && onRemove && <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onSelect={() => setConfirm("remove")}><Trash2 aria-hidden="true" className="h-4 w-4" />{t("admin.exDraft.removeVariant")}</DropdownMenuItem>
          </>}
        </DropdownMenuContent>
      </DropdownMenu>}
    </div>
    <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${section}`} className="variant-mode-panel">
      {section === "tasks" ? <TaskAccordion variantIndex={variantIndex} disabled={disabled} linked={linked} />
        : section === "note" ? <div className="variant-note">
          <span className="flex items-center gap-1"><label htmlFor={`variant-note-${variantIndex}`} className="text-sm font-medium">{t("admin.exDraft.variantNote")}</label><FieldHelp text={t("admin.exDraft.variantNoteHelp")} /></span>
          <Textarea id={`variant-note-${variantIndex}`} rows={6} {...form.register(`Variants.${variantIndex}.Note`)} disabled={disabled} />
        </div>
        : infrastructureBlocked ? <InfrastructureBlockedNote />
        : <TopologySection variantIndex={variantIndex} disabled={disabled || linked} toolbar={resources}
          linkedBaseIndex={linked ? baseIndex : undefined} imagesEditable={linked && !disabled} />}
    </div>
    {statsOpen && exerciseId && <VariantStatsDialog exerciseId={exerciseId} onClose={() => setStatsOpen(false)} />}
    <ConfirmDialog open={confirm === "unlink"} onCancel={() => setConfirm(null)} tone="danger"
      title={t("admin.exDraft.unlinkTitle")} description={t("admin.exDraft.unlinkDescription", { n: variantIndex + 1, base: baseIndex + 1 })}
      cancelLabel={t("confirm.cancel")} confirmLabel={t("admin.exDraft.unlinkConfirm")}
      onConfirm={() => { form.setValue(`Variants.${variantIndex}.LinkedTo`, "", { shouldDirty: true }); setConfirm(null) }} />
    <RemoveVariantConfirm open={confirm === "remove"} form={form} variantIndex={variantIndex} onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); onRemove?.() }} />
  </div>
}

function RemoveVariantConfirm({ open, form, variantIndex, onCancel, onConfirm }: { open: boolean; form: UseFormReturn<DraftFormValues>; variantIndex: number; onCancel: () => void; onConfirm: () => void }) {
  const dependents = open ? dependentsOf(form.getValues("Variants"), form.getValues(`Variants.${variantIndex}.ID`)).length : 0
  return <ConfirmDialog open={open} onCancel={onCancel} tone="danger"
    title={t("admin.exDraft.removeVariantTitle")}
    description={dependents > 0 ? t("admin.exDraft.removeBaseVariantDescription", { n: variantIndex + 1, count: dependents }) : t("admin.exDraft.removeVariantNDescription", { n: variantIndex + 1 })}
    cancelLabel={t("admin.exDraft.removeVariantCancel")} confirmLabel={t("admin.exDraft.removeVariantConfirm")}
    onConfirm={onConfirm} />
}
