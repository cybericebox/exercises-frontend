import { describe, expect, it, vi } from "vitest"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key}${JSON.stringify(vars)}` : key }))

import { draftSchema, emptyDevice, emptyDraft, emptyTask, gatewayNetworkConflicts, type DeviceFormValues, type DraftFormValues } from "@/lib/exerciseSchemas"
import { emptyGateway } from "@/lib/editor/schemas/infra"
import { canJoinConsoleCable, setConsoleLimits, consoleCableEnds, consolePortToDTO, consolePortToForm, consoleCommandProblem, freeLinePorts, nextPortName, serialDevicePath } from "./consolePorts"
import { emptyDefender, opponentSeatOptions } from "./defender"

const port = (Name: string, Mode = "program", rest: Partial<{ Command: string[]; User: string; Port: string }> = {}) => ({ Name, Mode, Command: [], User: "", Port: "", ...rest })

function draft(devices: Partial<DeviceFormValues>[], connections: DraftFormValues["Variants"][number]["Topology"]["Connections"] = []): DraftFormValues {
  const value = emptyDraft()
  value.Variants[0].Tasks = [{ ...emptyTask("scan"), Key: "scan", Name: "Scan" }]
  value.Variants[0].Topology.Devices = devices.map((device, index) => ({ ...emptyDevice(), ID: `d${index}`, Name: `n${index}`, ...device }))
  value.Variants[0].Topology.Connections = connections
  return value
}
const issues = (value: DraftFormValues) => {
  const result = draftSchema.safeParse(value)
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
}
const at = (path: string) => (value: string) => value.startsWith(path)
const cable = (a: string, pa: string, b: string, pb: string) => ({ Kind: "console", Endpoints: [{ Kind: "device" as const, DeviceID: a, Interface: pa }, { Kind: "device" as const, DeviceID: b, Interface: pb }] })

describe("console and serial port rules of the form", () => {
  it("accepts the default port, a program, stdio and tcp", () => {
    expect(issues(draft([{ ConsolePorts: [port("console0"), port("aux0", "program", { Command: ["/usr/bin/vtysh"], User: "frr" }), port("console1", "stdio"), port("console2", "tcp", { Port: "2001" })] }]))).toEqual([])
  })

  it("refuses bad names, a relative command, a bad user, a tcp port out of range, stdio twice", () => {
    const found = issues(draft([{ ConsolePorts: [port("con0"), port("console1", "program", { Command: ["vtysh"], User: "Root!" }), port("console2", "tcp", { Port: "70000" }), port("console3", "stdio")] , SerialPorts: [{ Name: "ser0", Path: "" }] },
      { ConsolePorts: [port("console0", "stdio"), port("aux0", "stdio")] }]))
    expect(found).toContain("Variants.0.Topology.Devices.0.ConsolePorts.0.Name: ed.c.port.val.consoleName")
    expect(found).toContain("Variants.0.Topology.Devices.0.ConsolePorts.1.Command: ed.c.port.val.command.absolute{\"max\":4096}")
    expect(found).toContain("Variants.0.Topology.Devices.0.ConsolePorts.1.User: ed.c.val.terminalUser")
    expect(found).toContain("Variants.0.Topology.Devices.0.ConsolePorts.2.Port: ed.c.val.accessPort")
    expect(found).toContain("Variants.0.Topology.Devices.0.SerialPorts.0.Name: ed.c.port.val.serialName")
    expect(found).toContain("Variants.0.Topology.Devices.1.ConsolePorts.1.Mode: ed.c.port.val.stdioTwice")
  })

  it("refuses a command in /proc or /sys and too many parts", () => {
    expect(consoleCommandProblem(["/proc/self/exe"])).toBe("virtual")
    expect(consoleCommandProblem(["/usr/../sys/x"])).toBe("")
    expect(consoleCommandProblem(Array.from({ length: 33 }, () => "/bin/sh"))).toBe("entries")
    expect(consoleCommandProblem([])).toBe("")
  })

  it("keeps port names apart from interface names and serial paths unique (the default path counts)", () => {
    const found = issues(draft([{ ConsolePorts: [port("eth0")], SerialPorts: [{ Name: "serial0", Path: "" }, { Name: "serial1", Path: "/dev/ttyCON0" }, { Name: "serial2", Path: "/dev/console" }] }]))
    expect(found.some(at("Variants.0.Topology.Devices.0.ConsolePorts.0.Name: ed.c.port.val"))).toBe(true)
    expect(found).toContain('Variants.0.Topology.Devices.0.SerialPorts.1.Path: ed.c.port.val.pathTaken{"path":"/dev/ttyCON0"}')
    expect(found).toContain("Variants.0.Topology.Devices.0.SerialPorts.2.Path: ed.c.port.val.serialPath")
  })

  it("refuses ports on a Windows device and over the limits", () => {
    expect(issues(draft([{ Profile: "vm", System: "windows", SerialPorts: [{ Name: "serial0", Path: "" }] }]))).toContain("Variants.0.Topology.Devices.0.SerialPorts: ed.c.port.val.windows")
    const many = Array.from({ length: 5 }, (_, n) => port(`console${n}`))
    expect(issues(draft([{ ConsolePorts: many }]))).toContain('Variants.0.Topology.Devices.0.ConsolePorts: ed.c.port.val.consoleMax{"max":4}')
  })

  it("serial<n> is /dev/ttyCON<n> unless its path is set; new ports take the first free name", () => {
    expect(serialDevicePath({ Name: "serial3" })).toBe("/dev/ttyCON3")
    expect(serialDevicePath({ Name: "serial3", Path: "/dev/ttyS0" })).toBe("/dev/ttyS0")
    expect(nextPortName("console", ["console0", "eth0", "console2"])).toBe("console1")
  })
})

describe("console cable rules of the form", () => {
  const router = { ID: "r", Name: "router", ConsolePorts: [port("console0"), port("aux0")] }
  const pc = { ID: "p", Name: "pc", SerialPorts: [{ Name: "serial0", Path: "" }, { Name: "serial1", Path: "" }] }
  const switchDevice = { ID: "s", Name: "sw", Type: "unmanaged-switch" as const, Interfaces: [] }

  it("accepts a cable between a serial and a console port in either order", () => {
    expect(issues(draft([router, pc], [cable("p", "serial0", "r", "console0"), cable("r", "aux0", "p", "serial1")]))).toEqual([])
  })

  it("refuses two serial ports, two console ports, one device, a NIC and a second cable on a port", () => {
    const pc2 = { ID: "q", Name: "pc2", SerialPorts: [{ Name: "serial0", Path: "" }] }
    expect(issues(draft([router, pc, pc2], [cable("p", "serial0", "q", "serial0")]))).toContain("Variants.0.Topology.Connections.0.Endpoints.1.Interface: ed.c.port.val.cable.two_serial")
    expect(issues(draft([router, pc], [cable("r", "console0", "r", "aux0")]))).toContain("Variants.0.Topology.Connections.0.Endpoints.1.Interface: ed.c.port.val.cable.same_device")
    expect(issues(draft([router, pc], [cable("p", "eth0", "r", "console0")]))).toContain("Variants.0.Topology.Connections.0.Endpoints.0.Interface: ed.c.port.val.cable.nic")
    expect(issues(draft([router, pc, switchDevice], [cable("s", "GigabitEthernet0/1", "r", "console0")]))).toContain("Variants.0.Topology.Connections.0.Endpoints.0.Interface: ed.c.port.val.cable.nic")
    expect(issues(draft([router, pc], [cable("p", "serial0", "r", "console0"), cable("p", "serial1", "r", "console0")]))).toContain("Variants.0.Topology.Connections.1.Endpoints.1.Interface: admin.ex.val.portInUse")
  })

  it("refuses a network connection that ends on a port", () => {
    expect(issues(draft([router, pc], [{ Endpoints: [{ Kind: "device", DeviceID: "p", Interface: "serial0" }, { Kind: "device", DeviceID: "r", Interface: "eth0" }] }])))
      .toContain("Variants.0.Topology.Connections.0.Endpoints.0.Interface: ed.c.port.val.portOnNetwork")
  })

  it("never joins two networks: two gateways on the two sides of a cable are not one network", () => {
    const vpn = { ...emptyGateway("vpn_gateway", "vpn-1"), ID: "g1" }
    const internet = { ...emptyGateway("internet_gateway", "internet-1"), ID: "g2" }
    const topology = draft([router, pc, vpn, internet], [
      { Endpoints: [{ Kind: "device", DeviceID: "g1", Interface: "eth0" }, { Kind: "device", DeviceID: "r", Interface: "eth0" }] },
      { Endpoints: [{ Kind: "device", DeviceID: "g2", Interface: "eth0" }, { Kind: "device", DeviceID: "p", Interface: "eth0" }] },
      cable("p", "serial0", "r", "console0"),
    ]).Variants[0].Topology
    expect(gatewayNetworkConflicts(topology)).toEqual([])
  })

  it("offers only free ports, and pairs a free serial port with a free console port of another device", () => {
    const topology = draft([router, pc], [cable("p", "serial0", "r", "console0")]).Variants[0].Topology
    expect(freeLinePorts(topology.Connections, topology.Devices[0])).toEqual({ serial: [], console: ["aux0"] })
    expect(freeLinePorts(topology.Connections, topology.Devices[1])).toEqual({ serial: ["serial1"], console: [] })
    expect(canJoinConsoleCable(topology.Connections, topology.Devices[0], topology.Devices[1])).toBe(true)
    expect(canJoinConsoleCable(topology.Connections, topology.Devices[0], topology.Devices[0])).toBe(false)
    expect(consoleCableEnds(topology.Connections[0], topology.Devices)?.serial.DeviceID).toBe("p")
  })
})

describe("defender block and opponent seats", () => {
  const router = { ID: "r", Name: "router", ConsolePorts: [port("console0")] }
  const pc = { ID: "p", Name: "pc", SerialPorts: [{ Name: "serial0", Path: "" }] }
  const web = { ID: "w", Name: "web" }
  const links = [{ Endpoints: [{ Kind: "device" as const, DeviceID: "p", Interface: "eth0" }, { Kind: "device" as const, DeviceID: "w", Interface: "eth0" }] }, cable("p", "serial0", "r", "console0")]

  it("refuses a seat without serial ports, an off-limits device cabled to the seat, a port that is not a console port, a secret without a value", () => {
    const value = draft([router, pc, web], links)
    value.Variants[0].Defender = { ...emptyDefender(), Seat: "web", OffLimits: [], Credentials: [{ Device: "web", Port: "console0", User: "", Value: "", Secret: true, HasValue: false }] }
    let found = issues(value)
    expect(found).toContain("Variants.0.Defender.Seat: ed.c.def.seat.seat_no_serial")
    expect(found).toContain("Variants.0.Defender.Credentials.0.Port: ed.c.def.val.credentialPort")
    expect(found).toContain("Variants.0.Defender.Credentials.0.Value: admin.ex.val.secretValue")
    value.Variants[0].Defender = { ...emptyDefender(), Seat: "pc", OffLimits: ["router"], Credentials: [] }
    found = issues(value)
    expect(found).toContain('Variants.0.Defender.OffLimits: ed.c.def.val.offLimitsCabled{"name":"router"}')
  })

  it("accepts a stored secret (blank value) and an empty off-limits list (the default complement)", () => {
    const value = draft([router, pc, web], links)
    value.Variants[0].Defender = { ...emptyDefender(), Seat: "pc", Credentials: [{ Device: "router", Port: "console0", User: "admin", Value: "", Secret: true, HasValue: true }] }
    expect(issues(value)).toEqual([])
  })

  it("checks the seats of the opponents and offers only valid devices", () => {
    const value = draft([router, pc, web], links)
    value.Variants[0].Opponents = [{ Role: "attack", Band: 1, Goal: ["scan"], Seat: "pc" }]
    expect(issues(value)).toContain("Variants.0.Opponents.0.Seat: ed.c.def.seat.seat_forbidden")
    value.Variants[0].Opponents = [{ Role: "defense", Band: 1, Goal: ["scan"], Operates: ["pc"], Seat: "pc" }]
    expect(issues(value)).toContain("Variants.0.Opponents.0.Seat: ed.c.def.seat.seat_operated")
    value.Variants[0].Opponents = [{ Role: "defense", Band: 1, Goal: ["scan"], Operates: ["router"], Seat: "pc" }]
    expect(issues(value)).toEqual([])
    // Only nodes with serial ports; the router is the console end of a cable, web has no serial port.
    expect(opponentSeatOptions(value.Variants[0].Topology, value.Variants[0].Opponents, 0)).toEqual([{ name: "pc", reason: "" }])
  })
})

describe("the laboratory's limits and platform lines", () => {
  const router = { ID: "r", Name: "router", ConsolePorts: [port("console0"), port("aux0")] }
  const pc = { ID: "p", Name: "pc", SerialPorts: [{ Name: "serial0", Path: "" }, { Name: "serial1", Path: "" }] }

  it("validates with the capability limits, ports and cables alike", () => {
    setConsoleLimits({ MaxConsolePortsPerDevice: 1, MaxSerialPortsPerDevice: 1, MaxConsoleCablesPerLab: 1 })
    try {
      const found = issues(draft([router, pc], [cable("p", "serial0", "r", "console0"), cable("p", "serial1", "r", "aux0")]))
      expect(found).toContain('Variants.0.Topology.Devices.0.ConsolePorts: ed.c.port.val.consoleMax{"max":1}')
      expect(found).toContain('Variants.0.Topology.Devices.1.SerialPorts: ed.c.port.val.serialMax{"max":1}')
      expect(found).toContain('Variants.0.Topology.Connections.1.Endpoints.0.Interface: ed.c.port.val.cablesMax{"max":1}')
    } finally { setConsoleLimits(null) }
    expect(issues(draft([router, pc], [cable("p", "serial0", "r", "console0"), cable("p", "serial1", "r", "aux0")]))).toEqual([])
  })

  it("marks a taken name on every port that has it, so the field being typed in shows it", () => {
    const found = issues(draft([{ ConsolePorts: [port("console0"), port("console0")] }]))
    expect(found).toContain("Variants.0.Topology.Devices.0.ConsolePorts.0.Name: ed.c.port.val.nameTaken")
    expect(found).toContain("Variants.0.Topology.Devices.0.ConsolePorts.1.Name: ed.c.port.val.nameTaken")
  })

  it("keeps a native line the platform set (vm-serial): no error, the same on the wire", () => {
    expect(issues(draft([{ ConsolePorts: [port("console0", "vm-serial")] }]))).toEqual([])
    expect(consolePortToDTO(consolePortToForm({ Name: "console0", Native: { Kind: "vm-serial" } }))).toEqual({ Name: "console0", Native: { Kind: "vm-serial" } })
  })
})
