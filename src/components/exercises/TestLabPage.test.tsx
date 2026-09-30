import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { Exercise } from "@/api/exercises/catalog"
import type { DeployListItem, DeployStatus } from "@/api/exercises/deploy"
import type { Version } from "@/api/exercises/versions"

const h = vi.hoisted(() => ({ push: vi.fn(), download: vi.fn(), diagram: { last: null as unknown } }))

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, replace: vi.fn() }) }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock("./TopologyDiagram", () => ({
  TopologyDiagram: (p: { topology: { Devices: { ID: string; Name: string }[] }; onNodeSelect?: (key: string) => void; toolbarExtra?: React.ReactNode }) => {
    h.diagram.last = p
    return <div>{p.topology.Devices.map((d) => <button key={d.ID} type="button" onClick={() => p.onNodeSelect?.(d.ID)}>{`node ${d.Name}`}</button>)}{p.toolbarExtra}</div>
  },
}))
vi.mock("@/lib/downloadBlob", () => ({ downloadBlob: h.download }))
vi.mock("@/api/exercises/catalog", () => ({ getExercise: vi.fn() }))
vi.mock("@/api/exercises/versions", () => ({ getVersion: vi.fn() }))
vi.mock("@/api/exercises/deploy", () => ({
  listDeploys: vi.fn(), deployVariant: vi.fn(), deployStatus: vi.fn(), destroyDeploy: vi.fn(), openDeployLink: vi.fn(), checkDeployFlag: vi.fn(),
}))

import { getExercise } from "@/api/exercises/catalog"
import { checkDeployFlag, deployStatus, deployVariant, destroyDeploy, listDeploys, openDeployLink } from "@/api/exercises/deploy"
import { getVersion } from "@/api/exercises/versions"
import { ApiError } from "@/api/client"
import { OWNERSHIP } from "@/test/exerciseFixtures"
import { TestLabPage } from "./TestLabPage"

const exercise: Exercise = {
  ...OWNERSHIP, ID: "ex-1", Name: "Web 101", Description: "", Tags: [], DraftVersionID: "draft-1", PublishedVersionID: null,
  ArchivedAt: null, HasChanges: false, CreatedAt: "", CreatedBy: null, UpdatedAt: "", UpdatedBy: null,
}

const text = (value: string) => ({ type: "text", text: value, format: 0, version: 1 })
const variable = (name: string) => ({ type: "variable", varName: name, formats: [], version: 1 })
const doc = (...children: unknown[]) => ({ root: { type: "root", version: 1, children: [{ type: "paragraph", version: 1, children }] } })

const login = {
  ID: "t1", Name: "Login", Difficulty: "easy" as const, Flag: [], LinkedDeviceID: "", DeviceFlagVar: "",
  Description: doc(text("Scan "), variable("net"), text(" then open "), variable("site"), text(" or "), variable("panel")),
  Attachments: [{ FileID: "f1", Name: "notes.pdf" }],
  Placeholders: [
    { Key: "net", Kind: "vpn.subnet" as const },
    { Key: "site", Kind: "ip" as const, IPReference: "vpn", LastOctet: 5, AsLink: true, Scheme: "http", Port: 8080 },
    { Key: "panel", Kind: "external.link" as const, DeviceName: "web" },
  ],
  Hints: [
    { ID: "h1", Text: JSON.stringify(doc(text("Look at the robots file"))), Level: "nudge" as const },
    { ID: "h2", Text: "", Level: "steps" as const },
  ],
}
const second = { ...login, ID: "t2", Name: "Escalate", Description: doc(text("Second task body")), Attachments: [], Placeholders: [], Hints: [] }
const version: Version = {
  ID: "draft-1", ExerciseID: "ex-1", Status: "draft", AdminNote: "", Label: "", CreatedAt: "", CreatedBy: null, PublishedAt: null,
  Variants: [
    { ID: "v0", Index: 1, Note: "", Tasks: [], Topology: { VPN: { Enabled: false, DHCP: false }, Internet: { Enabled: false, DHCP: false }, Devices: [], Connections: [], VisualRender: null } },
    { ID: "v1", Index: 2, Note: "", Tasks: [login, second], Topology: { VPN: { Enabled: true, DHCP: false }, Internet: { Enabled: false, DHCP: false }, Connections: [], VisualRender: null,
      Devices: [{ ID: "dev-web", Name: "web", Type: "container", SecurityPreset: "", Image: "secret/image:1", Resources: { CPURequest: "1", MemoryRequest: "1Gi", CPULimit: "2", MemoryLimit: "2Gi" },
        Interfaces: [{ Name: "eth0", MAC: "", IP: { Type: "static", Addresses: [], AddressRef: { Network: "vpn", Host: 5 }, Gateway: "", Routes: [] } }],
        EnvVars: [{ Name: "K", Value: "topsecret", Secret: false, HasValue: true }], External: { Port: 443, Protocol: "https" } }] } },
  ],
}
const inHours = (h: number) => new Date(Date.now() + h * 3600_000 + 5000).toISOString()
const running: DeployListItem = {
  DeployID: "run-1", Lab: "lab", ExerciseID: "ex-1", VersionID: "draft-1", VariantID: "v1", CreatedAt: "2026-09-30T10:00:00Z", ExpiresAt: inHours(1),
  Tasks: [{ TaskID: "t1", Name: "Login" }],
}
const readyStatus: DeployStatus = {
  Phase: "Ready", Ready: true, VPNCIDR: "10.128.1.0/24", VPNConfig: "[Interface]\nPrivateKey = real-key\n",
  Access: [{ Device: "web", Port: 443, Protocol: "https", URL: "https://web-1.example.com" }],
}

