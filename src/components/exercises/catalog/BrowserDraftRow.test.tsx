import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

const h = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }))

import { BrowserDraftRow } from "./BrowserDraftRow"
import { emptyDraft } from "@/lib/exerciseSchemas"
import { pendingBufferKey, writePendingChanges } from "@/lib/exercisePendingBuffer"

function Row({ userId }: { userId: string | null }) {
  return <table><BrowserDraftRow userId={userId} columns={6} /></table>
}

const KEY = pendingBufferKey("u1", null)

beforeEach(() => {
  h.push.mockClear()
  const store = new Map<string, string>()
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)) },
    removeItem: (key: string) => { store.delete(key) },
  } })
})

describe("BrowserDraftRow", () => {
  it("renders nothing without a draft or with an untouched form", () => {
    const { container, rerender } = render(<Row userId="u1" />)
    expect(container.querySelector("tbody")).toBeNull()
    writePendingChanges(KEY, { Name: "", Description: "", Tags: [] }, emptyDraft())
    rerender(<Row userId="u1" />)
    expect(container.querySelector("tbody")).toBeNull()
  })

  it("shows the entered text as title and continues into the new editor", () => {
    writePendingChanges(KEY, { Name: "Qz", Description: "", Tags: [] }, emptyDraft())
    render(<Row userId="u1" />)
    expect(screen.getByText("admin.ex.localDraft.badge")).toBeInTheDocument()
    expect(screen.getByText("Qz")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.ex.localDraft.continue" }))
    expect(h.push).toHaveBeenCalledWith("/new?draft=continue")
  })

  it("is a warning-tinted table row and appears once the user is known", () => {
    writePendingChanges(KEY, { Name: "Qz", Description: "", Tags: [] }, emptyDraft())
    const { container, rerender } = render(<Row userId={null} />)
    expect(container.querySelector("tbody")).toBeNull()
    rerender(<Row userId="u1" />)
    expect(container.querySelector("tbody[data-unsaved-draft] tr")).toBeInTheDocument()
    expect(container.querySelector("td")).toHaveClass("bg-[var(--ib-warn-bg)]")
  })

  it("falls back to the untitled label", () => {
    writePendingChanges(KEY, { Name: "", Description: "some text", Tags: [] }, emptyDraft())
    render(<Row userId="u1" />)
    expect(screen.getByText("admin.ex.localDraft.untitled")).toBeInTheDocument()
  })

  it("deletes the draft only after the danger confirmation", () => {
    writePendingChanges(KEY, { Name: "Qz", Description: "", Tags: [] }, emptyDraft())
    render(<Row userId="u1" />)
    fireEvent.click(screen.getByRole("button", { name: "admin.ex.localDraft.delete" }))
    expect(screen.getByText("admin.ex.localDraft.deleteTitle")).toBeInTheDocument()
    expect(window.localStorage.getItem(KEY)).not.toBeNull()
    const confirm = screen.getAllByRole("button", { name: "admin.ex.localDraft.delete" }).at(-1)!
    fireEvent.click(confirm)
    expect(window.localStorage.getItem(KEY)).toBeNull()
    expect(screen.queryByText("admin.ex.localDraft.badge")).not.toBeInTheDocument()
  })
})
