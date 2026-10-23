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
  Variants: [{ ID: "v1", Index: 1, Note: "", LinkedTo: "", Tasks: [{ ID: "t1", Name: "Find it", Description: null, Difficulty: "easy", Flag: [], LinkedDeviceID: "",
    DeviceFlagVar: "", Attachments: [], Placeholders: [], Hints: [] }],
  Topology: { VPN: { Enabled: false, DHCP: true }, Internet: { Enabled: false, DHCP: true }, Devices: [], Connections: [], VisualRender: null } }],
}
const managerAccess: ExerciseAccess = {
  IsAdmin: false, CanCreateCatalog: false, CanPublish: false, CanDelete: false, CanExport: true, CanImport: true,
  Events: [{ ID: "ev1", Name: "Winter CTF", Tag: "winter", CanWrite: true, InfrastructureAllowed: false },
    { ID: "ev2", Name: "Spring Cup", Tag: "spring", CanWrite: true, InfrastructureAllowed: true }],
}
const adminAccess: ExerciseAccess = { IsAdmin: true, CanCreateCatalog: true, CanPublish: true, CanDelete: true, CanExport: true, CanImport: true, Events: [] }

beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  h.access = managerAccess
  h.returnUrl = null
  vi.mocked(getVersion).mockResolvedValue(version)
  vi.mocked(getDraft).mockResolvedValue({ ...version, ID: "draft-1", Status: "draft" })
})