const attached = { deploy: "run-1", version: null, variant: null }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getExercise).mockResolvedValue(exercise)
  vi.mocked(getVersion).mockResolvedValue(version)
  vi.mocked(listDeploys).mockResolvedValue([running])
  vi.mocked(deployStatus).mockResolvedValue(readyStatus)
  vi.mocked(destroyDeploy).mockResolvedValue(undefined)
})

describe("TestLabPage — states", () => {
  it("shows the crest loader while the page opens", () => {
    vi.mocked(listDeploys).mockReturnValue(new Promise(() => undefined))
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  it("shows the loader with the localized stage while the lab is provisioning, never the raw phase", async () => {
    vi.mocked(deployStatus).mockResolvedValue({ Phase: "Provisioning", Ready: false })
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    // the badge and the loader's stage line both say it
    expect((await screen.findAllByText("admin.exDeploy.phase.provisioning")).length).toBe(2)
    expect(screen.queryByText("Provisioning")).not.toBeInTheDocument()
    expect(screen.queryByText("Login")).not.toBeInTheDocument()
  })

  it("says the test is gone when the deploy is not listed", async () => {
    vi.mocked(listDeploys).mockResolvedValue([])
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    expect(await screen.findByText("admin.exTest.gone")).toBeInTheDocument()
    expect(deployStatus).not.toHaveBeenCalled()
  })

  it("shows the real reason when the exercise cannot be loaded, and retries", async () => {
    vi.mocked(getExercise).mockRejectedValueOnce(new ApiError(500, null, "boom"))
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    expect(await screen.findByText(/admin\.exTest\.loadFailed/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "error.load.retry" }))
    expect(await screen.findByRole("heading", { name: "Web 101" })).toBeInTheDocument()
  })

  it("shows the real deploy failure with LoadError when the lab fails", async () => {
    vi.mocked(deployStatus).mockResolvedValue({ Phase: "Failed", Ready: false })
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    expect(await screen.findByText("admin.exDeploy.failed")).toBeInTheDocument()
    // the bar's middle reads the localized state, not the raw word
    expect(screen.getByText("admin.exDeploy.phase.failed")).toBeInTheDocument()
    // the author can still end the failed lab
    expect(screen.getByRole("button", { name: "admin.exTest.end" })).toBeInTheDocument()
  })
})

describe("TestLabPage — bar", () => {
  it("shows the caption, the exercise, the progress and a countdown to the lease end", async () => {
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    expect(await screen.findByRole("heading", { name: "Web 101" })).toBeInTheDocument()
    expect(screen.getByText("admin.exTest.caption")).toBeInTheDocument()
    expect(screen.getByLabelText("admin.exTest.progressLabel 0 2")).toBeInTheDocument()
    const timer = screen.getByRole("timer")
    expect(timer).toHaveTextContent(/^[01]:\d\d:\d\d · admin\.exTest\.timerAvailable$/)
  })

  it("counts down and says the time is up at the lease end", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] })
    vi.mocked(listDeploys).mockResolvedValue([{ ...running, ExpiresAt: new Date(Date.now() + 3000).toISOString() }])
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(screen.getByRole("timer")).toHaveTextContent("0:00:02")
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(screen.getByRole("timer")).toHaveTextContent("admin.exTest.timerEnded")
    vi.useRealTimers()
  })

  it("is full-screen on its own: no back link to the catalog in the ready page", async () => {
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    await screen.findByRole("heading", { name: "Web 101" })
    expect(screen.queryByRole("link", { name: /admin\.exTest\.back/ })).not.toBeInTheDocument()
  })

  it("toggles the topology panel with an aria-pressed button and remembers it", async () => {
    window.localStorage.clear()
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    const toggle = await screen.findByRole("button", { name: "admin.exTest.topologyHide" })
    expect(toggle).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("region", { name: "admin.exTest.topology" })).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByRole("region", { name: "admin.exTest.topology" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "admin.exTest.topologyShow" })).toHaveAttribute("aria-pressed", "false")
    expect(window.localStorage.getItem("cib_lab_topology_shown")).toBe("false")
    window.localStorage.clear()
  })

  it("downloads the complete VPN config as cybericebox.conf", async () => {
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    fireEvent.click(await screen.findByRole("button", { name: "admin.exTest.vpnDownload" }))
    expect(h.download).toHaveBeenCalledTimes(1)
    const [blob, name] = h.download.mock.calls[0] as [Blob, string]
    expect(name).toBe("cybericebox.conf")
    expect(await blob.text()).toBe(readyStatus.VPNConfig)
  })

  it("keeps VPN as a text button with a shield icon (not wifi), and icon-only end/hint/web buttons", async () => {
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    const vpn = await screen.findByRole("button", { name: "admin.exTest.vpnDownload" })
    expect(vpn).toHaveTextContent("admin.exTest.vpnShort")
    expect(vpn.querySelector("svg")?.getAttribute("class")).toMatch(/shield/)
    expect(vpn.querySelector("svg")?.getAttribute("class")).not.toMatch(/wifi/)
    for (const name of ["admin.exTest.end", "admin.exTest.hintShowNamed 1"]) {
      expect(screen.getByRole("button", { name })).toHaveTextContent("")
    }
  })

  it("offers no VPN download when the lab has no config", async () => {
    vi.mocked(deployStatus).mockResolvedValue({ ...readyStatus, VPNConfig: undefined })
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    await screen.findByRole("heading", { name: "Web 101" })
    expect(screen.queryByRole("button", { name: "admin.exTest.vpnDownload" })).not.toBeInTheDocument()
  })

})

