// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))

// The canvas is the editor's: here it shows the devices it is given and the line state of each console cable.
vi.mock("@/components/exercises/TopologyDiagram", () => ({
  TopologyDiagram: ({ topology, edgeStatus }: { topology: { Devices: { Name: string }[] }; edgeStatus?: Record<number, { up: boolean; label: string }> }) => <div data-testid="diagram">
    {topology.Devices.map((device) => <span key={device.Name} data-node={device.Name}>{device.Name}</span>)}
    {Object.entries(edgeStatus ?? {}).map(([index, line]) => <span key={index} data-edge-line={index} data-up={String(line.up)}>{line.label}</span>)}
  </div>,
}))

const getDeployDossier = vi.fn()
vi.mock("@/api/exercises/deploy", async (original) => ({ ...(await original<object>()), getDeployDossier: (id: string) => getDeployDossier(id) }))

import { ApiError } from "@/api/client"
import type { DeployDossier, DeployStatus } from "@/api/exercises/deploy"
import type { NormalizedTopology, NormalizedVariant } from "@/api/exercises/versions"
import { cableStatusByConnection, consoleLineText, dossierTopology, humanAttacks } from "@/lib/labConsole"
import { useDossier, type DossierState } from "@/lib/useDossier"
import { DossierTab } from "./DossierTab"
import { LabDock } from "./LabDock"

const node = (ID: string, Name: string, extra = {}) => ({ ID, Name, Type: "node", Interfaces: [{ Name: "eth0", IP: { Type: "dhcp", Addresses: [] } }], Access: [], Bootstrap: { Timeout: "", Env: [], Files: [], Script: "", Interpreter: "" }, ...extra })
const topology = {
  Variables: [], VisualRender: null,
  Devices: [
    node("p", "pc", { SerialPorts: [{ Name: "serial0" }, { Name: "serial1" }] }),
    node("r", "r1", { ConsolePorts: [{ Name: "console0", Command: ["/usr/bin/vtysh"] }] }),
    node("s", "sw-core", { ConsolePorts: [{ Name: "console0", Native: { Kind: "stdio" } }] }),
    node("f", "core-fw"),
    { ...node("x", "lan"), Type: "unmanaged-switch", Interfaces: [] },
  ],
  Connections: [
    { Endpoints: [{ Kind: "device", DeviceID: "p", Interface: "eth0" }, { Kind: "device", DeviceID: "x", Interface: "GigabitEthernet0/1" }] },
    { Endpoints: [{ Kind: "device", DeviceID: "r", Interface: "eth0" }, { Kind: "device", DeviceID: "x", Interface: "GigabitEthernet0/2" }] },
    { Kind: "console", Endpoints: [{ Kind: "device", DeviceID: "p", Interface: "serial0" }, { Kind: "device", DeviceID: "r", Interface: "console0" }] },
    { Kind: "console", Endpoints: [{ Kind: "device", DeviceID: "s", Interface: "console0" }, { Kind: "device", DeviceID: "p", Interface: "serial1" }] },
  ],
} as unknown as NormalizedTopology

const status: DeployStatus = {
  Phase: "Ready", Ready: true, Gateways: [],
  ConsoleCables: [
    { Serial: { Device: "pc", Port: "serial0" }, Console: { Device: "r1", Port: "console0" }, LineUp: true, Reason: "" },
    { Serial: { Device: "pc", Port: "serial1" }, Console: { Device: "sw-core", Port: "console0" }, LineUp: false, Reason: "WaitingForDevice" },
  ],
}

const dossier = (extra: Partial<DeployDossier> = {}): DeployDossier => ({
  Declared: true, Topology: "full", Operates: ["r1", "sw-core"],
  Links: [
    { SerialPort: "serial0", Path: "/dev/ttyCON0", Device: "r1", ConsolePort: "console0", ConsoleKind: "program", Program: "vtysh" },
    { SerialPort: "serial1", Path: "/dev/ttyCON1", Device: "sw-core", ConsolePort: "console0", ConsoleKind: "native", Program: "" },
  ],
  Forbidden: ["core-fw"],
  Credentials: [{ Device: "r1", Port: "console0", User: "admin", Value: "s3cret" }],
  ...extra,
})
const ready = (value: DeployDossier): DossierState & { retry: () => void } => ({ state: "ready", dossier: value, retry: vi.fn() })

afterEach(() => { cleanup(); getDeployDossier.mockReset() })

