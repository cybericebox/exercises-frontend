import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/lib/downloadBlob", () => ({ downloadBlob: vi.fn() }))

import { t } from "@/i18n/t"
import { downloadBlob } from "@/lib/downloadBlob"
import { VpnDialog } from "./VpnDialog"
import { wireguardFileName } from "@/lib/wireguard"

const base = { open: true, ready: true, config: "[Interface]\n", connected: false as boolean | null, probeUrl: "http://10.128.0.1/", onClose: vi.fn() }

describe("VpnDialog (a copy of the event site's window)", () => {
  beforeEach(() => { vi.mocked(downloadBlob).mockReset() })

  it("not ready: says it is still being prepared and only acknowledges", () => {
    const onClose = vi.fn()
    render(<VpnDialog {...base} ready={false} connected={null} config="" onClose={onClose} />)
    expect(screen.getByText(t("ed.d.vpn.group.pending"))).toBeTruthy()
    expect(screen.getByText(t("ed.d.vpn.group.previewWait"))).toBeTruthy()
    expect(screen.getByText(t("ed.d.vpn.group.waitNext"))).toBeTruthy()
    expect(screen.queryByText(t("ed.d.vpn.instructions"))).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: t("ed.d.vpn.modal.acknowledge") }))
    expect(onClose).toHaveBeenCalled()
  })

  it("ready, not connected: instructions open, the commands carry the file name, probe line shows the gateway", () => {
    render(<VpnDialog {...base} />)
    expect(screen.getByText(t("ed.d.vpn.group.ready"))).toBeTruthy()
    expect(screen.getByText(t("ed.d.vpn.preview.testConfig"))).toBeTruthy()
    expect(document.querySelector("details")).toHaveProperty("open", true)
    expect(screen.getByText("sudo wg-quick up ./cybericebox.conf")).toBeTruthy()
    expect(screen.getByText("sudo wg-quick down ./cybericebox.conf")).toBeTruthy()
    expect(screen.getByText("ping 10.128.0.1")).toBeTruthy()
    expect(screen.getByText(t("ed.d.vpn.file.private"))).toBeTruthy()
    expect(screen.getByText(t("ed.d.vpn.steps.reminder"))).toBeTruthy()
  })

  it("keeps to the event window: no web access, no addresses of devices, no line about reverse connections", () => {
    render(<VpnDialog {...base} />)
    expect(document.body.textContent).not.toMatch(/reverse|зворотн/i)
    expect(screen.queryByRole("link", { name: /http:\/\/10\.0/ })).toBeNull()
  })

  it("connected: the instructions are folded", () => {
    render(<VpnDialog {...base} connected />)
    expect(screen.getByText(t("ed.d.vpn.connection.connected"))).toBeTruthy()
    expect(document.querySelector("details")).toHaveProperty("open", false)
  })

  it("unknown status: says so", () => {
    render(<VpnDialog {...base} connected={null} />)
    expect(screen.getByText(t("ed.d.vpn.group.available"))).toBeTruthy()
    expect(screen.getByText(t("ed.d.vpn.connection.unknown"))).toBeTruthy()
  })

  it("downloads the configuration under cybericebox.conf, a valid interface name", () => {
    render(<VpnDialog {...base} />)
    fireEvent.click(screen.getByRole("button", { name: t("ed.d.vpn.modal.download") }))
    expect(downloadBlob).toHaveBeenCalledTimes(1)
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe("cybericebox.conf")
    expect(wireguardFileName("cybericebox")).toBe("cybericebox.conf")
    expect(wireguardFileName("a very long event tag!!")).toMatch(/^[a-zA-Z0-9_=+.-]{1,15}\.conf$/)
  })

  it("download error: failure of the save, and a missing configuration, each have their own message", () => {
    vi.mocked(downloadBlob).mockImplementation(() => { throw new Error("blocked") })
    const { rerender } = render(<VpnDialog {...base} />)
    fireEvent.click(screen.getByRole("button", { name: t("ed.d.vpn.modal.download") }))
    expect(screen.getByRole("alert").textContent).toBe(t("ed.d.vpn.error.failed"))
    rerender(<VpnDialog {...base} config="" />)
    fireEvent.click(screen.getByRole("button", { name: t("ed.d.vpn.modal.download") }))
    expect(screen.getByRole("alert").textContent).toBe(t("ed.d.vpn.error.notReady"))
  })
})