describe("TestLabPage — task as a participant sees it", () => {
  it("lists the variant's tasks and renders the chosen one with this lab's values", async () => {
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    const nav = await screen.findByRole("navigation", { name: "admin.exTest.tasks" })
    expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["1Login", "2Escalate"])
    expect(screen.getByRole("heading", { name: "Login" })).toBeInTheDocument()
    // the subnet is a CIDR, the IP link is an <a>, the external link is an <a> too
    expect(document.querySelector('[data-task-variable="net"]')).toHaveTextContent("10.128.1.0/24")
    const link = document.querySelector('[data-task-variable="site"]') as HTMLAnchorElement
    expect(link.tagName).toBe("A")
    expect(link.href).toBe("http://10.128.1.5:8080/")
    const button = document.querySelector('[data-task-variable="panel"]') as HTMLElement
    expect(button.tagName).toBe("A")
    expect(button.className).not.toMatch(/border|bg-|font-mono/)
    expect(button).toHaveTextContent("https://web-1.example.com")
  })

  it("opens the external link through the proxy", async () => {
    const tab = { location: { href: "" }, close: vi.fn(), opener: "self" }
    vi.stubGlobal("open", vi.fn(() => tab))
    vi.mocked(openDeployLink).mockResolvedValue({ URL: "https://web-1.example.com/_auth?t=y", ExpiresAt: "" })
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    await screen.findByRole("heading", { name: "Login" })
    fireEvent.click(document.querySelector('[data-task-variable="panel"]') as HTMLElement)
    await waitFor(() => expect(openDeployLink).toHaveBeenCalledWith("run-1", "web", 443))
    vi.unstubAllGlobals()
  })

  it("lists attachments for download and the hints as text", async () => {
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    const file = await screen.findByRole("link", { name: "admin.exTest.download notes.pdf" })
    expect(file).toHaveAttribute("download", "notes.pdf")
    expect(file.getAttribute("href")).toMatch(/\/api\/exercises\/files\/f1$/)
    // hints start collapsed; an empty hint is not listed
    expect(screen.getByText(/exercises\.hints\.level\.nudge/)).toBeInTheDocument()
    expect(screen.queryByText(/exercises\.hints\.level\.steps/)).not.toBeInTheDocument()
    expect(screen.queryByText("Look at the robots file")).not.toBeInTheDocument()
  })

  it("switches to another task", async () => {
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    fireEvent.click(await screen.findByRole("button", { name: /Escalate/ }))
    expect(screen.getByRole("heading", { name: "Escalate" })).toBeInTheDocument()
    expect(screen.getByText("Second task body")).toBeInTheDocument()
    // this task has no injected flag, so no check field
    expect(screen.queryByLabelText(/admin\.exDeploy\.flagInput/)).not.toBeInTheDocument()
  })

  it("checks the found flag: correct, then wrong", async () => {
    vi.mocked(checkDeployFlag).mockResolvedValueOnce({ Correct: true }).mockResolvedValueOnce({ Correct: false })
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    const input = await screen.findByLabelText(/admin\.exDeploy\.flagInput/)
    fireEvent.change(input, { target: { value: "FLAG{a}" } })
    fireEvent.click(screen.getByRole("button", { name: /admin\.exDeploy\.checkFlag/ }))
    expect(await screen.findByText(/admin\.exDeploy\.correct/)).toBeInTheDocument()
    // the task's number badge turns into a ✓ once the flag was right
    expect(screen.getByLabelText("admin.exTest.solved")).toBeInTheDocument()
    expect(checkDeployFlag).toHaveBeenCalledWith("run-1", "t1", "FLAG{a}")
    fireEvent.change(input, { target: { value: "FLAG{b}" } })
    fireEvent.click(screen.getByRole("button", { name: /admin\.exDeploy\.checkFlag/ }))
    expect(await screen.findByText(/admin\.exDeploy\.wrong/)).toBeInTheDocument()
  })

  it("reveals a hint on click, free and local, and keeps it revealed after switching tasks", async () => {
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    fireEvent.click(await screen.findByRole("button", { name: "admin.exTest.hintShowNamed 1" }))
    expect(screen.getByText("Look at the robots file")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "admin.exTest.hintShowNamed 1" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Escalate/ }))
    fireEvent.click(screen.getByRole("button", { name: /Login/ }))
    expect(screen.getByText("Look at the robots file")).toBeInTheDocument()
  })

  it("moves between stages with the links under the task", async () => {
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    await screen.findByRole("heading", { name: "Login" })
    expect(screen.queryByRole("button", { name: /stagePrev/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exTest.stageNext 2" }))
    expect(screen.getByRole("heading", { name: "Escalate" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /stageNext/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exTest.stagePrev 1" }))
    expect(screen.getByRole("heading", { name: "Login" })).toBeInTheDocument()
  })

  it("shows an empty state when the variant has no tasks", async () => {
    vi.mocked(listDeploys).mockResolvedValue([{ ...running, VariantID: "v0" }])
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    expect(await screen.findByText("admin.exTest.noTasks")).toBeInTheDocument()
  })
})

describe("TestLabPage — sidebar", () => {
  beforeEach(() => window.localStorage.clear())

  it("marks solved, current and unsolved tasks with number badges", async () => {
    vi.mocked(checkDeployFlag).mockResolvedValue({ Correct: true })
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    const nav = await screen.findByRole("navigation", { name: "admin.exTest.tasks" })
    const states = () => Array.from(nav.querySelectorAll("[data-task-number]")).map((n) => n.getAttribute("data-state"))
    expect(states()).toEqual(["current", "todo"])
    fireEvent.change(screen.getByLabelText(/admin\.exDeploy\.flagInput/), { target: { value: "FLAG{a}" } })
    fireEvent.click(screen.getByRole("button", { name: /admin\.exDeploy\.checkFlag/ }))
    await screen.findByText(/admin\.exDeploy\.correct/)
    expect(states()).toEqual(["solved", "todo"])
    expect(screen.getByLabelText("admin.exTest.progressLabel 1 2")).toBeInTheDocument()
  })

  it("collapses to number badges only and remembers the choice", async () => {
    const first = render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    const nav = await screen.findByRole("navigation", { name: "admin.exTest.tasks" })
    expect(within(nav).getByText("Escalate")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exTest.sidebarCollapse" }))
    expect(within(nav).queryByText("Escalate")).not.toBeInTheDocument()
    expect(within(nav).getByRole("button", { name: "Escalate" })).toHaveTextContent("2")
    expect(window.localStorage.getItem("cib_lab_sidebar_collapsed")).toBe("true")
    first.unmount()
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    expect(await screen.findByRole("button", { name: "admin.exTest.sidebarExpand" })).toHaveAttribute("aria-expanded", "false")
  })

  it("survives unavailable storage", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked") })
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    expect(await screen.findByRole("heading", { name: "Login" })).toBeInTheDocument()
    spy.mockRestore()
  })
})

describe("TestLabPage — topology", () => {
  it("never hands the panel an image, environment or resources", async () => {
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    await screen.findByRole("button", { name: "node web" })
    const shown = JSON.stringify((h.diagram.last as { topology: unknown }).topology)
    expect(shown).not.toMatch(/secret\/image|topsecret|2Gi/)
  })

  it("opens a device card with its lab address, service and web access, and opens the web link", async () => {
    const tab = { location: { href: "" }, close: vi.fn(), opener: "self" }
    vi.stubGlobal("open", vi.fn(() => tab))
    vi.mocked(openDeployLink).mockResolvedValue({ URL: "https://web-1.example.com/_auth?t=x", ExpiresAt: "" })
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    fireEvent.click(await screen.findByRole("button", { name: "node web" }))
    const card = screen.getByRole("region", { name: "admin.exTest.card.title" })
    expect(card).toHaveTextContent("eth0: 10.128.1.5")
    expect(card).toHaveTextContent("443/https")
    fireEvent.click(within(card).getByRole("button", { name: "admin.exTest.openWeb web" }))
    await waitFor(() => expect(tab.location.href).toBe("https://web-1.example.com/_auth?t=x"))
    expect(openDeployLink).toHaveBeenCalledWith("run-1", "web", 443)
    fireEvent.click(within(card).getByRole("button", { name: "admin.exTest.card.close" }))
    expect(screen.queryByRole("region", { name: "admin.exTest.card.title" })).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it("resizes with the splitter keys, the panel starting at task 4 : topology 5", async () => {
    window.localStorage.clear()
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    const bar = await screen.findByRole("separator")
    expect(bar).toHaveAttribute("aria-valuenow", "44")
    fireEvent.keyDown(bar, { key: "ArrowRight" })
    expect(bar).toHaveAttribute("aria-valuenow", "47")
    fireEvent.keyDown(bar, { key: "ArrowLeft" })
    fireEvent.keyDown(bar, { key: "ArrowLeft" })
    expect(bar).toHaveAttribute("aria-valuenow", "41")
    window.localStorage.clear()
  })
})

describe("TestLabPage — start and end", () => {
  it("starts the variant's deploy when opened with a version and a variant, and keeps the address reopenable", async () => {
    vi.mocked(deployVariant).mockResolvedValue({ DeployID: "run-1", Lab: "lab", Tasks: running.Tasks })
    const replace = vi.spyOn(window.history, "replaceState")
    render(<TestLabPage exerciseId="ex-1" initial={{ deploy: null, version: "draft-1", variant: "v1" }} />)
    expect(await screen.findByRole("heading", { name: "Login" })).toBeInTheDocument()
    expect(deployVariant).toHaveBeenCalledWith("ex-1", "draft-1", "v1")
    expect(listDeploys).toHaveBeenCalledWith("ex-1")
    await waitFor(() => expect(replace).toHaveBeenCalledWith(null, "", "/test?exercise=ex-1&deploy=run-1"))
    replace.mockRestore()
  })

  it("shows the real start failure and starts again on retry", async () => {
    vi.mocked(deployVariant).mockRejectedValueOnce(new ApiError(409, null, "no lab")).mockResolvedValueOnce({ DeployID: "run-1", Lab: "lab", Tasks: [] })
    render(<TestLabPage exerciseId="ex-1" initial={{ deploy: null, version: "draft-1", variant: "v1" }} />)
    expect(await screen.findByText(/admin\.exDeploy\.failedReason/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "error.load.retry" }))
    expect(await screen.findByRole("heading", { name: "Login" })).toBeInTheDocument()
    expect(deployVariant).toHaveBeenCalledTimes(2)
  })

  it("ends the test only after the danger confirmation, then returns to the exercise", async () => {
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    fireEvent.click(await screen.findByRole("button", { name: "admin.exTest.end" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("admin.exTest.endTitle")).toBeInTheDocument()
    expect(destroyDeploy).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole("button", { name: "admin.exTest.endConfirm" }))
    await waitFor(() => expect(destroyDeploy).toHaveBeenCalledWith("run-1"))
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/detail?id=ex-1"))
  })

  it("keeps the test and shows the error inside the dialog when ending fails", async () => {
    vi.mocked(destroyDeploy).mockRejectedValue(new ApiError(500, null, "x"))
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    fireEvent.click(await screen.findByRole("button", { name: "admin.exTest.end" }))
    const dialog = await screen.findByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "admin.exTest.endConfirm" }))
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument()
    expect(h.push).not.toHaveBeenCalled()
  })

  it("cancelling the confirmation leaves the lab alone", async () => {
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    fireEvent.click(await screen.findByRole("button", { name: "admin.exTest.end" }))
    const dialog = await screen.findByRole("dialog")
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "admin.exPage.dialog.cancel" })) })
    expect(destroyDeploy).not.toHaveBeenCalled()
  })

  it("leaving the page does not tear the lab down", async () => {
    const { unmount } = render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    await screen.findByRole("heading", { name: "Login" })
    unmount()
    expect(destroyDeploy).not.toHaveBeenCalled()
  })
})

