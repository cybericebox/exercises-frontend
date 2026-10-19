import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Proposal } from "@/api/exercises/proposals"

const h = vi.hoisted(() => ({ isAdmin: true, canPublish: true }))

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/components/shell/AccessContext", () => ({
  useExerciseAccess: () => ({ access: { IsAdmin: h.isAdmin, CanCreateCatalog: h.isAdmin, CanPublish: h.canPublish, CanDelete: false, CanExport: false, CanImport: false, Events: [] }, loading: false }),
}))
vi.mock("@/lib/useRole", () => ({ useRole: () => ({ me: { Email: "viewer@cib.test" } }) }))
vi.mock("@/api/events/list", () => ({ listEventOptions: vi.fn().mockResolvedValue([]), listNearestEvents: vi.fn().mockResolvedValue([]), getEventOption: vi.fn().mockRejectedValue(new Error("missing")) }))
vi.mock("@/api/exercises/proposals", () => ({ listProposals: vi.fn(), approveProposal: vi.fn(), rejectProposal: vi.fn() }))

import { approveProposal, listProposals, rejectProposal } from "@/api/exercises/proposals"
import { ApiError } from "@/api/client"
import { toast } from "@/components/ui/toast"
import ProposalsPage from "./page"

const proposal: Proposal = {
  ID: "p1", ExerciseID: "e1", ExerciseName: "Header tricks", EventID: "ev1", EventName: "Winter CTF", Status: "pending",
  Note: "Worked well", ProposedBy: "u1", ProposedByName: "Olena K.", ProposedAt: "2026-09-20T10:00:00Z",
  DecidedAt: null, DecisionNote: "", CatalogExerciseID: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  h.isAdmin = true
  h.canPublish = true
  vi.mocked(listProposals).mockResolvedValue([proposal])
})

describe("proposals page", () => {
  it("lists pending proposals and switches status", async () => {
    render(<ProposalsPage />)
    expect(await screen.findByText("Header tricks")).toBeInTheDocument()
    expect(screen.getByText("Winter CTF")).toBeInTheDocument()
    expect(listProposals).toHaveBeenCalledWith("pending")
    fireEvent.click(screen.getByRole("radio", { name: "exercises.proposals.status.approved" }))
    await waitFor(() => expect(listProposals).toHaveBeenLastCalledWith("approved"))
  })

  it("approves with the prefilled name and links to the new catalog exercise", async () => {
    vi.mocked(approveProposal).mockResolvedValue({ ...proposal, Status: "approved", CatalogExerciseID: "c9" })
    render(<ProposalsPage />)
    fireEvent.click(await screen.findByRole("button", { name: "exercises.proposals.approve" }))
    expect(screen.getByLabelText(/^exercises\.proposals\.name/)).toHaveValue("Header tricks")
    fireEvent.click(screen.getByRole("radio", { name: /exercises.access.level.all/ }))
    fireEvent.click(screen.getAllByRole("button", { name: "exercises.proposals.approve" }).at(-1)!)
    await waitFor(() => expect(approveProposal).toHaveBeenCalledWith("p1", { Name: "Header tricks", AccessLevel: "all", EventIDs: [], Note: "" }))
    expect(await screen.findByRole("link", { name: "exercises.proposals.openCatalog" })).toHaveAttribute("href", "/detail?id=c9")
    expect(toast.success).toHaveBeenCalledWith("exercises.proposals.approvedToast")
  })

  it("rejects with a note", async () => {
    vi.mocked(rejectProposal).mockResolvedValue({ ...proposal, Status: "rejected" })
    render(<ProposalsPage />)
    fireEvent.click(await screen.findByRole("button", { name: "exercises.proposals.reject" }))
    fireEvent.change(screen.getByLabelText("exercises.proposals.rejectNote"), { target: { value: "Duplicate" } })
    fireEvent.click(screen.getAllByRole("button", { name: "exercises.proposals.reject" }).at(-1)!)
    await waitFor(() => expect(rejectProposal).toHaveBeenCalledWith("p1", "Duplicate"))
    await waitFor(() => expect(screen.queryByText("Header tricks")).not.toBeInTheDocument())
  })

  it("is closed to non-admins with the centered no-access screen", () => {
    h.isAdmin = false
    render(<ProposalsPage />)
    expect(screen.getByRole("heading", { name: "exercises.proposals.forbidden" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "auth.noAccess.switch" })).toBeInTheDocument()
    expect(listProposals).not.toHaveBeenCalled()
  })

  it("lists proposals for a read-only admin without the decisions the API would refuse", async () => {
    h.canPublish = false
    render(<ProposalsPage />)
    expect(await screen.findByText("Header tricks")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "exercises.proposals.approve" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "exercises.proposals.reject" })).not.toBeInTheDocument()
    expect(screen.queryByText("exercises.proposals.col.actions")).not.toBeInTheDocument()
  })

  it("names the running operation on the busy approve and reject buttons", async () => {
    vi.mocked(approveProposal).mockReturnValue(new Promise(() => {}))
    vi.mocked(rejectProposal).mockReturnValue(new Promise(() => {}))
    const { unmount } = render(<ProposalsPage />)
    fireEvent.click(await screen.findByRole("button", { name: "exercises.proposals.approve" }))
    fireEvent.click(screen.getAllByRole("button", { name: "exercises.proposals.approve" }).at(-1)!)
    expect(await screen.findByRole("button", { name: /exercises\.proposals\.approving/ })).toHaveAttribute("aria-busy", "true")
    unmount()
    render(<ProposalsPage />)
    fireEvent.click(await screen.findByRole("button", { name: "exercises.proposals.reject" }))
    fireEvent.click(screen.getAllByRole("button", { name: "exercises.proposals.reject" }).at(-1)!)
    expect(await screen.findByRole("button", { name: /exercises\.proposals\.rejecting/ })).toHaveAttribute("aria-busy", "true")
  })

  it("places a taken catalog name beside its input and clears it when edited", async () => {
    vi.mocked(approveProposal).mockRejectedValue(new ApiError(409, { Status: { Code: 40903 } }))
    render(<ProposalsPage />)
    fireEvent.click(await screen.findByRole("button", { name: "exercises.proposals.approve" }))
    fireEvent.click(screen.getAllByRole("button", { name: "exercises.proposals.approve" }).at(-1)!)
    const message = await screen.findByText("exercises.err.nameExists")
    const input = screen.getByLabelText(/^exercises\.proposals\.name/)
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAttribute("aria-describedby", message.id)
    expect(input.parentElement).toContainElement(message)
    expect(toast.error).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: "Another exercise" } })
    expect(screen.queryByText("exercises.err.nameExists")).not.toBeInTheDocument()
  })

})
