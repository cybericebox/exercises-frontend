import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { expect, it, vi } from "vitest"
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