describe("TestLabPage — answer card, solved state and VPN indicator", () => {
  beforeEach(() => window.localStorage.clear())

  it("titles the card «Answer» and gives no helper text", async () => {
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    expect(await screen.findByRole("heading", { name: "admin.exTest.flagTitle" })).toBeInTheDocument()
    expect(screen.getByPlaceholderText("admin.exDeploy.flagPlaceholder")).toBeInTheDocument()
    expect(screen.queryByText("admin.exDeploy.checkHelp")).not.toBeInTheDocument()
  })

  it("shows the tasks the server remembers as solved after a reload", async () => {
    vi.mocked(deployStatus).mockResolvedValue({ ...readyStatus, SolvedTaskIDs: ["t1"] })
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    const nav = await screen.findByRole("navigation", { name: "admin.exTest.tasks" })
    expect(Array.from(nav.querySelectorAll("[data-task-number]")).map((n) => n.getAttribute("data-state"))).toEqual(["solved", "todo"])
    expect(screen.getByLabelText("admin.exTest.progressLabel 1 2")).toBeInTheDocument()
    expect(screen.getByText(/admin\.exDeploy\.correct/)).toBeInTheDocument()
  })

  it("marks the VPN connected with a short tooltip, and not connected otherwise", async () => {
    const at = new Date(2026, 8, 30, 12, 0, 5)
    vi.mocked(deployStatus).mockResolvedValue({ ...readyStatus, VPNConnected: true, VPNLastHandshake: at.toISOString() })
    const first = render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    const vpn = await screen.findByRole("button", { name: "admin.exTest.vpnDownload" })
    expect(vpn).toHaveAttribute("data-vpn", "connected")
    expect(document.getElementById("lab-vpn-state")).toHaveTextContent(/^admin\.exTest\.vpnConnected$/)
    first.unmount()

    vi.mocked(deployStatus).mockResolvedValue(readyStatus)
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    expect(await screen.findByRole("button", { name: "admin.exTest.vpnDownload" })).toHaveAttribute("data-vpn", "disconnected")
    expect(document.getElementById("lab-vpn-state")).toHaveTextContent("admin.exTest.vpnDisconnected")
  })

  it("keeps polling a ready lab, keeping the page while it does", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      render(<TestLabPage exerciseId="ex-1" initial={attached} />)
      expect(await screen.findByRole("button", { name: "admin.exTest.vpnDownload" })).toHaveAttribute("data-vpn", "disconnected")
      vi.mocked(deployStatus).mockResolvedValue({ ...readyStatus, VPNConnected: true, VPNLastHandshake: new Date().toISOString() })
      await act(async () => { await vi.advanceTimersByTimeAsync(5100) })
      expect(screen.getByRole("button", { name: "admin.exTest.vpnDownload" })).toHaveAttribute("data-vpn", "connected")
      expect(screen.getByRole("heading", { name: "Login" })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("TestLabPage — task order", () => {
  it("shows the text, the files, the answer card and then the hints, the stage links last", async () => {
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    const article = (await screen.findByRole("heading", { name: "Login" })).closest("article")!
    const at = (node: Element | null) => node ? Array.from(article.querySelectorAll("*")).indexOf(node) : -1
    const files = screen.getByText("admin.exTest.attachments")
    const answer = screen.getByRole("heading", { name: "admin.exTest.flagTitle" })
    const hints = screen.getByText("exercises.hints.title")
    const stages = screen.getByRole("navigation", { name: "admin.exTest.stages" })
    expect([at(files), at(answer), at(hints), at(stages)]).toEqual([...[at(files), at(answer), at(hints), at(stages)]].sort((a, b) => a - b))
    expect(at(files)).toBeGreaterThan(0)
    expect(screen.getByPlaceholderText("admin.exDeploy.flagPlaceholder")).toBeInTheDocument()
  })
})

describe("TestLabPage — the author's arrangement of the topology", () => {
  const moved = () => (h.diagram.last as { onPositionChange: (key: string, p: { x: number; y: number }) => void; onLabelOffsetChange: (key: string, p: { x: number; y: number }) => void;
    onPortLabelOffsetChange: (key: string, p: { x: number; y: number }) => void; topology: { VisualRender: Record<string, Record<string, unknown>> | null } })
  beforeEach(() => window.localStorage.clear())

  it("keeps dragged devices and labels under the deploy id, applies them on reopen, never calls the backend", async () => {
    const first = render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    await screen.findByRole("button", { name: "node web" })
    act(() => { moved().onPositionChange("dev-web", { x: 0.2, y: 0.3 }); moved().onLabelOffsetChange("dev-web", { x: 1, y: 2 }); moved().onPortLabelOffsetChange('["dev-web","eth0"]', { x: 3, y: 4 }) })
    expect(JSON.parse(window.localStorage.getItem("cib_lab_layouts") ?? "null")).toEqual({
      "run-1": { nodes: { "dev-web": { x: 0.2, y: 0.3 } }, labels: { "dev-web": { x: 1, y: 2 } }, portLabels: { '["dev-web","eth0"]': { x: 3, y: 4 } } } })
    expect(moved().topology.VisualRender?.positions["dev-web"]).toEqual({ x: 0.2, y: 0.3 })
    first.unmount()

    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    await screen.findByRole("button", { name: "node web" })
    expect(moved().topology.VisualRender?.positions["dev-web"]).toEqual({ x: 0.2, y: 0.3 })
    expect(moved().topology.VisualRender?.labelOffsets["dev-web"]).toEqual({ x: 1, y: 2 })
  })

  it("resets the arrangement with the toolbar button and drops the key when nothing is left", async () => {
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    await screen.findByRole("button", { name: "node web" })
    act(() => moved().onPositionChange("dev-web", { x: 0.2, y: 0.3 }))
    fireEvent.click(screen.getByRole("button", { name: "admin.exTest.layoutReset" }))
    expect(window.localStorage.getItem("cib_lab_layouts")).toBeNull()
    expect(moved().topology.VisualRender).toBeNull()
  })

  it("forgets only the lab that ended, and removes the whole key when the map becomes empty", async () => {
    window.localStorage.setItem("cib_lab_layouts", JSON.stringify({
      "run-1": { nodes: { a: { x: 1, y: 1 } }, labels: {}, portLabels: {} }, "run-2": { nodes: { b: { x: 2, y: 2 } }, labels: {}, portLabels: {} } }))
    vi.mocked(destroyDeploy).mockResolvedValue(undefined)
    // run-2 is not among the active labs: pruned on open
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    await screen.findByRole("button", { name: "node web" })
    await waitFor(() => expect(Object.keys(JSON.parse(window.localStorage.getItem("cib_lab_layouts") ?? "{}"))).toEqual(["run-1"]))
    fireEvent.click(screen.getByRole("button", { name: "admin.exTest.end" }))
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "admin.exTest.endConfirm" }))
    await waitFor(() => expect(h.push).toHaveBeenCalled())
    expect(window.localStorage.getItem("cib_lab_layouts")).toBeNull()
  })

  it("works when storage is blocked", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked") })
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked") })
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    await screen.findByRole("button", { name: "node web" })
    act(() => moved().onPositionChange("dev-web", { x: 0.2, y: 0.3 }))
    expect(moved().topology.VisualRender?.positions["dev-web"]).toEqual({ x: 0.2, y: 0.3 })
    getItem.mockRestore()
    setItem.mockRestore()
  })
})

