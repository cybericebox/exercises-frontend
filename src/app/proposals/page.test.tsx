import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Proposal } from "@/api/exercises/proposals"

const h = vi.hoisted(() => ({ isAdmin: true }))

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/components/shell/AccessContext", () => ({
  useExerciseAccess: () => ({ access: { IsAdmin: h.isAdmin, CanCreateCatalog: h.isAdmin, CanPublish: false, CanDelete: false, CanExport: false, Events: [] }, loading: false }),
}))
vi.mock("@/api/events/list", () => ({ listEventOptions: vi.fn().mockResolvedValue([]) }))
vi.mock("@/api/exercises/proposals", () => ({ listProposals: vi.fn(), approveProposal: vi.fn(), rejectProposal: vi.fn() }))

import { approveProposal, listProposals, rejectProposal } from "@/api/exercises/proposals"
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
    expect(screen.getByLabelText("exercises.proposals.name")).toHaveValue("Header tricks")
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

  it("is closed to non-admins", () => {
    h.isAdmin = false
    render(<ProposalsPage />)
    expect(screen.getByText("exercises.proposals.forbidden")).toBeInTheDocument()
    expect(listProposals).not.toHaveBeenCalled()
  })
})
