import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { VpnDialog } from "@/components/exercises/VpnDialog"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/lib/downloadBlob", () => ({ downloadBlob: vi.fn() }))

const base = { open: true, config: "[Interface]", onClose: vi.fn() }

describe("VpnDialog — connection status and check", () => {
  it("waits with the crest loader until the handshake is seen", () => {
    render(<VpnDialog {...base} connected={false} />)
    const status = document.querySelector("[data-vpn]") as HTMLElement
    expect(status).toHaveAttribute("data-vpn", "waiting")
    expect(status).toHaveTextContent("admin.exTest.vpnHelp.waiting")
    expect(status.querySelector(".crest-loader")).not.toBeNull()
    expect(screen.queryByText("admin.exTest.vpnHelp.connected")).not.toBeInTheDocument()
  })

  it("shows Connected in the success colour and drops the loader", () => {
    render(<VpnDialog {...base} connected />)
    const done = screen.getByText("admin.exTest.vpnHelp.connected")
    expect(done.className).toContain("emerald")
    expect(document.querySelector(".crest-loader")).toBeNull()
  })

  it("opens the tester page in a new tab with a one-line hint, and hides it without an address", () => {
    const { rerender } = render(<VpnDialog {...base} probeUrl="http://10.128.1.1:8088/" />)
    const link = screen.getByRole("link", { name: "admin.exTest.vpnHelp.check" })
    expect(link).toHaveAttribute("href", "http://10.128.1.1:8088/")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"))
    expect(screen.getByText("admin.exTest.vpnHelp.checkHint")).toBeInTheDocument()
    rerender(<VpnDialog {...base} />)
    expect(screen.queryByRole("link", { name: "admin.exTest.vpnHelp.check" })).not.toBeInTheDocument()
  })

  it("keeps the config download button", () => {
    render(<VpnDialog {...base} />)
    expect(screen.getByRole("button", { name: "admin.exTest.vpnHelp.downloadButton" })).toBeInTheDocument()
  })
})
