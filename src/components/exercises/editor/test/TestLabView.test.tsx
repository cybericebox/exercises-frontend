import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))
vi.mock("@/components/ErrorPage", () => ({ ErrorPage: ({ title, body }: { title?: string; body?: string }) => <div role="alert">{title ?? body}</div> }))
vi.mock("@/components/exercises/NoRoomPanel", () => ({ NoRoomPanel: () => <div>no room</div> }))
vi.mock("@/components/exercises/TopologyDiagram", () => ({ TopologyDiagram: () => <div data-testid="diagram" /> }))
vi.mock("./ConsolePanel", () => ({ ConsolePanel: ({ device }: { device: string }) => <div data-testid="console">{device}</div> }))
vi.mock("@/components/exercises/AttachmentDownload", () => ({ AttachmentDownload: () => null }))
vi.mock("@/api/exercises/catalog", () => ({ getExercise: vi.fn() }))
vi.mock("@/api/exercises/versions", async (original) => ({ ...(await original<object>()), getVersion: vi.fn() }))
vi.mock("@/api/exercises/capabilities", () => ({ getExerciseCapabilities: vi.fn() }))
vi.mock("@/api/exercises/deploy", () => ({
  listDeploys: vi.fn(), deployStatus: vi.fn(), deployVariant: vi.fn(), destroyDeploy: vi.fn(), extendDeploy: vi.fn(), openDeployLink: vi.fn(),
  checkDeployFlag: vi.fn(), runDeployChecks: vi.fn(), resetDeployDevice: vi.fn(), setDeployDeviceRescue: vi.fn(),
}))

import { checkDeployFlag, deployStatus, deployVariant, destroyDeploy, listDeploys, type DeployListItem, type DeployStatus } from "@/api/exercises/deploy"
import { getExerciseCapabilities } from "@/api/exercises/capabilities"
import { getExercise } from "@/api/exercises/catalog"
import { getVersion } from "@/api/exercises/versions"
import { t } from "@/i18n/t"
import { TestLabView } from "./TestLabView"

const device = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  ID: id, Name: name, Type: "node", Profile: "container", Image: "x", ResourcePreset: "small", Interfaces: [], Command: [], Args: [], Persistence: null,
  Access: [{ Kind: "terminal" }], Bootstrap: { Timeout: "30s", Env: [], Files: [], Script: "", Interpreter: "" }, ...extra,
})
const variant = {
  ID: "var1", Index: 1, Note: "", Weight: 1,
  Tasks: [
    { ID: "t1", Key: "theory", Name: "Протокол", Difficulty: "easy", Requires: [], Description: null, Attachments: [], Placeholders: [], Hints: [], Check: { Answer: { Type: "text", Values: [] } } },
    { ID: "t2", Key: "ospf", Name: "Налаштуйте OSPF", Difficulty: "medium", Requires: ["theory"], Description: null, Attachments: [], Placeholders: [], Hints: [],
      Check: { State: { Mode: "once", Interval: "30s", Manual: true, Conditions: [{ DeviceID: "d1", Process: { Name: "ospfd" } }, { DeviceID: "d1", Port: { Port: 2604 } }] } } },
  ],
  Topology: { Variables: [], Devices: [device("d1", "r1"), device("d2", "srv"), device("g1", "attack", { Type: "vpn_gateway", DHCP: true, DHCPRanges: [], Interfaces: [], Access: [] })], Connections: [], VisualRender: null },
}
const item: DeployListItem = { DeployID: "d1", Lab: "", ExerciseID: "ex1", VersionID: "v1", VariantID: "var1", CreatedAt: "2026-11-12T10:00:00Z", ExpiresAt: new Date(Date.now() + 3_600_000).toISOString(), Tasks: [] }
const status = (extra: Partial<DeployStatus>): DeployStatus => ({ Phase: "Provisioning", Ready: false, Gateways: [], ExpiresAt: item.ExpiresAt, ...extra })
const ready = (extra: Partial<DeployStatus> = {}) => status({ Phase: "Ready", Ready: true, VPNConfig: "x", VPNConnected: false,
  Gateways: [{ Name: "attack", Kind: "vpn" as const, CIDR: "10.128.1.0/24", Ready: true }],
  Devices: [{ Name: "r1", Ready: true }, { Name: "srv", Ready: true }], ...extra })

function open(initial = { deploy: "d1" as string | null, version: null as string | null, variant: null as string | null, minutes: null as number | null }) {
  return render(<TestLabView exerciseId="ex1" initial={initial} />)
}

