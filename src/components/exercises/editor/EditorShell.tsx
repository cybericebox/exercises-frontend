"use client"

import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react"
import { GitBranch } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { toast } from "@/components/ui/toast"
import type { EditorTab } from "@/lib/editorPosition"
import { useEditorPosition } from "../EditorPosition"
import { ExerciseIdContext } from "../ExerciseIdContext"
import { useLinkedVariantSync } from "../useLinkedVariantSync"
import { IssuesDialog } from "./IssuesDialog"
import { VariantMenu } from "./VariantMenu"
import { useEditor } from "./context"
import { AddVariantWizard, AllVariantsView, DocumentDialog, GeneralView, InfraView, TasksView } from "./slots"

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

/** The width of the edge fade of the tab row (exercise-general.css); a tab brought into view clears it. */
const TAB_FADE = 24
const SELECTED_TAB = '[role="tab"][aria-selected="true"], #editor-variant-trigger[data-on]'

/** data-overflow names the edges of the row where tabs are hidden (end / start / both); none when every tab fits. */
function markOverflow(row: HTMLElement) {
  const max = row.scrollWidth - row.clientWidth
  const before = row.scrollLeft > 1
  const after = row.scrollLeft < max - 1
  const overflow = max <= 1 ? null : before && after ? "both" : before ? "start" : "end"
  if (overflow) row.setAttribute("data-overflow", overflow)
  else row.removeAttribute("data-overflow")
}

/** Scrolls only the row (never the page) so the tab is fully visible and clear of the edge fades. */
function reveal(row: HTMLElement, tab: HTMLElement | null) {
  if (tab && row.scrollWidth > row.clientWidth) {
    const box = row.getBoundingClientRect()
    const rect = tab.getBoundingClientRect()
    if (rect.right > box.right - TAB_FADE) row.scrollLeft += rect.right - box.right + TAB_FADE
    else if (rect.left < box.left + TAB_FADE) row.scrollLeft -= box.left + TAB_FADE - rect.left
  }
  markOverflow(row)
}

/**
 * The tab row scrolls sideways with its scrollbar hidden (a phone shows about 358 of its 449 px). It says so: the
 * stylesheet fades the edges data-overflow names. The selected tab (or the variant dropdown of the all-variants view)
 * is kept fully in view when it changes and when the row or a tab changes size; a focused tab is brought into view too.
 */
function useTabRowOverflow(row: RefObject<HTMLDivElement | null>, selected: string) {
  useEffect(() => {
    const element = row.current
    if (!element) return
    const update = () => markOverflow(element)
    const resized = () => reveal(element, element.querySelector<HTMLElement>(SELECTED_TAB))
    update()
    element.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", resized)
    // The row itself and every tab: a tab's label (the variant kind, a late web font) changes the scroll range alone.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resized)
    if (observer) [element, ...element.querySelectorAll<HTMLElement>(":scope > *, .editor-tab-group > *")].forEach((node) => observer.observe(node))
    return () => {
      element.removeEventListener("scroll", update)
      window.removeEventListener("resize", resized)
      observer?.disconnect()
    }
  }, [row])
  useEffect(() => {
    if (row.current) reveal(row.current, row.current.querySelector<HTMLElement>(SELECTED_TAB))
  }, [row, selected])
  return (event: FocusEvent<HTMLElement>) => {
    const tab = (event.target as HTMLElement).closest<HTMLElement>('[role="tab"], #editor-variant-trigger')
    if (row.current && tab) reveal(row.current, tab)
  }
}

/**
 * The editor below the header: ONE tab row — "General · [Variant N ▾] · Subtasks · Infrastructure" (B2) — and the
 * view of the open tab. “All variants” is a view reached from the dropdown, not a tab. The views are the packages'
 * (slots.ts); the shell only places them.
 */