describe("exercise editor — W4 rights", () => {
  it.each([null, "history-1"])("keeps H1 and General on the selected snapshot (%s)", async (versionId) => {
    h.access = adminAccess
    vi.mocked(getExercise).mockResolvedValue({ ...base, Description:"Public description", Tags:["public"], Permissions:all })
    const selected = { ...version, Name:"Selected authored name", Description:"", Tags:[] }
    vi.mocked(getDraft).mockResolvedValue({ ...selected, ID:"draft-1", Status:"draft" })
    vi.mocked(getVersion).mockResolvedValue(selected)
    render(<ExercisePage exerciseId="ex-1" versionId={versionId} />)
    expect(await screen.findByRole("heading", { name:"Selected authored name", level:1 })).toBeInTheDocument()
    expect(screen.queryByText("Public description")).not.toBeInTheDocument()
    expect(screen.queryByText("public")).not.toBeInTheDocument()
    expect(screen.getByText("admin.exGeneral.noDescription")).toBeInTheDocument()
    expect(screen.getByText("admin.exGeneral.noTags")).toBeInTheDocument()
    if (!versionId) {
      fireEvent.click(screen.getByRole("button", { name:"admin.exPage.action.edit" }))
      expect(screen.getByLabelText(/admin.ex.field.name/)).toHaveValue("Selected authored name")
      fireEvent.change(screen.getByLabelText(/admin.ex.field.name/), { target:{ value:"New local name" } })
      expect(screen.getByRole("heading", { level:1 })).toHaveTextContent("New local name")
    }
  })

  it("hides draft notes and uses published authored fields for published-only access", async () => {
    vi.mocked(getExercise).mockResolvedValue({ ...base, Name:"Draft projection", Permissions:{ ...all, CanEdit:false, CanPublish:false, CanDelete:false, CanManageAccess:false } })
    vi.mocked(getVersion).mockResolvedValue({ ...version, Name:"Published authored name", Description:"Published text", Tags:["published"], AdminNote:"PRIVATE" })
    render(<ExercisePage exerciseId="ex-1" versionId={null} />)
    expect(await screen.findByRole("heading", { name:"Published authored name" })).toBeInTheDocument()
    expect(screen.getByText("Published text")).toBeInTheDocument()
    expect(screen.queryByText("PRIVATE")).not.toBeInTheDocument()
    expect(screen.queryByText("admin.ex.create.notes")).not.toBeInTheDocument()
    expect(screen.queryByText("admin.exPage.badge.changes")).not.toBeInTheDocument()
  })

  it.each(["denied", "unpublished", "archived", "history"])("omits event Propose when %s", async (reason) => {
    vi.mocked(getExercise).mockResolvedValue({ ...base, Scope:"event", OwnerEventID:"ev2", OwnerEventName:"Spring Cup", Permissions:{ ...managerRights, CanPropose:reason !== "denied" }, PublishedVersionID:reason === "unpublished" ? null : "pub-1", ArchivedAt:reason === "archived" ? "2026-10-21" : null })
    render(<ExercisePage exerciseId="ex-1" versionId={reason === "history" ? "history-1" : null} />)
    await screen.findByRole("heading", { level:1 })
    if (reason !== "history") fireEvent.keyDown(screen.getByRole("button", { name:"admin.exPage.action.more" }), { key:"ArrowDown" })
    expect(screen.queryByRole("menuitem", { name:"exercises.propose.button" })).not.toBeInTheDocument()
  })

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
    await screen.findByRole("heading", { level: 1 })
    fireEvent.keyDown(screen.getByRole("button", { name: "admin.exPage.action.more" }), { key: "ArrowDown" })
    expect(getDraft).toHaveBeenCalled()
    fireEvent.click(screen.getByRole("menuitem", { name: "exercises.propose.button" }))
    fireEvent.change(screen.getByLabelText("exercises.propose.note"), { target: { value: "Good for juniors" } })
    fireEvent.click(screen.getByRole("button", { name: "exercises.propose.submit" }))
    await waitFor(() => expect(proposeExercise).toHaveBeenCalledWith("ex-1", "Good for juniors"))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    fireEvent.keyDown(screen.getByRole("button", { name: "admin.exPage.action.more" }), { key: "ArrowDown" })
    expect(await screen.findByRole("menuitem", { name: "exercises.propose.button" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText("exercises.badge.pending")).toBeInTheDocument()
  })

  it("replaces the topology when the owner event forbids infrastructure", async () => {
    vi.mocked(getExercise).mockResolvedValue({ ...base, Scope: "event", OwnerEventID: "ev1", OwnerEventName: "Winter CTF", AccessLevel: "", Permissions: managerRights })
    render(<ExercisePage exerciseId="ex-1" versionId={null} />)
    expect((await screen.findAllByText("exercises.infra.blocked")).length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.getByRole("button", { name: "admin.exPage.action.edit" })).toBeInTheDocument())
    // The base variant has no devices, so its test needs no infrastructure and stays available.
    expect(screen.getByRole("button", { name: "admin.exPage.action.test" })).toBeEnabled()
  })

  it("disables a device-bearing variant in the test menu with the infrastructure reason when the owner event forbids it", async () => {
    const lab = { ...version.Variants[0], ID: "v2", Index: 2, Topology: { ...version.Variants[0].Topology,
      Devices: [{ ID: "dev-1", Name: "web", Type: "container", SecurityPreset: "", Image: "i", ResourcePreset: "max", Interfaces: [], EnvVars: [], External: null }] } }
    vi.mocked(getDraft).mockResolvedValue({ ...version, ID: "draft-1", Status: "draft", Variants: [version.Variants[0], lab] } as Version)
    vi.mocked(getExercise).mockResolvedValue({ ...base, Scope: "event", OwnerEventID: "ev1", OwnerEventName: "Winter CTF", AccessLevel: "", Permissions: managerRights })
    render(<ExercisePage exerciseId="ex-1" versionId={null} />)
    await waitFor(() => expect(screen.getByRole("button", { name: "admin.exPage.action.edit" })).toBeInTheDocument())
    fireEvent.keyDown(screen.getByRole("button", { name: "admin.exPage.action.test" }), { key: "ArrowDown" })
    const items = await screen.findAllByRole("menuitem")
    expect(items).toHaveLength(2)
    expect(items[0]).not.toHaveAttribute("aria-disabled", "true")
    expect(items[1]).toHaveAttribute("aria-disabled", "true")
    fireEvent.focus(items[1])
    expect(items[1]).toHaveAccessibleDescription("exercises.infra.blocked")
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
    await screen.findByRole("heading", { level: 1 })
    fireEvent.keyDown(screen.getByRole("button", { name: "admin.exPage.action.more" }), { key: "ArrowDown" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "exercises.access.button" }))
    fireEvent.click(screen.getByRole("radio", { name: /exercises.access.level.selected/ }))
    fireEvent.click(await screen.findByRole("checkbox", { name: /Spring Cup/ }))
    fireEvent.click(screen.getByRole("button", { name: "exercises.access.save" }))
    await waitFor(() => expect(setExerciseAccess).toHaveBeenCalledWith("ex-1", { AccessLevel: "selected", EventIDs: ["ev9"] }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    fireEvent.click(await screen.findByRole("button", { name: "exercises.access.level.selected" }))
    expect(await screen.findByRole("dialog", { name: "admin.exGeneral.access" })).toBeInTheDocument()
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


const withPublishedProperties = (network: boolean, heavy: boolean): Version => {
  const totals = { Devices:network ? 1 : 0, Blocks:1, CPUMillicores:1000, MemoryBytes:1073741824 }
  return { ...version, Resources:{ Min:totals, Max:totals, Variants:[], SpreadPercent:0, VariantsDiffer:false, Outside:[], ResourceHeavy:heavy },
    Variants:[{ ...version.Variants[0], Topology:{ ...version.Variants[0].Topology, Devices:network ? [{ ID:"pub-device", Name:"Published server", Type:"container", SecurityPreset:"", Image:"fixture", ResourcePreset:"", Interfaces:[], EnvVars:[], External:null }] : [] } }],
  }
}

describe("General published snapshot facts — review regressions", () => {
  it.each([false, true])("uses actual publication properties when published network/heavy=%s and draft card differs", async (publishedHasProperties) => {
    h.access = adminAccess
    vi.mocked(getExercise).mockResolvedValue({ ...base, Permissions:all, DraftVersionID:"draft-1", HasChanges:true, Infrastructure:!publishedHasProperties, ResourceHeavy:!publishedHasProperties })
    vi.mocked(getDraft).mockResolvedValue({ ...withPublishedProperties(!publishedHasProperties, !publishedHasProperties), ID:"draft-1", Status:"draft", Name:"Working task", PublishedAt:null })
    vi.mocked(getVersion).mockResolvedValue(withPublishedProperties(publishedHasProperties, publishedHasProperties))
    render(<ExercisePage exerciseId="ex-1" versionId={null} />)
    await screen.findByRole("heading", { name:"Working task" })
    // Wait for the actual current publication rather than confusing absence while loading with false.
    await waitFor(() => expect(document.querySelector("time[data-published]")).not.toBeNull())
    if (publishedHasProperties) {
            expect(document.querySelector("[data-heavy]")).not.toBeNull()
    } else {
            expect(document.querySelector("[data-heavy]")).toBeNull()
    }
    expect(getVersion).toHaveBeenCalledWith("ex-1", "pub-1")
    expect(getVersion).toHaveBeenCalledTimes(1)
  })

  it("keeps unknown publication separate from unpublished or draft properties", async () => {
    h.access = adminAccess
    let resolvePublished: (value:Version) => void = () => undefined
    vi.mocked(getExercise).mockResolvedValue({ ...base, Permissions:all, Infrastructure:true, ResourceHeavy:true })
    vi.mocked(getVersion).mockReturnValue(new Promise((resolve) => { resolvePublished = resolve }))
    render(<ExercisePage exerciseId="ex-1" versionId={null} />)
    await screen.findByRole("heading", { level:1 })
    expect(screen.getByText("admin.exPage.badge.published")).toBeInTheDocument()
    expect(screen.queryByText("admin.exPage.badge.none")).not.toBeInTheDocument()
    expect(document.querySelector("time[data-published]")).toBeNull()
    expect(document.querySelector("[data-heavy]")).toBeNull()
    expect(screen.getByText("admin.exGeneral.access")).toBeInTheDocument()
    await act(async () => { resolvePublished(withPublishedProperties(false, false)) })
    await waitFor(() => expect(document.querySelector("time[data-published]")).toHaveAttribute("datetime", version.PublishedAt))
  })

  it("does not substitute card flags when publication lookup fails", async () => {
    h.access = adminAccess
    vi.mocked(getExercise).mockResolvedValue({ ...base, Permissions:all, Infrastructure:true, ResourceHeavy:true })
    vi.mocked(getVersion).mockRejectedValue(new Error("synthetic publication unavailable"))
    render(<ExercisePage exerciseId="ex-1" versionId={null} />)
    await screen.findByRole("heading", { level:1 })
    await act(async () => {})
    expect(screen.getByText("admin.exPage.badge.published")).toBeInTheDocument()
    expect(document.querySelector("time[data-published]")).toBeNull()
    expect(document.querySelector("[data-heavy]")).toBeNull()
  })

  it("reuses the loaded published-only snapshot without another lookup", async () => {
    vi.mocked(getExercise).mockResolvedValue({ ...base, Infrastructure:false, ResourceHeavy:false, Permissions:{ ...all, CanEdit:false, CanPublish:false, CanDelete:false, CanManageAccess:false } })
    vi.mocked(getVersion).mockResolvedValue({ ...withPublishedProperties(true, true), Name:"Published reader task" })
    render(<ExercisePage exerciseId="ex-1" versionId={null} />)
    await screen.findByRole("heading", { name:"Published reader task" })
        expect(document.querySelector("[data-heavy]")).not.toBeNull()
    expect(getVersion).toHaveBeenCalledTimes(1)
    expect(getDraft).not.toHaveBeenCalled()
  })

  it.each([null, "2026-09-10T10:00:00Z"])("uses only selected historical PublishedAt=%s and hides current publication properties", async (selectedAt) => {
    h.access = adminAccess
    vi.mocked(getExercise).mockResolvedValue({ ...base, Permissions:all, Infrastructure:true, ResourceHeavy:true })
    vi.mocked(getVersion).mockResolvedValue({ ...withPublishedProperties(true, true), ID:"history-1", Name:"Selected historical task", Status:selectedAt ? "unpublished" : "checkpoint", PublishedAt:selectedAt })
    vi.mocked(listVersions).mockResolvedValue([{ ...version, VariantCount:1 }])
    render(<ExercisePage exerciseId="ex-1" versionId="history-1" />)
    await screen.findByRole("heading", { name:"Selected historical task" })
    await act(async () => {})
    if (selectedAt) expect(document.querySelector("time[data-published]")).toHaveAttribute("datetime", selectedAt)
    else expect(document.querySelector("time[data-published]")).toBeNull()
    expect(document.querySelector("[data-heavy]")).toBeNull()
  })

  it("ignores late publication responses after switching task or historical selection", async () => {
    h.access = adminAccess
    let resolveOld: (value:Version) => void = () => undefined
    vi.mocked(getExercise).mockResolvedValueOnce({ ...base, Permissions:all }).mockResolvedValue({ ...base, ID:"ex-2", PublishedVersionID:"pub-2", Permissions:all })
    vi.mocked(getVersion).mockImplementation(async (exerciseId, versionId) => {
      if (exerciseId === "ex-1") return new Promise<Version>((resolve) => { resolveOld = resolve })
      return { ...version, ExerciseID:exerciseId, ID:versionId, Name:"Second selected checkpoint", Status:"checkpoint", PublishedAt:null }
    })
    const { rerender } = render(<ExercisePage key="ex-1:working" exerciseId="ex-1" versionId={null} />)
    await screen.findByRole("heading", { name:"Web 101" })
    await waitFor(() => expect(getVersion).toHaveBeenCalledWith("ex-1", "pub-1"))
    // The owning detail route keys the screen by task/version; use the same boundary here.
    rerender(<ExercisePage key="ex-2:history" exerciseId="ex-2" versionId="checkpoint-2" />)
    await screen.findByRole("heading", { name:"Second selected checkpoint" })
    await act(async () => { resolveOld(withPublishedProperties(true, true)) })
    expect(screen.getByRole("heading", { level:1 })).toHaveTextContent("Second selected checkpoint")
    expect(document.querySelector("time[data-published]")).toBeNull()
    expect(document.querySelector("[data-heavy]")).toBeNull()
  })
})