describe("console lines in the test lab", () => {
  it("says a line in words: up, or the reason it is down", () => {
    expect(consoleLineText({ LineUp: true, Reason: "" })).toBe("ed.d.cable.up")
    expect(consoleLineText({ LineUp: false, Reason: "PeerUnreachable" })).toBe("ed.d.cable.reason.PeerUnreachable")
    expect(consoleLineText({ LineUp: false, Reason: "Something" })).toBe("ed.d.cable.reason.Unknown")
  })

  it("matches each line of the status to its cable by both ends, in either endpoint order", () => {
    expect(cableStatusByConnection(topology, status)).toEqual({ 2: { up: true, label: "ed.d.cable.up" }, 3: { up: false, label: "ed.d.cable.reason.WaitingForDevice" } })
    expect(cableStatusByConnection(topology, { ...status, ConsoleCables: undefined })).toEqual({})
  })

  it("lists the cables with a chip under the devices", () => {
    render(<LabDock tab="devices" onTab={vi.fn()} topology={topology} status={status} chip={{ kind: "ready" } as never} deployId="d1" tasks={[]} currentTaskId={null} solvedIds={new Set()}
      expanded={new Set()} onToggleDevice={vi.fn()} actions={{} as never} schemaSelected={null} onSchemaSelect={vi.fn()} onFull={vi.fn()} author={false} onClose={vi.fn()} sheet={false} />)
    const lines = screen.getByTestId("console-lines")
    expect(within(lines).getAllByRole("listitem").map((item) => item.querySelector("[data-line]")?.getAttribute("data-line"))).toEqual(["up", "down"])
    expect(lines).toHaveTextContent("ed.d.cable.reason.WaitingForDevice")
  })
})

describe("the defender's dossier", () => {
  it("reads the console map as a runbook, with what is on each line and the command to open it", () => {
    render(<DossierTab dossier={ready(dossier())} topology={topology} status={status} selected={null} onSelect={vi.fn()} />)
    const links = document.querySelectorAll("[data-dossier-link]")
    expect(links[0]).toHaveTextContent("ed.d.dossier.runbook r1 serial0 /dev/ttyCON0 console0")
    expect(links[0]).toHaveTextContent("ed.d.dossier.kind.program vtysh")
    expect(links[0]).toHaveTextContent("ed.d.dossier.command /dev/ttyCON0")
    expect(links[0].querySelector("[data-line]")).toHaveAttribute("data-line", "up")
    expect(links[1]).toHaveTextContent("ed.d.dossier.kind.native")
    expect(links[1].querySelector("[data-line]")).toHaveAttribute("data-line", "down")
    expect(screen.getByText("ed.d.dossier.forbiddenDevice core-fw")).toBeInTheDocument()
  })

  it("masks a credential value, reveals it on request and copies it", async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.assign(navigator, { clipboard: { writeText } })
    render(<DossierTab dossier={ready(dossier())} topology={topology} status={status} selected={null} onSelect={vi.fn()} />)
    const row = document.querySelector<HTMLElement>("[data-dossier-credential='0']")!
    expect(row).toHaveTextContent("ed.d.dossier.at r1 console0")
    expect(row).toHaveTextContent("ed.d.dossier.user admin")
    expect(row).not.toHaveTextContent("s3cret")
    fireEvent.click(within(row).getByRole("button", { name: "ed.ui.showValue" }))
    expect(row).toHaveTextContent("s3cret")
    await act(async () => { fireEvent.click(within(row).getByRole("button", { name: "ed.d.dossier.copyValue r1" })) })
    expect(writeText).toHaveBeenCalledWith("s3cret")
  })

  it("shows the topology by its mode: full, only the operated devices with their switches, or none", () => {
    const { unmount } = render(<DossierTab dossier={ready(dossier())} topology={topology} status={status} selected={null} onSelect={vi.fn()} />)
    expect([...document.querySelectorAll("[data-node]")].map((item) => item.textContent)).toEqual(["pc", "r1", "sw-core", "core-fw", "lan"])
    unmount()
    const operates = render(<DossierTab dossier={ready(dossier({ Topology: "operates" }))} topology={topology} status={status} selected={null} onSelect={vi.fn()} />)
    expect([...document.querySelectorAll("[data-node]")].map((item) => item.textContent)).toEqual(["r1", "sw-core", "lan"])
    expect(dossierTopology(topology, { Topology: "operates", Operates: ["r1"] })?.Connections).toHaveLength(1)
    operates.unmount()
    render(<DossierTab dossier={ready(dossier({ Topology: "none" }))} topology={topology} status={status} selected={null} onSelect={vi.fn()} />)
    expect(screen.queryByTestId("diagram")).not.toBeInTheDocument()
    expect(screen.getByText("ed.d.dossier.topologyNone")).toBeInTheDocument()
  })

  it("empty lists show the empty state; loading shows the crest; a failure offers a retry", () => {
    const { unmount } = render(<DossierTab dossier={ready(dossier({ Links: [], Forbidden: [], Credentials: [] }))} topology={topology} status={status} selected={null} onSelect={vi.fn()} />)
    expect(screen.getByText("ed.d.dossier.noLinks")).toBeInTheDocument()
    expect(screen.getByText("ed.d.dossier.noForbidden")).toBeInTheDocument()
    expect(screen.getByText("ed.d.dossier.noCredentials")).toBeInTheDocument()
    unmount()
    const loading = render(<DossierTab dossier={{ state: "loading", retry: vi.fn() }} topology={topology} status={status} selected={null} onSelect={vi.fn()} />)
    expect(screen.getByRole("status")).toHaveTextContent("ed.d.dossier.loading")
    loading.unmount()
    const retry = vi.fn()
    render(<DossierTab dossier={{ state: "error", cause: new Error("x"), retry }} topology={topology} status={status} selected={null} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "error.load.retry" }))
    expect(retry).toHaveBeenCalled()
  })
})