export function EditorShell() {
  const uid = useId()
  const { form, exerciseId, disabled, variantIndex, dialog, closeDialog } = useEditor()
  const [tab, setTab] = useEditorPosition("tab")
  const tabRow = useRef<HTMLDivElement>(null)
  const revealFocused = useTabRowOverflow(tabRow, `${tab}:${variantIndex}`)
  useLinkedVariantSync(form, !disabled)
  // A variant's view starts afresh when another variant is chosen.
  const variantKey = form.getValues(`Variants.${variantIndex}.ID`) || `new-${variantIndex}`

  const tabButton = (value: Exclude<EditorTab, "variants">, label: string) => <button type="button" role="tab" id={`${uid}-${value}`} aria-selected={tab === value}
    aria-controls={`${uid}-${value}-panel`} tabIndex={tab === value ? 0 : -1} className="editor-tab" data-t={label} onClick={() => setTab(value)}>{label}</button>
  const panel = (value: EditorTab, labelledBy: string, children: ReactNode) => <div role="tabpanel" id={`${uid}-${value}-panel`} aria-labelledby={labelledBy} className="editor-panel">{children}</div>

  return <ExerciseIdContext.Provider value={exerciseId}>
    <div className="editor-tabs">
      <div ref={tabRow} role="tablist" aria-label={t("ed.shell.tabs.aria")} className="editor-tablist" onKeyDown={moveFocus} onFocus={revealFocused}>
        {tabButton("general", t("ed.shell.tab.general"))}
        <span className="editor-tabs-divider" aria-hidden="true" />
        <div role="group" className="editor-tab-group" aria-label={t("ed.shell.variant.group", { n: variantIndex + 1 })}>
          <VariantMenu />
          {tabButton("tasks", t("ed.shell.tab.tasks"))}
          {tabButton("infrastructure", t("ed.shell.tab.infrastructure"))}
        </div>
      </div>
    </div>
    {(tab === "tasks" || tab === "infrastructure") && <LinkedBar />}
    {/* “General” stays mounted: its fields keep their state while another view is open. */}
    <div role="tabpanel" id={`${uid}-general-panel`} aria-labelledby={`${uid}-general`} hidden={tab !== "general"} className="editor-panel"><GeneralView /></div>
    {tab === "variants" && panel("variants", "editor-variant-trigger", <AllVariantsView />)}
    {tab === "tasks" && panel("tasks", `${uid}-tasks`, <TasksView key={variantKey} />)}
    {tab === "infrastructure" && panel("infrastructure", `${uid}-infrastructure`, <InfraView key={variantKey} />)}
    {dialog === "wizard" && <AddVariantWizard onClose={closeDialog} />}
    {dialog === "document" && <DocumentDialog onClose={closeDialog} />}
    {dialog === "issues" && <IssuesDialog />}
  </ExerciseIdContext.Provider>
}

/** A variant based on another keeps from it everything but answers, files and images; the bar says so and offers to detach. */
function LinkedBar() {
  const { form, variantIndex, baseIndex, disabled } = useEditor()
  const [ask, setAsk] = useState(false)
  if (baseIndex < 0) return null
  const n = variantIndex + 1
  const base = baseIndex + 1
  return <>
    <div role="note" className="editor-linked-bar">
      <GitBranch aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span className="grow">{t("ed.shell.linked.note", { n, base })}</span>
      {!disabled && <Button type="button" variant="link" size="sm" className="h-auto p-0 text-[13px]" onClick={() => setAsk(true)}>{t("ed.shell.linked.detach")}</Button>}
    </div>
    <ConfirmDialog open={ask} tone="danger" onCancel={() => setAsk(false)}
      title={t("ed.shell.linked.title")} description={t("ed.shell.linked.description", { n, base })}
      cancelLabel={t("confirm.cancel")} confirmLabel={t("ed.shell.linked.detach")}
      onConfirm={() => { form.setValue(`Variants.${variantIndex}.LinkedTo`, "", { shouldDirty: true }); setAsk(false); toast.success(t("ed.shell.linked.done", { n })) }} />
  </>
}
