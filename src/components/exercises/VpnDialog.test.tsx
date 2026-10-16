import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { VpnDialog } from "@/components/exercises/VpnDialog"
import { downloadBlob } from "@/lib/downloadBlob"

vi.mock("@/lib/downloadBlob", () => ({ downloadBlob: vi.fn() }))

const base = { open: true, config: "[Interface]", onClose: vi.fn() }

describe("VpnDialog — shared connection instructions", () => {
  it("shows readiness without a waiting loader and opens the instructions", () => {
    render(<VpnDialog {...base} connected={false} />)
    expect(screen.getByRole("status")).toHaveTextContent("Готовий до підключення")
    expect(document.querySelector(".crest-loader")).toBeNull()
    expect(screen.getByText("Інструкція").closest("details")).toHaveAttribute("open")
  })

  it("shows a connected shield and collapses the instructions after a handshake", () => {
    const { rerender } = render(<VpnDialog {...base} connected={false} />)
    rerender(<VpnDialog {...base} connected />)
    expect(screen.getByRole("status")).toHaveAttribute("data-vpn", "connected")
    expect(screen.getByRole("status")).toHaveTextContent("Підключено")
    expect(screen.getByText("Інструкція").closest("details")).not.toHaveAttribute("open")
    fireEvent.click(screen.getByText("Інструкція"))
    expect(screen.getByText("Інструкція").closest("details")).toHaveAttribute("open")
  })

  it("preserves unknown connection status separately from disconnected", () => {
    render(<VpnDialog {...base} connected={null} />)
    expect(screen.getByRole("status")).toHaveTextContent("VPN доступний")
    expect(screen.getByText(/Статус зʼєднання поки невідомий/)).toBeInTheDocument()
  })

  it("offers the official installer, app import and a command for the actual downloaded filename", () => {
    render(<VpnDialog {...base} connected={false} />)
    expect(screen.getByRole("link", { name: "WireGuard" })).toHaveAttribute("href", "https://www.wireguard.com/install/")
    expect(screen.getByText("У застосунку")).toBeInTheDocument()
    expect(screen.getByText("Або через термінал")).toBeInTheDocument()
    expect(screen.getByText("sudo wg-quick up ./cybericebox.conf")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Завантажити файл" }))
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "cybericebox.conf")
  })

  it("offers the probe only when an address is available", () => {
    const { rerender } = render(<VpnDialog {...base} probeUrl="http://10.128.1.1:8088/" />)
    const link = screen.getByRole("link", { name: /Перевірте зʼєднання/ })
    expect(link).toHaveAttribute("href", "http://10.128.1.1:8088/")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"))
    expect(screen.getByText("ping 10.128.1.1")).toBeInTheDocument()
    rerender(<VpnDialog {...base} />)
    expect(screen.queryByRole("link", { name: /Перевірте зʼєднання/ })).not.toBeInTheDocument()
  })

  it("closes from the header and keeps failed downloads visible", () => {
    vi.mocked(downloadBlob).mockImplementationOnce(() => { throw new Error("download") })
    render(<VpnDialog {...base} />)
    fireEvent.click(screen.getByRole("button", { name: "Завантажити файл" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Не вдалося завантажити")
    fireEvent.click(screen.getByRole("button", { name: "Закрити" }))
    expect(base.onClose).toHaveBeenCalled()
  })
})
