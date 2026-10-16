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
  return <FormProvider {...form}>
    <InterfaceForm variantIndex={0} deviceIndex={0} compact disabled={false} />
    <button type="button" onClick={() => void form.trigger()}>Validate</button>
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
