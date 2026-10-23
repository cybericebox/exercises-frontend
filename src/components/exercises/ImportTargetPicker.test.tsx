import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { expect, it, onTestFinished, vi } from "vitest"
vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/api/exercises/archiveImport", () => ({ listArchiveImportTargets: vi.fn() }))
import { listArchiveImportTargets } from "@/api/exercises/archiveImport"
import { ImportTargetPicker } from "./ImportTargetPicker"
it("searches server targets and continues its cursor, retaining owner context and explicit NEW", async () => {
 vi.mocked(listArchiveImportTargets).mockResolvedValueOnce({ Items: [{ ID: "one", Name: "Same", Scope: "event", OwnerEventID: "event", OwnerEventName: "Winter" } as never], Total: 2, NextCursor: "one" }).mockResolvedValueOnce({ Items: [{ ID: "two", Name: "Same", Scope: "event", OwnerEventID: "event", OwnerEventName: "Summer" } as never], Total: 2 })
 const choose = vi.fn()
 render(<ImportTargetPicker itemKey="folder" selected={null} onChange={choose} />)
 fireEvent.click(screen.getByRole("button", { name: /admin.exImport.update.new/ }))
 expect(await screen.findByText("Winter")).toBeInTheDocument()
 fireEvent.click(screen.getByRole("button", { name: "admin.exImport.update.more" }))
 expect(await screen.findByText("Summer")).toBeInTheDocument()
 await waitFor(() => expect(listArchiveImportTargets).toHaveBeenLastCalledWith({ search: "", cursor: "one" }, expect.any(AbortSignal)))
 fireEvent.click(screen.getByRole("button", { name: /Same Summer/ }))
 expect(choose).toHaveBeenCalledWith({ ItemKey: "folder", Mode: "update", ExerciseID: "two" }, expect.objectContaining({ ID: "two" }))
})
it("keeps a long list in a scrolling area under a pinned search, and ↑/↓ keep the focused option in view", async () => {
 vi.mocked(listArchiveImportTargets).mockResolvedValueOnce({ Items: Array.from({ length: 40 }, (_, index) => ({ ID: `t${index}`, Name: `Task ${index + 1}`, Scope: "catalog" }) as never), Total: 40 })
 const scrolled = vi.fn()
 const original = Element.prototype.scrollIntoView
 Element.prototype.scrollIntoView = scrolled
 onTestFinished(() => { Element.prototype.scrollIntoView = original })
 render(<ImportTargetPicker itemKey="folder" selected={null} onChange={vi.fn()} />)
 fireEvent.click(screen.getByRole("button", { name: /admin.exImport.update.new/ }))
 expect(await screen.findByText("Task 40")).toBeInTheDocument()
 const search = screen.getByRole("textbox", { name: "admin.exImport.update.search" })
 const list = screen.getByText("Task 1").closest(".exercise-import-picker-list")!
 expect(list).not.toContainElement(search)
 expect(list.parentElement).toHaveClass("exercise-import-picker")
 search.focus()
 fireEvent.keyDown(search, { key: "ArrowDown" })
 expect(document.activeElement).toHaveTextContent("admin.exImport.update.new")
 fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" })
 expect(document.activeElement).toHaveTextContent("Task 1")
 expect(scrolled).toHaveBeenLastCalledWith({ block: "nearest" })
 fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" })
 expect(document.activeElement).toHaveTextContent("admin.exImport.update.new")
})
