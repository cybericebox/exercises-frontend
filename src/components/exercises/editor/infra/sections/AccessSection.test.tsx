import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))

import { AccessSection } from "./AccessSection"
import { capabilities, device, draftWith, FormHarness, readValues, Values } from "../test/harness"

function renderAccess(options: { access?: ReturnType<typeof device>["Access"]; caps?: ReturnType<typeof capabilities> | null; disabled?: boolean; validate?: boolean } = {}) {
  render(<FormHarness draft={draftWith([device({ Access: options.access ?? [] })])} caps={options.caps ?? null} validate={options.validate}>
    <AccessSection variantIndex={0} deviceIndex={0} disabled={options.disabled ?? false} />
    <Values path="Variants.0.Topology.Devices.0.Access" />
  </FormHarness>)
}

describe("device access", () => {
  it("keeps one entry per kind and treats a present entry as «on»", () => {
    renderAccess()
    expect(readValues()).toEqual([])
    fireEvent.click(screen.getByRole("switch", { name: "ed.c.access.web" }))
    fireEvent.click(screen.getByRole("switch", { name: "ed.c.access.terminal" }))
    expect((readValues() as { Kind: string }[]).map((entry) => entry.Kind)).toEqual(["http", "terminal"])
    fireEvent.click(screen.getByRole("switch", { name: "ed.c.access.web" }))
    expect((readValues() as { Kind: string }[]).map((entry) => entry.Kind)).toEqual(["terminal"])
  })

  it("shows the fields of a switch on the next line only while it is on, and no gap while it is off", () => {
    const { container } = render(<FormHarness draft={draftWith([device()])}><AccessSection variantIndex={0} deviceIndex={0} disabled={false} /></FormHarness>)
    expect(container.querySelector("[data-switch-fields]")).toBeNull()
    fireEvent.click(screen.getByRole("switch", { name: "ed.c.access.web" }))
    expect(container.querySelector("[data-switch-fields]")).not.toBeNull()
    expect(screen.getByRole("spinbutton", { name: /ed.c.access.port/ })).toHaveValue(80)
  })

  it("writes the web port and protocol and leaves the terminal user empty with its placeholder", () => {
    renderAccess()
    fireEvent.click(screen.getByRole("switch", { name: "ed.c.access.web" }))
    fireEvent.change(screen.getByRole("spinbutton", { name: /ed.c.access.port/ }), { target: { value: "8080" } })
    fireEvent.click(screen.getByRole("switch", { name: "ed.c.access.terminal" }))
    const user = screen.getByRole("textbox", { name: /ed.c.access.user/ })
    expect(user).toHaveValue("")
    expect(user).toHaveAttribute("placeholder", "ed.c.access.userPlaceholder")
    expect(readValues()).toMatchObject([{ Kind: "http", Port: "8080", Protocol: "http" }, { Kind: "terminal", User: "" }])
  })

  it("offers VNC and RDP as unavailable rows: visible, off, focusable, with the reason", () => {
    renderAccess()
    for (const kind of ["vnc", "rdp"]) {
      const row = screen.getByRole("group", { name: new RegExp(`ed.c.access.${kind}.*ed.c.access.unavailable`) })
      expect(row).toHaveAttribute("tabindex", "0")
      expect(row).toHaveTextContent("ed.c.access.unavailable")
    }
    expect(screen.getByRole("switch", { name: "ed.c.access.vnc" })).toBeDisabled()
    expect(readValues()).toEqual([])
  })

  it("disables an option no laboratory supports and warns when only some do", () => {
    renderAccess({ caps: capabilities({ Access: { http: "some", terminal: "none", vnc: "none", rdp: "none" } }) })
    expect(screen.getByRole("switch", { name: "ed.c.access.terminal" })).toBeDisabled()
    expect(screen.getByText("ed.ui.lab.none")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("switch", { name: "ed.c.access.web" }))
    // The warning is part of the «?» of the option, never a sentence under the fields.
    expect(document.querySelector("[data-lab-warning]")).toBeNull()
    expect(screen.getByText(/ed\.ui\.lab\.some/)).toBeInTheDocument()
  })

  it("lets an unsupported entry that is already there be switched off", () => {
    renderAccess({ access: [{ Kind: "terminal", Port: "", Protocol: "http", Command: "", User: "", Files: false }], caps: capabilities({ Access: { http: "all", terminal: "none", vnc: "none", rdp: "none" } }) })
    const toggle = screen.getByRole("switch", { name: "ed.c.access.terminal" })
    expect(toggle).toBeEnabled()
    fireEvent.click(toggle)
    expect(readValues()).toEqual([])
  })

  it("puts a port error beside the port field", async () => {
    renderAccess({ validate: true })
    fireEvent.click(screen.getByRole("switch", { name: "ed.c.access.web" }))
    fireEvent.change(screen.getByRole("spinbutton", { name: /ed.c.access.port/ }), { target: { value: "70000" } })
    fireEvent.click(screen.getByRole("button", { name: "validate-all" }))
    const port = screen.getByRole("spinbutton", { name: /ed.c.access.port/ })
    await screen.findByText("ed.c.val.accessPortWeb")
    expect(port).toHaveAttribute("aria-invalid", "true")
    expect(document.getElementById(port.getAttribute("aria-describedby")!)).toHaveTextContent("ed.c.val.accessPortWeb")
  })

  it("is read-only when disabled", () => {
    renderAccess({ disabled: true, access: [{ Kind: "http", Port: "80", Protocol: "http", Command: "", User: "", Files: false }] })
    expect(screen.getByRole("switch", { name: "ed.c.access.web" })).toBeDisabled()
    expect(screen.getByRole("spinbutton", { name: /ed.c.access.port/ })).toBeDisabled()
  })

  describe("file transfer through the console", () => {
    const filesSwitch = () => screen.queryByRole("switch", { name: "ed.c.access.files" })
    const terminalOn = (extra: object = {}) => ({ Kind: "terminal" as const, Port: "", Protocol: "http" as const, Command: "", User: "", Files: false, ...extra })

    it("is a plain switch row inside the terminal block, off by default, absent while the terminal is off", () => {
      const { container } = render(<FormHarness draft={draftWith([device()])}><AccessSection variantIndex={0} deviceIndex={0} disabled={false} /><Values path="Variants.0.Topology.Devices.0.Access" /></FormHarness>)
      expect(filesSwitch()).toBeNull()
      fireEvent.click(screen.getByRole("switch", { name: "ed.c.access.terminal" }))
      expect(filesSwitch()).toHaveAttribute("aria-checked", "false")
      expect(container.querySelectorAll("[data-switch-block] [data-switch-block]")).toHaveLength(1)
      fireEvent.click(filesSwitch()!)
      expect(readValues()).toMatchObject([{ Kind: "terminal", Files: true }])
    })

    it("is absent for the vm profile and when no laboratory can transfer files", () => {
      render(<FormHarness draft={draftWith([device({ Profile: "vm", Access: [terminalOn()] })])}><AccessSection variantIndex={0} deviceIndex={0} disabled={false} /></FormHarness>)
      expect(filesSwitch()).toBeNull()
    })

    it("none removes the switch, some puts the note into the help", () => {
      const none = render(<FormHarness draft={draftWith([device({ Access: [terminalOn()] })])} caps={capabilities({ TerminalFiles: "none" })}><AccessSection variantIndex={0} deviceIndex={0} disabled={false} /></FormHarness>)
      expect(filesSwitch()).toBeNull()
      none.unmount()
      render(<FormHarness draft={draftWith([device({ Access: [terminalOn()] })])} caps={capabilities({ TerminalFiles: "some" })}><AccessSection variantIndex={0} deviceIndex={0} disabled={false} /></FormHarness>)
      expect(filesSwitch()).toBeInTheDocument()
      expect(screen.getAllByText(/ed\.ui\.lab\.some/).length).toBeGreaterThan(0)
    })
  })
})