describe("TestLabView", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    window.localStorage.clear()
    window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia
    vi.mocked(listDeploys).mockResolvedValue([item])
    vi.mocked(getExercise).mockResolvedValue({ ID: "ex1", Name: "Маршрутизація" } as never)
    vi.mocked(getVersion).mockResolvedValue({ Variants: [variant], Resources: null } as never)
    vi.mocked(getExerciseCapabilities).mockResolvedValue({ Laboratories: true } as never)
  })

  it("queue: the first stage is the crest in the block with the place in the queue, and the tasks can already be read", async () => {
    vi.mocked(deployStatus).mockResolvedValue(status({ Phase: "Queued", Devices: [], Queue: { Position: 2, Length: 3, Reason: "WaitingForTurn", Message: "", Pods: 3, Pending: 3 } }))
    open()
    expect(await screen.findByText(t("ed.d.dock.queue", { position: 2, length: 3 }))).toBeTruthy()
    expect(screen.getByRole("status", { name: t("ed.d.chip.creating") })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 2, name: "Протокол" })).toBeTruthy()
    // the check stands by instead of vanishing
    expect(screen.getByText(t("ed.d.check.wait"))).toBeTruthy()
  })

  it("starting: every device with its stage, and the initialization attempt of the one that retries", async () => {
    vi.mocked(deployStatus).mockResolvedValue(status({ Devices: [{ Name: "r1", Ready: true }, { Name: "srv", Ready: false, Bootstrap: { Phase: "pending", Attempts: 2, Reason: "" } }] }))
    open()
    expect(await screen.findByText(t("ed.d.dev.initializing", { n: 2, max: 3 }))).toBeTruthy()
    expect(screen.getByRole("status", { name: t("ed.d.chip.starting", { ready: 1, total: 3 }) })).toBeTruthy()
    expect(screen.getByText(t("ed.d.dock.elapsed", { time: "00:00" }))).toBeTruthy()
  })

  it("a lab without a VPN gateway has no VPN button, one with a VPN gateway has it before the status arrives", async () => {
    const noGateway = { ...variant, Topology: { ...variant.Topology, Devices: variant.Topology.Devices.filter((entry) => entry.Type === "node") } }
    vi.mocked(getVersion).mockResolvedValue({ Variants: [noGateway], Resources: null } as never)
    vi.mocked(deployStatus).mockResolvedValue(ready({ Gateways: [] }))
    const first = open()
    expect(await screen.findByRole("status", { name: t("ed.d.chip.ready") })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /VPN/ })).toBeNull()
    first.unmount()
    vi.mocked(getVersion).mockResolvedValue({ Variants: [variant], Resources: null } as never)
    vi.mocked(deployStatus).mockResolvedValue(status({ Phase: "Queued", Devices: [], Gateways: [] }))
    open()
    expect(await screen.findByRole("button", { name: t("ed.d.vpn.header.pending") })).toBeTruthy()
  })

  it("ready: chip, VPN icon button without a caption, the participant's answer field", async () => {
    vi.mocked(deployStatus).mockResolvedValue(ready())
    open()
    expect(await screen.findByRole("status", { name: t("ed.d.chip.ready") })).toBeTruthy()
    const vpn = screen.getByRole("button", { name: t("ed.d.vpn.header.available") })
    expect(vpn.textContent).toBe("")
    expect(vpn.getAttribute("data-vpn")).toBe("available")
    expect(screen.getByRole("textbox")).toBeTruthy()
    // no author-only block in the task: the participant's view has none
    const task = document.getElementById("lab-task")!
    expect(within(task).queryByText(t("ed.d.author.title"))).toBeNull()
  })

  it("answers through the real check and marks the task solved", async () => {
    vi.mocked(deployStatus).mockResolvedValue(ready())
    vi.mocked(checkDeployFlag).mockResolvedValue({ Correct: true })
    open()
    const input = await screen.findByRole("textbox")
    fireEvent.change(input, { target: { value: "ospf" } })
    fireEvent.click(screen.getByRole("button", { name: t("ed.d.answer.checkNamed", { name: "Протокол" }) }))
    await waitFor(() => expect(checkDeployFlag).toHaveBeenCalledWith("d1", "t1", "ospf"))
    expect(await screen.findByText(new RegExp(t("ed.d.answer.foundText")))).toBeTruthy()
    expect(screen.getByRole("progressbar", { name: t("ed.d.header.progress", { done: 1, total: 2 }) })).toBeTruthy()
  })

  it("a task waits for its prerequisite and offers the way there", async () => {
    vi.mocked(deployStatus).mockResolvedValue(ready())
    open()
    await screen.findByRole("status", { name: t("ed.d.chip.ready") })
    fireEvent.click(screen.getByRole("button", { name: /Налаштуйте OSPF/ }))
    expect(screen.getByText(t("ed.d.task.locked", { names: "«Протокол»" }))).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: t("ed.d.task.goTo", { name: "Протокол" }) }))
    expect(screen.getByRole("heading", { level: 2, name: "Протокол" })).toBeTruthy()
  })

  it("ready with a failed initialization: the chip names the device and the row shows the reason from the laboratory", async () => {
    vi.mocked(deployStatus).mockResolvedValue(ready({ Devices: [{ Name: "r1", Ready: true }, { Name: "srv", Ready: true, Bootstrap: { Phase: "failed", Attempts: 3, Reason: "script exited with 1" } }] }))
    open()
    expect(await screen.findByRole("status", { name: t("ed.d.chip.deviceFailed", { devices: "srv" }) })).toBeTruthy()
    // a failed device is open by itself
    expect(screen.getByText(t("ed.d.dev.initFailedReason", { reason: "script exited with 1" }))).toBeTruthy()
    expect(screen.getByText(t("ed.d.dev.initFailedAttempt", { n: 3, max: 3 }))).toBeTruthy()
  })

  it("deploy failure: the app's error state with the reasons and «Спробувати ще раз», which starts again", async () => {
    vi.mocked(deployStatus).mockResolvedValue(status({ Phase: "Failed", Devices: [{ Name: "srv", Ready: false, Bootstrap: { Phase: "failed", Attempts: 3, Reason: "script exited with 1" } }] }))
    vi.mocked(deployVariant).mockResolvedValue({ DeployID: "d2", Lab: "" })
    open()
    expect(await screen.findByText(t("ed.d.fail.deploy"))).toBeTruthy()
    expect(screen.getByText(t("ed.d.dev.initFailedReason", { reason: "script exited with 1" }))).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: t("error.load.retry") }))
    await waitFor(() => expect(deployVariant).toHaveBeenCalledWith("ex1", "v1", "var1"))
  })

  it("a start the server refused is the error state with the reason, and the retry starts again", async () => {
    vi.mocked(deployVariant).mockRejectedValueOnce(new Error("no way")).mockResolvedValue({ DeployID: "d2", Lab: "" })
    vi.mocked(deployStatus).mockResolvedValue(status({}))
    open({ deploy: null, version: "v1", variant: "var1", minutes: 120 })
    expect(await screen.findByText(/^Не вдалося запустити тест: /)).toBeTruthy()
    expect(deployVariant).toHaveBeenCalledWith("ex1", "v1", "var1", 120)
    fireEvent.click(screen.getByRole("button", { name: t("error.load.retry") }))
    await waitFor(() => expect(deployVariant).toHaveBeenCalledTimes(2))
  })

  it("time over: says so and only offers to end", async () => {
    vi.mocked(deployStatus).mockResolvedValue(ready({ Expired: true }))
    open()
    expect(await screen.findByText(t("ed.d.expired"))).toBeTruthy()
    expect(screen.getAllByRole("button", { name: t("ed.d.header.end") }).length).toBeGreaterThan(0)
  })

  it("ending asks first (danger), names the operation, then destroys the lab and goes back", async () => {
    vi.mocked(deployStatus).mockResolvedValue(ready())
    vi.mocked(destroyDeploy).mockResolvedValue(undefined)
    open()
    await screen.findByRole("status", { name: t("ed.d.chip.ready") })
    fireEvent.click(screen.getAllByRole("button", { name: t("ed.d.header.end") })[0])
    expect(destroyDeploy).not.toHaveBeenCalled()
    expect(screen.getByText(t("ed.d.end.title"))).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: t("ed.d.end.confirm") }))
    await waitFor(() => expect(destroyDeploy).toHaveBeenCalledWith("d1"))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/detail?id=ex1"))
  })

  it("the author's panel names the observation kind of every condition, per device", async () => {
    vi.mocked(deployStatus).mockResolvedValue(ready({ StateTasks: [{ TaskID: "t2", Key: "ospf", Mode: "once", Manual: true, Solved: false, SolvedAt: null, FirstSolvedAt: null, Known: true,
      Checks: [{ ID: "ospf:1", Known: true, Passed: false, FirstPassedAt: null, ChangedAt: null, Value: "", Detail: "ospfd is not running" }] }] }))
    open()
    await screen.findByRole("status", { name: t("ed.d.chip.ready") })
    fireEvent.click(screen.getByRole("button", { name: /Налаштуйте OSPF/ }))
    fireEvent.click(screen.getByRole("tab", { name: t("ed.d.dock.tab.author") }))
    const check = document.querySelector('[data-check="ospf:1"]') as HTMLElement
    expect(within(check).getByText(t("ed.d.cond.process"))).toBeTruthy()
    expect(within(check).getByText(t("ed.d.cond.port"))).toBeTruthy()
    expect(within(check).getByText("ospfd is not running")).toBeTruthy()
    expect(within(check).getByText(t("ed.d.author.onDevice", { device: "r1" }))).toBeTruthy()
  })

  it("the console button on a device opens the console panel of that device beside the task", async () => {
    vi.mocked(deployStatus).mockResolvedValue(ready())
    open()
    await screen.findByRole("status", { name: t("ed.d.chip.ready") })
    fireEvent.click(screen.getByRole("button", { name: t("ed.d.dev.openConsoleNamed", { device: "r1" }) }))
    expect(screen.getByTestId("console").textContent).toBe("r1")
  })
})