describe("TestLabPage — sidebar tooltips", () => {
  beforeEach(() => window.localStorage.clear())

  it("shows the full task name in the tooltip, expanded and collapsed", async () => {
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    const nav = await screen.findByRole("navigation", { name: "admin.exTest.tasks" })
    fireEvent.pointerEnter(within(nav).getByRole("button", { name: "Escalate" }))
    expect(screen.getByRole("tooltip")).toHaveTextContent("Escalate")
    fireEvent.pointerLeave(within(nav).getByRole("button", { name: "Escalate" }))
    fireEvent.click(screen.getByRole("button", { name: "admin.exTest.sidebarCollapse" }))
    const collapsedItem = within(nav).getByRole("button", { name: "Escalate" })
    expect(collapsedItem).not.toHaveTextContent("Escalate")
    fireEvent.pointerEnter(collapsedItem)
    expect(screen.getByRole("tooltip")).toHaveTextContent("Escalate")
  })
})

describe("TestLabPage — hints, long text and sidebar tooltip placement", () => {
  beforeEach(() => window.localStorage.clear())

  it("lists the hints below the answer as collapsed rows that expand on click", async () => {
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    const answer = await screen.findByRole("heading", { name: "admin.exTest.flagTitle" })
    const hints = screen.getByRole("heading", { name: "exercises.hints.title" })
    expect(answer.compareDocumentPosition(hints) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const row = screen.getByText(/exercises\.hints\.item 1/).closest("li")!
    expect(row).toHaveTextContent("exercises.hints.item 1")
    expect(screen.queryByText("Look at the robots file")).not.toBeInTheDocument()
    fireEvent.click(within(row).getByRole("button", { name: "admin.exTest.hintShowNamed 1" }))
    expect(within(row).getByText("Look at the robots file")).toBeInTheDocument()
  })

  it("lets a long link in the description wrap instead of being cut off", async () => {
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    const heading = await screen.findByRole("heading", { name: "Login" })
    expect(heading.closest("article")?.querySelector("[class*='overflow-wrap:anywhere']")).not.toBeNull()
  })

  it("puts the collapsed sidebar tooltip to the right of the badge, closed again after a click", async () => {
    window.localStorage.setItem("cib_lab_sidebar_collapsed", "true")
    render(<TestLabPage exerciseId="ex-1" initial={attached} />)
    const nav = await screen.findByRole("navigation", { name: "admin.exTest.tasks" })
    const item = within(nav).getByRole("button", { name: "Escalate" })
    fireEvent.pointerEnter(item)
    expect(screen.getByRole("tooltip").style.transform).toBe("translate(0, -50%)")
    fireEvent.pointerDown(item)
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    fireEvent.focus(item)
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })
})
