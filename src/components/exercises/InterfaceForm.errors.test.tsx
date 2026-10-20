import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { FormProvider, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { draftSchema, emptyDevice, emptyDraft, type DraftFormValues } from "@/lib/exerciseSchemas"
import { InterfaceForm } from "./InterfaceForm"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

function Harness() {
  const draft = emptyDraft()
  const device = emptyDevice()
  device.Name = "web"
  device.Interfaces[0].IP = { Type: "static", Addresses: ["bad address"], Gateway: "", Routes: [{ Dst: "bad destination", Via: "bad gateway" }] }
  draft.Variants[0].Topology.Devices = [device]
  const form = useForm<DraftFormValues>({ defaultValues: draft, resolver: zodResolver(draftSchema) })
  const [show, setShow] = useState(true)
  return <FormProvider {...form}>
    <button onClick={() => setShow(!show)}>Toggle panel</button>
    {show && <InterfaceForm variantIndex={0} deviceIndex={0} compact disabled={false} />}
    <button type="button" onClick={() => void form.trigger()}>Validate</button>
    <button type="button" onClick={() => form.setValue("Variants.0.ID", "saved-id")}>Assign saved ID</button>
  </FormProvider>
}

describe("interface validation placement", () => {
  it("shows array-item address errors and keeps each static-route error beside its own control", async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Validate" }))
    await screen.findByText("admin.ex.val.cidr")
    for (const name of ["admin.exTopo.addresses", "admin.exTopo.routeDst", "admin.exTopo.routeVia"]) {
      const control = screen.getByRole("textbox", { name: new RegExp(name) })
      expect(control).toHaveAttribute("aria-invalid", "true")
      const message = document.getElementById(control.getAttribute("aria-describedby")!)!
      expect(message).toHaveAttribute("role", "alert")
      expect(control.closest(".space-y-1")).toContainElement(message)
    }
  })
})

it("restores the static addresses, gateway and routes after switching to DHCP and back", () => {
 render(<Harness />)
 const choose = (name: string) => {
  fireEvent.keyDown(screen.getByRole("button", { name: "admin.exTopo.ipType" }), { key: "ArrowDown" })
  fireEvent.click(screen.getByRole("menuitemradio", { name: `${name}${name}Help` }))
 }
 choose("admin.exTopo.ip.dhcp")
 choose("admin.exTopo.ip.static")
 expect(screen.getByRole("textbox", { name: /admin.exTopo.addresses/ })).toHaveValue("bad address")
 expect(screen.getByRole("textbox", { name: /admin.exTopo.routeDst/ })).toHaveValue("bad destination")
 expect(screen.getByRole("textbox", { name: /admin.exTopo.routeVia/ })).toHaveValue("bad gateway")
})

it("keeps per-mode drafts when the inspector panel unmounts", () => {
 render(<Harness />)
 const choose = (name: string) => {
  fireEvent.keyDown(screen.getByRole("button", { name: "admin.exTopo.ipType" }), { key: "ArrowDown" })
  fireEvent.click(screen.getByRole("menuitemradio", { name: `${name}${name}Help` }))
 }
 choose("admin.exTopo.ip.dhcp")
 fireEvent.click(screen.getByRole("button", { name: "Toggle panel" }))
 fireEvent.click(screen.getByRole("button", { name: "Toggle panel" }))
 choose("admin.exTopo.ip.static")
 expect(screen.getByRole("textbox", { name: /admin.exTopo.addresses/ })).toHaveValue("bad address")
})

it("connects interface tabs and supports roving navigation", () => {
 render(<Harness />)
 fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.addInterface" }))
 const tabs = screen.getAllByRole("tab")
 expect(tabs[1]).toHaveAttribute("tabindex", "0")
 fireEvent.keyDown(tabs[1], { key: "ArrowRight" })
 expect(tabs[0]).toHaveFocus()
 expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", tabs[0].id)
 fireEvent.keyDown(tabs[0], { key: "End" })
 expect(tabs[1]).toHaveFocus()
 fireEvent.keyDown(tabs[1], { key: "Home" })
 expect(tabs[0]).toHaveFocus()
})

it("keeps the static draft when autosave assigns a new variant its server ID", () => {
 render(<Harness />)
 const choose = (name: string) => {
  fireEvent.keyDown(screen.getByRole("button", { name: "admin.exTopo.ipType" }), { key: "ArrowDown" })
  fireEvent.click(screen.getByRole("menuitemradio", { name: `${name}${name}Help` }))
 }
 choose("admin.exTopo.ip.dhcp")
 fireEvent.click(screen.getByRole("button", { name: "Assign saved ID" }))
 choose("admin.exTopo.ip.static")
 expect(screen.getByRole("textbox", { name: /admin.exTopo.addresses/ })).toHaveValue("bad address")
})
