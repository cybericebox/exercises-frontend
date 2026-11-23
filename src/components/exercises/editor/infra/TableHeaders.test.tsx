import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))

const editor = vi.hoisted(() => ({ value: { variantIndex: 0, disabled: false, baseIndex: -1, resources: null as unknown, goTo: vi.fn(), goToField: vi.fn() } }))
vi.mock("../context", () => ({ useEditor: () => editor.value }))

import { InfraWorkspace } from "./InfraWorkspace"
import { NetworkSection } from "./sections/NetworkSection"
import { ResourcesConfigProvider } from "../../ResourcesConfigContext"
import { RESOURCES_CONFIG } from "@/test/resourcesConfig"
import { device, draftWith, FormHarness } from "./test/harness"

const eth0 = { Name: "eth0", MAC: "", IP: { Type: "dhcp" as const, Addresses: [], AddressRef: null, Gateway: "", GatewayRef: null, Routes: [] } }

function draft() {
  return draftWith([device({ ID: "d1", Name: "web", Interfaces: [eth0] }), device({ ID: "d2", Name: "db", Interfaces: [eth0] })], {
    Connections: [{ Endpoints: [{ Kind: "device", DeviceID: "d1", Interface: "eth0" }, { Kind: "device", DeviceID: "d2", Interface: "eth0" }] }] as never,
    Variables: [{ Name: "token", Kind: "value", Text: "v" }],
  })
}

/** Column headers are not fields: under the owner rule a «?» stands only beside the label of an input. */
function expectNoHeaderHelp() {
  const heads = [...screen.queryAllByRole("columnheader"), ...document.querySelectorAll<HTMLElement>("[data-table-head]")]
  expect(heads.length).toBeGreaterThan(0)
  for (const head of heads) expect(head.querySelector("button")).toBeNull()
}

beforeEach(() => { editor.value = { variantIndex: 0, disabled: false, baseIndex: -1, resources: null, goTo: vi.fn(), goToField: vi.fn() } })

describe("table headers carry no help button: one description line says what the columns mean", () => {
  it.each([
    ["ed.c.views.devices", "ed.c.desc.devices"],
    ["ed.c.views.connections", "ed.c.desc.connections"],
    ["ed.c.views.vars", "ed.c.desc.variables"],
  ])("%s", (view, description) => {
    render(<ResourcesConfigProvider value={RESOURCES_CONFIG}><FormHarness draft={draft()} validate><InfraWorkspace /></FormHarness></ResourcesConfigProvider>)
    fireEvent.click(screen.getByRole("button", { name: view }))
    expect(screen.getByRole("table")).toBeInTheDocument()
    expectNoHeaderHelp()
    expect(screen.getByText(description)).toBeInTheDocument()
  })

  it("the interfaces of the device dialog; each field of an open interface keeps its own help", () => {
    render(<FormHarness draft={draft()}><NetworkSection variantIndex={0} deviceIndex={0} disabled={false} /></FormHarness>)
    expectNoHeaderHelp()
    expect(screen.getByText("ed.c.desc.interfaces")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /ed.ui.expand: eth0/ }))
    expect(document.querySelector("[data-interface-form]")!.querySelectorAll("button[aria-label]").length).toBeGreaterThan(0)
  })
})
