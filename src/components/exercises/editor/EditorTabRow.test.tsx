/**
 * The editor tab row on a phone (B7): at 390 px the row (358 px) is narrower than its tabs (449 px). It scrolls with its
 * scrollbar hidden, so it must show that more tabs follow (an edge fade, keyed by data-overflow) and keep the selected
 * tab fully in view.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { useForm } from "react-hook-form"
import { useState } from "react"
import fs from "node:fs"
import path from "node:path"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key}${JSON.stringify(vars)}` : key }))
vi.mock("./slots", () => ({ GeneralView: () => null, AllVariantsView: () => null, AddVariantWizard: () => null, DocumentDialog: () => null, TasksView: () => null, InfraView: () => null }))

import { emptyDraft, emptyVariant, type DraftFormValues } from "@/lib/exerciseSchemas"
import { DEFAULT_EDITOR_POSITION } from "@/lib/editorPosition"
import { EditorPositionProvider } from "../EditorPosition"
import { EditorProvider, useEditor, type EditorApi, type EditorPageData } from "./context"
import { EditorShell } from "./EditorShell"

function Api({ expose }: { expose: (api: EditorApi) => void }) {
  expose(useEditor())
  return null
}

function Harness({ expose }: { expose: (api: EditorApi) => void }) {
  const draft = emptyDraft()
  draft.Variants = [{ ...emptyVariant(1), ID: "a" }]
  const form = useForm<DraftFormValues>({ defaultValues: draft })
  const [position, setPosition] = useState(DEFAULT_EDITOR_POSITION)
  return <EditorPositionProvider position={position} onChange={(key, value) => setPosition((current) => ({ ...current, [key]: value }))}>
    <EditorProvider form={form} exerciseId="ex" disabled={false} infrastructureBlocked={false} showNotes={false} page={{} as EditorPageData} onGoToField={vi.fn()}>
      <Api expose={expose} />
      <EditorShell />
    </EditorProvider>
  </EditorPositionProvider>
}

// A layout model of the 390 px phone: the row shows 358 px; the tabs sit at fixed offsets inside the scrolled content.
const ROW = { left: 16, width: 358 }
const CONTENT = 449
const TABS: Record<string, [number, number]> = { general: [0, 80], "variant-trigger": [90, 250], tasks: [250, 340], infrastructure: [340, 449] }
const FADE = 24
let scrollLeft = 0
let content = CONTENT

function rect(left: number, width: number) {
  return { left, right: left + width, width, top: 0, bottom: 36, height: 36, x: left, y: 0, toJSON: () => ({}) } as DOMRect
}

function layout() {
  scrollLeft = 0
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) { return this.getAttribute("role") === "tablist" ? content : 0 })
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return this.getAttribute("role") === "tablist" ? ROW.width : 0 })
  vi.spyOn(HTMLElement.prototype, "scrollLeft", "get").mockImplementation(function (this: HTMLElement) { return this.getAttribute("role") === "tablist" ? scrollLeft : 0 })
  vi.spyOn(HTMLElement.prototype, "scrollLeft", "set").mockImplementation(function (this: HTMLElement, value: number) {
    if (this.getAttribute("role") === "tablist") scrollLeft = Math.max(0, Math.min(value, content - ROW.width))
  })
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.getAttribute("role") === "tablist") return rect(ROW.left, ROW.width)
    const tab = Object.entries(TABS).find(([value]) => this.id === `editor-${value}` || this.id.endsWith(`-${value}`))
    return tab ? rect(ROW.left + tab[1][0] - scrollLeft, tab[1][1] - tab[1][0]) : rect(0, 0)
  })
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); content = CONTENT })

const shown = (element: HTMLElement) => {
  const row = screen.getByRole("tablist").getBoundingClientRect()
  const box = element.getBoundingClientRect()
  return { clearOfStart: box.left >= row.left + FADE, clearOfEnd: box.right <= row.right - FADE, inside: box.left >= row.left && box.right <= row.right }
}
const trigger = () => screen.getByRole("button", { name: /ed\.shell\.variant\.trigger/ })

describe("editor tab row on a narrow screen", () => {
  it("marks the edge where more tabs are hidden, and follows the scroll", () => {
    layout()
    render(<Harness expose={() => {}} />)
    const row = screen.getByRole("tablist")
    expect(row).toHaveAttribute("data-overflow", "end")
    act(() => { scrollLeft = 45; fireEvent.scroll(row) })
    expect(row).toHaveAttribute("data-overflow", "both")
    act(() => { scrollLeft = CONTENT - ROW.width; fireEvent.scroll(row) })
    expect(row).toHaveAttribute("data-overflow", "start")
  })

  it("shows no fade when every tab fits", () => {
    content = ROW.width
    layout()
    render(<Harness expose={() => {}} />)
    expect(screen.getByRole("tablist")).not.toHaveAttribute("data-overflow")
  })

  it("scrolls the row so the selected last tab is fully visible", () => {
    layout()
    let api: EditorApi | undefined
    render(<Harness expose={(value) => { api = value }} />)
    act(() => api?.goTo({ tab: "infrastructure", variant: 0 }))
    const row = screen.getByRole("tablist").getBoundingClientRect()
    const tab = screen.getByRole("tab", { name: "ed.shell.tab.infrastructure" }).getBoundingClientRect()
    expect(tab.left).toBeGreaterThanOrEqual(row.left)
    expect(tab.right).toBeLessThanOrEqual(row.right)
    expect(screen.getByRole("tablist")).toHaveAttribute("data-overflow", "start")
  })

  it("keeps a middle tab clear of the edge fade", () => {
    layout()
    let api: EditorApi | undefined
    render(<Harness expose={(value) => { api = value }} />)
    act(() => api?.goTo({ tab: "tasks", variant: 0 }))
    expect(shown(screen.getByRole("tab", { name: "ed.shell.tab.tasks" })).clearOfEnd).toBe(true)
    expect(screen.getByRole("tablist")).toHaveAttribute("data-overflow", "both")
  })

  it("scrolls back for a tab at the start and for the variant dropdown of the all-variants view", () => {
    layout()
    let api: EditorApi | undefined
    render(<Harness expose={(value) => { api = value }} />)
    act(() => api?.goTo({ tab: "infrastructure", variant: 0 }))
    act(() => api?.goTo({ tab: "general" }))
    expect(scrollLeft).toBe(0)
    expect(screen.getByRole("tablist")).toHaveAttribute("data-overflow", "end")
    act(() => api?.goTo({ tab: "infrastructure", variant: 0 }))
    act(() => api?.goTo({ tab: "variants" }))
    expect(shown(trigger()).clearOfStart).toBe(true)
  })

  it("brings a focused tab into view", () => {
    layout()
    let api: EditorApi | undefined
    render(<Harness expose={(value) => { api = value }} />)
    act(() => api?.goTo({ tab: "infrastructure", variant: 0 }))
    act(() => trigger().focus())
    expect(shown(trigger()).clearOfStart).toBe(true)
  })

  it("follows a tab that changes size inside a row of the same width", () => {
    const callbacks: (() => void)[] = []
    const observed: Element[] = []
    vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { callbacks.push(callback) } observe(node: Element) { observed.push(node) } unobserve() {} disconnect() {} })
    layout()
    let api: EditorApi | undefined
    render(<Harness expose={(value) => { api = value }} />)
    act(() => api?.goTo({ tab: "infrastructure", variant: 0 }))
    expect(screen.getByRole("tablist")).toHaveAttribute("data-overflow", "start")
    expect(observed).toContain(trigger())
    // The variant label grows ("· separate" → "· based on 1"): the scroll range grows, the row does not.
    content = CONTENT + 40
    act(() => callbacks.forEach((callback) => callback()))
    expect(screen.getByRole("tablist")).toHaveAttribute("data-overflow", "both")
    expect(shown(screen.getByRole("tab", { name: "ed.shell.tab.infrastructure" })).inside).toBe(true)
  })

  it("fades the hidden edge in the stylesheet", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src/styles/exercise-general.css"), "utf8")
    for (const edge of ["end", "start", "both"]) expect(css).toMatch(new RegExp(`\\.editor-tablist\\[data-overflow=${edge}\\]\\s*\\{[^}]*mask-image:`))
  })
})
