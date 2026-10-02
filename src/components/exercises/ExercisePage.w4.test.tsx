import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ExerciseAccess } from "@/api/exercises/access"
import type { Exercise } from "@/api/exercises/catalog"
import type { Version } from "@/api/exercises/versions"

const h = vi.hoisted(() => ({
  push: vi.fn(),
  access: null as ExerciseAccess | null,
  returnUrl: null as string | null,
}))

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/lib/useRole", () => ({ useRole: () => ({ me: { ID: "user-1" }, isLoading: false, can: () => false }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock("@/components/shell/AccessContext", () => ({ useExerciseAccess: () => ({ access: h.access, loading: false }) }))
vi.mock("@/components/shell/ReturnContext", () => ({ useReturnContext: () => ({ returnUrl: h.returnUrl, eventId: null }) }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock("@/components/exercises/TaskAccordion", () => ({ TaskAccordion: () => <p>tasks panel</p> }))
vi.mock("@/components/exercises/TopologySection", () => ({ TopologySection: () => <p>topology panel</p> }))
vi.mock("@/api/exercises/capabilities", () => ({ getExerciseCapabilities: vi.fn().mockResolvedValue({ Laboratories: true }) }))
vi.mock("@/api/exercises/catalog", () => ({
  getExercise: vi.fn(), updateExercise: vi.fn(), createExercise: vi.fn(), updateExerciseKeepalive: vi.fn(),
  deleteExercise: vi.fn(), archiveExercise: vi.fn(), unarchiveExercise: vi.fn(), getExerciseUsage: vi.fn().mockResolvedValue({ Events: [] }),
  listExerciseTags: vi.fn().mockResolvedValue([]), setExerciseAccess: vi.fn(),
}))
vi.mock("@/api/exercises/deploy", () => ({ checkDeployFlag: vi.fn(),
  listDeploys: vi.fn().mockResolvedValue([]), deployVariant: vi.fn(), deployStatus: vi.fn().mockResolvedValue({ Phase: "Provisioning", Ready: false }),
  destroyDeploy: vi.fn().mockResolvedValue(undefined), openDeployLink: vi.fn(),
}))
vi.mock("@/api/exercises/proposals", () => ({ proposeExercise: vi.fn() }))
vi.mock("@/api/events/list", () => ({ listEventOptions: vi.fn().mockResolvedValue([{ ID: "ev9", Name: "Spring Cup", Tag: "spring" }]), listNearestEvents: vi.fn().mockResolvedValue([{ ID: "ev9", Name: "Spring Cup", Tag: "spring" }]), getEventOption: vi.fn().mockRejectedValue(new Error("missing")) }))
vi.mock("@/api/exercises/versions", () => ({
  EMPTY_VERSION_ID: "00000000-0000-0000-0000-000000000000",
  isStoredVersionId: (id: string) => id !== "" && id !== "00000000-0000-0000-0000-000000000000",
  getDraft: vi.fn(), getVersion: vi.fn(), saveDraft: vi.fn(), saveDraftKeepalive: vi.fn(), listVersions: vi.fn().mockResolvedValue([]),
  publishDraft: vi.fn(), createCheckpoint: vi.fn(), restoreVersion: vi.fn(),
}))

import { createExercise, getExercise, setExerciseAccess } from "@/api/exercises/catalog"
import { deployVariant, listDeploys } from "@/api/exercises/deploy"
import { proposeExercise } from "@/api/exercises/proposals"
import { getDraft, getVersion, listVersions, saveDraft } from "@/api/exercises/versions"
import { OWNERSHIP } from "@/test/exerciseFixtures"
import { ExercisePage } from "./ExercisePage"

const all = { CanRead: true, CanEdit: true, CanPublish: true, CanDelete: true, CanManageAccess: true, CanPropose: false, CanExport: true }
const managerRights = { CanRead: true, CanEdit: true, CanPublish: true, CanDelete: true, CanManageAccess: false, CanPropose: true, CanExport: false }
const base: Exercise = {
  ...OWNERSHIP,
  ID: "ex-1", Name: "Web 101", Description: "", Tags: [], DraftVersionID: null, PublishedVersionID: "pub-1",
  ArchivedAt: null, HasChanges: false, CreatedAt: "", CreatedBy: null, UpdatedAt: "", UpdatedBy: null,
}
const version: Version = {
  ID: "pub-1", ExerciseID: "ex-1", Status: "published", AdminNote: "", Label: "", CreatedAt: "", CreatedBy: null, PublishedAt: "2026-09-20T10:00:00Z", Resources: null, Elevation: null,
  Variants: [{ ID: "v1", Index: 1, Note: "", Tasks: [{ ID: "t1", Name: "Find it", Description: null, Difficulty: "easy", Flag: [], LinkedDeviceID: "",
    DeviceFlagVar: "", Attachments: [], Placeholders: [], Hints: [] }],
  Topology: { VPN: { Enabled: false, DHCP: true }, Internet: { Enabled: false, DHCP: true }, Devices: [], Connections: [], VisualRender: null } }],
}
const managerAccess: ExerciseAccess = {
  IsAdmin: false, CanCreateCatalog: false, CanPublish: false, CanDelete: false, CanExport: false,
  Events: [{ ID: "ev1", Name: "Winter CTF", Tag: "winter", CanWrite: true, InfrastructureAllowed: false },
    { ID: "ev2", Name: "Spring Cup", Tag: "spring", CanWrite: true, InfrastructureAllowed: true }],
}
const adminAccess: ExerciseAccess = { IsAdmin: true, CanCreateCatalog: true, CanPublish: true, CanDelete: true, CanExport: true, Events: [] }

beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  h.access = managerAccess
  h.returnUrl = null
  vi.mocked(getVersion).mockResolvedValue(version)
  vi.mocked(getDraft).mockResolvedValue({ ...version, ID: "draft-1", Status: "draft" })
})

