import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/api/exercises/deploy", () => ({ openDeployLink: vi.fn() }))

import { ApiError } from "@/api/client"
import { openDeployLink } from "@/api/exercises/deploy"
import { t } from "@/i18n/t"
import { CONSOLE_FRAME_TIMEOUT_MS, ConsolePanel } from "./ConsolePanel"

const props = { deployId: "d1", device: "r1", allowed: true, reason: "", onClose: vi.fn() }
const link = { URL: `https://terminal.labs.${process.env.NEXT_PUBLIC_DOMAIN}/_auth?t=x`, ExpiresAt: "2026-11-12T10:00:00Z" }

describe("ConsolePanel", () => {
  beforeEach(() => { vi.mocked(openDeployLink).mockReset(); props.onClose.mockReset() })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it("asks for the console link of the device and embeds the page the lab serves", async () => {
    vi.mocked(openDeployLink).mockResolvedValue(link)
    render(<ConsolePanel {...props} />)
    const frame = await screen.findByTitle(t("ed.d.console.frame", { device: "r1" }))
    expect(openDeployLink).toHaveBeenCalledWith("d1", "r1", 0, "terminal")
    expect(frame.getAttribute("src")).toBe(link.URL)
    // The lab decides by the origin in the Referer, so the referrer is never dropped.
    expect(frame.getAttribute("referrerpolicy")).toBe("origin")
    // Least privilege: no top navigation, popups or modals.
    const sandbox = frame.getAttribute("sandbox") ?? ""
    expect(sandbox.split(" ").sort()).toEqual(["allow-downloads", "allow-forms", "allow-same-origin", "allow-scripts"])
    expect(frame.getAttribute("allow")).toBe("clipboard-read; clipboard-write")
    expect(screen.getByRole("heading", { name: "r1" })).toBeTruthy()
    fireEvent.load(frame)
    expect(screen.queryByText(t("ed.d.console.blocked", { device: "r1" }))).toBeNull()
  })

  it("never frames an address outside the console origin; it offers the new tab instead", async () => {
    vi.mocked(openDeployLink).mockResolvedValue({ ...link, URL: "https://evil.example.test/_auth?t=x" })
    render(<ConsolePanel {...props} />)
    expect(await screen.findByText(t("ed.d.console.blocked", { device: "r1" }))).toBeTruthy()
    expect(screen.queryByTitle(t("ed.d.console.frame", { device: "r1" }))).toBeNull()
    expect(screen.getAllByRole("button", { name: t("ed.d.console.newTab") }).length).toBeGreaterThan(0)
  })

  it("closes from its header", async () => {
    vi.mocked(openDeployLink).mockResolvedValue(link)
    render(<ConsolePanel {...props} />)
    await screen.findByTitle(t("ed.d.console.frame", { device: "r1" }))
    fireEvent.click(screen.getByRole("button", { name: t("ed.d.console.close") }))
    expect(props.onClose).toHaveBeenCalled()
  })

  it("opens the console in a new tab with a fresh link (the link is single use)", async () => {
    vi.mocked(openDeployLink).mockResolvedValue(link)
    const tab = { opener: {} as unknown, location: { href: "" }, close: vi.fn() }
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window)
    render(<ConsolePanel {...props} />)
    await screen.findByTitle(t("ed.d.console.frame", { device: "r1" }))
    fireEvent.click(screen.getAllByRole("button", { name: t("ed.d.console.newTab") })[0])
    await waitFor(() => expect(tab.location.href).toBe(link.URL))
    expect(tab.opener).toBeNull()
    expect(openDeployLink).toHaveBeenCalledTimes(2)
  })

  it("the link endpoint answering 404 (no console in the lab) is the app's error state, not a frame", async () => {
    vi.mocked(openDeployLink).mockRejectedValue(new ApiError(404, null, "no", undefined, 33518))
    render(<ConsolePanel {...props} />)
    expect(await screen.findByText(t("ed.d.console.none", { device: "r1" }))).toBeTruthy()
    expect(screen.queryByTitle(t("ed.d.console.frame", { device: "r1" }))).toBeNull()
  })

  it("code 33518 alone also means no console", async () => {
    vi.mocked(openDeployLink).mockRejectedValue(new ApiError(400, null, "no", undefined, 33518))
    render(<ConsolePanel {...props} />)
    expect(await screen.findByText(t("ed.d.console.none", { device: "r1" }))).toBeTruthy()
  })

  it("laboratories without the console: no link is asked for and the reason is shown", async () => {
    render(<ConsolePanel {...props} allowed={false} reason="Ця можливість недоступна в жодній лабораторії" />)
    expect(await screen.findByText("Ця можливість недоступна в жодній лабораторії")).toBeTruthy()
    expect(openDeployLink).not.toHaveBeenCalled()
  })

  it("another failure of the link says so and can be retried", async () => {
    vi.mocked(openDeployLink).mockRejectedValueOnce(new ApiError(500, null, "boom")).mockResolvedValue(link)
    render(<ConsolePanel {...props} />)
    expect(await screen.findByText(t("ed.d.console.failed", { device: "r1" }))).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: t("error.load.retry") }))
    expect(await screen.findByTitle(t("ed.d.console.frame", { device: "r1" }))).toBeTruthy()
  })

  it("a frame that never shows is replaced by the error state with a way to the new tab, never left blank", async () => {
    vi.useFakeTimers()
    vi.mocked(openDeployLink).mockResolvedValue(link)
    render(<ConsolePanel {...props} />)
    // let the link arrive without the real clock
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const frame = screen.getByTitle(t("ed.d.console.frame", { device: "r1" }))
    await act(async () => { vi.advanceTimersByTime(CONSOLE_FRAME_TIMEOUT_MS + 10) })
    expect(screen.getByText(t("ed.d.console.blocked", { device: "r1" }))).toBeTruthy()
    expect(frame.className).toContain("hidden")
    expect(screen.getAllByRole("button", { name: t("ed.d.console.newTab") }).length).toBeGreaterThan(0)
  })

  it("keeps «Термінал не відображається?» with the new-tab button next to a loaded frame", async () => {
    vi.mocked(openDeployLink).mockResolvedValue(link)
    render(<ConsolePanel {...props} />)
    await screen.findByTitle(t("ed.d.console.frame", { device: "r1" }))
    expect(screen.getByText(t("ed.d.console.notShown"))).toBeTruthy()
  })

  it("a blocked pop-up is said so", async () => {
    vi.mocked(openDeployLink).mockResolvedValue(link)
    vi.spyOn(window, "open").mockReturnValue(null)
    render(<ConsolePanel {...props} />)
    await screen.findByTitle(t("ed.d.console.frame", { device: "r1" }))
    fireEvent.click(screen.getAllByRole("button", { name: t("ed.d.console.newTab") })[0])
    expect((await screen.findByRole("alert")).textContent).toBe(t("ed.d.console.popup"))
  })
})