describe("the tabs of the lab panel by role", () => {
  const dock = (extra: Partial<Parameters<typeof LabDock>[0]>) => render(<LabDock tab="devices" onTab={vi.fn()} topology={topology} status={status} chip={{ kind: "ready" } as never} deployId="d1" tasks={[]}
    currentTaskId={null} solvedIds={new Set()} expanded={new Set()} onToggleDevice={vi.fn()} actions={{} as never} schemaSelected={null} onSchemaSelect={vi.fn()} onFull={vi.fn()} author={false} onClose={vi.fn()} sheet={false} {...extra} />)
  const tabs = () => screen.getAllByRole("tab").map((tab) => tab.textContent)

  it("has the dossier tab only when the variant declares a dossier", () => {
    const { unmount } = dock({ dossier: ready(dossier()) })
    expect(tabs()).toEqual(["ed.d.dock.tab.devices", "ed.d.dock.tab.schema", "ed.d.dock.tab.dossier"])
    unmount()
    const none = dock({ dossier: ready(dossier({ Declared: false })) })
    expect(tabs()).toEqual(["ed.d.dock.tab.devices", "ed.d.dock.tab.schema"])
    none.unmount()
    dock({ dossier: { state: "loading", retry: vi.fn() } })
    expect(tabs()).toEqual(["ed.d.dock.tab.devices", "ed.d.dock.tab.schema"])
  })

  it("hides the schema (and the console lines) from a human attacker only", () => {
    const defended = { Opponents: [{ Role: "defense", Band: 1, Goal: ["a"] }] } as Pick<NormalizedVariant, "Opponents">
    expect(humanAttacks(defended, false)).toBe(true)
    expect(humanAttacks(defended, true)).toBe(false)
    expect(humanAttacks({ Opponents: [{ Role: "attack", Band: 1, Goal: ["a"] }] }, false)).toBe(false)
    expect(humanAttacks({}, false)).toBe(false)
    dock({ schemaHidden: true })
    expect(tabs()).toEqual(["ed.d.dock.tab.devices"])
    expect(screen.queryByTestId("console-lines")).not.toBeInTheDocument()
  })
})

describe("useDossier", () => {
  it("reads the dossier once the lab is ready, asks again on 409 and never before", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    getDeployDossier.mockRejectedValueOnce(new ApiError(409, { Status: { Code: 70959 } }, "not ready")).mockResolvedValueOnce(dossier())
    const { result, rerender } = renderHook(({ ready: on }) => useDossier("d1", on), { initialProps: { ready: false } })
    expect(result.current.state).toBe("idle")
    expect(getDeployDossier).not.toHaveBeenCalled()
    rerender({ ready: true })
    await waitFor(() => expect(getDeployDossier).toHaveBeenCalledTimes(1))
    expect(result.current.state).toBe("loading")
    await act(async () => { vi.advanceTimersByTime(3000) })
    await waitFor(() => expect(result.current.state).toBe("ready"))
    expect(getDeployDossier).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it("another failure is an error with a retry", async () => {
    getDeployDossier.mockRejectedValueOnce(new ApiError(403, { Status: { Code: 60957 } }, "no")).mockResolvedValueOnce(dossier())
    const { result } = renderHook(() => useDossier("d1", true))
    await waitFor(() => expect(result.current.state).toBe("error"))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.state).toBe("ready"))
  })
})