describe("exercise editor — W4 rights", () => {
  it("shows a catalog exercise read-only to managers from its published version", async () => {
    h.returnUrl = "https://winter.cybericebox.local/manage/exercises"
    vi.mocked(getExercise).mockResolvedValue({ ...base, Permissions: { ...all, CanEdit: false, CanPublish: false, CanDelete: false, CanManageAccess: false } })
    render(<ExercisePage exerciseId="ex-1" versionId={null} />)
    expect(await screen.findByText("exercises.readOnly.banner")).toBeInTheDocument()
    expect(getVersion).toHaveBeenCalledWith("ex-1", "pub-1")
    expect(getDraft).not.toHaveBeenCalled()
    expect(listVersions).not.toHaveBeenCalled()
    expect(screen.getByRole("link", { name: "exercises.readOnly.toEvent" })).toHaveAttribute("href", h.returnUrl)
    expect(screen.queryByRole("button", { name: "admin.exPage.action.history" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "admin.exPage.action.edit" })).not.toBeInTheDocument()
  })

  it("lets a manager propose a published event exercise", async () => {
    vi.mocked(getExercise).mockResolvedValue({ ...base, Scope: "event", OwnerEventID: "ev2", OwnerEventName: "Spring Cup", AccessLevel: "", Permissions: managerRights })
    vi.mocked(proposeExercise).mockResolvedValue({
      ID: "p1", ExerciseID: "ex-1", ExerciseName: "Web 101", EventID: "ev2", EventName: "Spring Cup", Status: "pending", Note: "",
      ProposedBy: null, ProposedByName: "", ProposedAt: "", DecidedAt: null, DecisionNote: "", CatalogExerciseID: null,
    })
    render(<ExercisePage exerciseId="ex-1" versionId={null} />)
    expect(await screen.findByText("exercises.accessCol.event")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1 }).parentElement).toContainElement(screen.getByText("exercises.accessCol.event"))
    expect(getDraft).toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "exercises.propose.button" }))
    fireEvent.change(screen.getByLabelText("exercises.propose.note"), { target: { value: "Good for juniors" } })
    fireEvent.click(screen.getByRole("button", { name: "exercises.propose.submit" }))
    await waitFor(() => expect(proposeExercise).toHaveBeenCalledWith("ex-1", "Good for juniors"))
    expect(await screen.findByText("exercises.badge.pending")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "exercises.propose.button" })).toBeDisabled()
  })

  it("replaces the topology and test deploy when the owner event forbids infrastructure", async () => {
    vi.mocked(getExercise).mockResolvedValue({ ...base, Scope: "event", OwnerEventID: "ev1", OwnerEventName: "Winter CTF", AccessLevel: "", Permissions: managerRights })
    render(<ExercisePage exerciseId="ex-1" versionId={null} />)
    expect((await screen.findAllByText("exercises.infra.blocked")).length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.getByRole("button", { name: "admin.exPage.action.edit" })).toBeInTheDocument())
    expect(screen.getByRole("button", { name: "admin.exPage.action.test" })).toBeDisabled()
  })

  it("shows the author's running test lab and opens its page instead of starting a second", async () => {
    h.access = adminAccess
    vi.mocked(getExercise).mockResolvedValue({ ...base, AccessLevel: "all", Permissions: all })
    vi.mocked(listDeploys).mockResolvedValue([{ DeployID: "run-1", Lab: "lab", ExerciseID: "ex-1", VersionID: "draft-1", VariantID: "v1", CreatedAt: "2026-09-30T10:00:00Z", ExpiresAt: "2026-09-30T12:00:00Z",
      Tasks: [{ TaskID: "t1", Name: "Find it" }] }])
    render(<ExercisePage exerciseId="ex-1" versionId={null} />)

    expect(await screen.findByText("admin.exPage.test.running")).toBeInTheDocument()
    expect(listDeploys).toHaveBeenCalledWith("ex-1")
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.test.open" }))
    expect(h.push).toHaveBeenCalledWith("/test?exercise=ex-1&deploy=run-1")
    expect(deployVariant).not.toHaveBeenCalled()
  })

  it("lets admins set the access level of a catalog exercise", async () => {
    h.access = adminAccess
    vi.mocked(getExercise).mockResolvedValue({ ...base, AccessLevel: "all", Permissions: all })
    vi.mocked(setExerciseAccess).mockResolvedValue({ ...base, AccessLevel: "selected", AccessEventIDs: ["ev9"], Permissions: all })
    render(<ExercisePage exerciseId="ex-1" versionId={null} />)
    fireEvent.click(await screen.findByRole("button", { name: "exercises.access.button" }))
    fireEvent.click(screen.getByRole("radio", { name: /exercises.access.level.selected/ }))
    fireEvent.click(await screen.findByRole("checkbox", { name: /Spring Cup/ }))
    fireEvent.click(screen.getByRole("button", { name: "exercises.access.save" }))
    await waitFor(() => expect(setExerciseAccess).toHaveBeenCalledWith("ex-1", { AccessLevel: "selected", EventIDs: ["ev9"] }))
    expect(await screen.findByText("exercises.access.level.selected")).toBeInTheDocument()
  })
})

