// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import type { DeployStatus } from "@/api/exercises/deploy"
import type { NormalizedTopology } from "@/api/exercises/versions"
import { t } from "@/i18n/t"
import { SchemaFull } from "./SchemaView"

// The canvas is the editor's; here it only shows the stage handed to each node and lets a test click a node.
vi.mock("@/components/exercises/TopologyDiagram", () => ({
  TopologyDiagram: ({ nodeStatus, onNodeSelect }: { nodeStatus: Record<string, string>; onNodeSelect: (id: string) => void }) => <div>
    {Object.entries(nodeStatus).map(([id, status]) => <button key={id} type="button" data-status={status} onClick={() => onNodeSelect(id)}>{id}</button>)}
  </div>,
}))

const gateway = (ID: string, Name: string, Type: string, extra = {}) => ({ ID, Name, Type, DHCP: Type === "vpn_gateway", DHCPRanges: [], Interfaces: [], Access: [], Bootstrap: { Timeout: "30s", Env: [], Files: [], Script: "", Interpreter: "" }, ...extra })
const topology = { Variables: [], Connections: [], VisualRender: null, Devices: [gateway("g1", "attack", "vpn_gateway"), gateway("g2", "out", "internet_gateway"), gateway("g3", "dmz", "vpn_gateway")] } as unknown as NormalizedTopology
const status = (gateways: DeployStatus["Gateways"]): DeployStatus => ({ Phase: "Provisioning", Ready: false, Gateways: gateways })
const actions = { openingKey: null, consoleReason: "", openWeb: vi.fn(), openConsole: vi.fn(), askReset: vi.fn() } as never

function open(live: DeployStatus) {
  return render(<SchemaFull open onClose={() => {}} topology={topology} status={live} actions={actions} />)
}

afterEach(cleanup)

describe("SchemaFull gateways", () => {
  const live = status([
    { Name: "attack", Kind: "vpn", CIDR: "10.128.1.0/24", Ready: true, Reverse: "blocked" },
    { Name: "out", Kind: "internet", CIDR: "10.128.2.0/24", Ready: false },
  ])

  it("gives every gateway node the stage of its own entry, pending while it is not listed", () => {
    open(live)
    expect(screen.getByRole("button", { name: "g1" }).dataset.status).toBe("ready")
    expect(screen.getByRole("button", { name: "g2" }).dataset.status).toBe("pending")
    expect(screen.getByRole("button", { name: "g3" }).dataset.status).toBe("pending")
  })

  it("the card of a VPN gateway is titled by its name and shows its own subnet, DHCP and reverse state", () => {
    open(live)
    fireEvent.click(screen.getByRole("button", { name: "g1" }))
    expect(screen.getByText("attack")).toBeTruthy()
    expect(screen.getByText("10.128.1.0/24")).toBeTruthy()
    expect(screen.getByText(t("ed.d.schema.reverse"))).toBeTruthy()
    expect(screen.getByText(t("ed.d.schema.reverse.blocked"))).toBeTruthy()
  })

  it("an Internet gateway shows its own subnet and no reverse row", () => {
    open(live)
    fireEvent.click(screen.getByRole("button", { name: "g2" }))
    expect(screen.getByText("10.128.2.0/24")).toBeTruthy()
    expect(screen.queryByText(t("ed.d.schema.reverse"))).toBeNull()
  })

  it("a gateway the lab does not list yet shows a dash and no reverse row", () => {
    open(live)
    fireEvent.click(screen.getByRole("button", { name: "g3" }))
    expect(screen.getByText("—")).toBeTruthy()
    expect(screen.queryByText(t("ed.d.schema.reverse"))).toBeNull()
  })
})