describe("new exercise — W4 owner", () => {
  it("creates in the requested event and shows the way back", async () => {
    h.returnUrl = "https://spring.cybericebox.local/manage/exercises"
    const created = { ...base, ID: "new-1", PublishedVersionID: null, Scope: "event" as const, OwnerEventID: "ev2", OwnerEventName: "Spring Cup", Permissions: managerRights }
    vi.mocked(createExercise).mockResolvedValue(created)
    vi.mocked(getExercise).mockResolvedValue(created)
    vi.mocked(saveDraft).mockResolvedValue({ ...version, ID: "draft-1", Status: "draft" })
    render(<ExercisePage exerciseId={null} versionId={null} eventId="ev2" />)
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText(/admin.ex.field.name/), { target: { value: "Buffer overflow" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(createExercise).toHaveBeenCalledWith({ Name: "Buffer overflow", Description: "", Tags: [], OwnerEventID: "ev2" })
    expect(screen.getByText("exercises.return.created")).toBeInTheDocument()
  })

  it("makes a manager with several events pick one before editing", () => {
    render(<ExercisePage exerciseId={null} versionId={null} />)
    expect(screen.getByText("exercises.owner.required")).toBeInTheDocument()
    expect(screen.getByLabelText(/admin.ex.field.name/)).toBeDisabled()
  })
})
