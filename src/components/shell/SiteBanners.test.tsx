import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { SiteBanners } from "./SiteBanners"

// Fires the pulse loop's next tick: focus asks for an immediate pulse once the 5 s gap has passed.
async function advancePulse() {
  await act(async () => { vi.setSystemTime(Date.now() + 6_000); window.dispatchEvent(new Event("focus")) })
}

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }))
vi.mock("@/api/client", () => ({ apiGet: api.get, apiPatch: api.patch }))

// The pulse answers with a banner version; the list endpoint answers with what the test queued.
const list = vi.hoisted(() => ({ get: vi.fn() }))
let version = 1

const banner = (fields: Record<string, unknown> = {}) => ({ ID: "b1", Text: "Планові роботи", LinkURL: "", LinkLabel: "", Level: "info", Dismissible: true, Version: 1, ...fields })

describe("site banners", () => {
  beforeEach(() => {
    api.get.mockReset(); api.patch.mockReset(); list.get.mockReset(); localStorage.clear(); version = 1
    api.get.mockImplementation((path: string) => path.startsWith("/api/notifications/pulse") ? Promise.resolve({ Banners: String(version), Inbox: null }) : list.get(path))
  })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it("renders nothing without banners", async () => {
    list.get.mockResolvedValue([])
    const { container } = render(<SiteBanners />)
    await vi.waitFor(() => expect(list.get).toHaveBeenCalledWith("/api/notifications/banners?site=exercises"))
    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing when the request fails", async () => {
    list.get.mockRejectedValue(new Error("down"))
    const { container } = render(<SiteBanners />)
    await vi.waitFor(() => expect(list.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it("renders the text and a safe link with the default label", async () => {
    list.get.mockResolvedValue([banner({ LinkURL: "/status" })])
    render(<SiteBanners />)
    expect(await screen.findByText("Планові роботи")).toBeInTheDocument()
    expect(screen.getByRole("status", { name: "Оголошення" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Докладніше" })).toHaveAttribute("href", "/status")
  })

  it("uses the custom link label and accepts https links", async () => {
    list.get.mockResolvedValue([banner({ LinkURL: "https://example.com/x", LinkLabel: "Деталі" })])
    render(<SiteBanners />)
    expect(await screen.findByRole("link", { name: "Деталі" })).toHaveAttribute("href", "https://example.com/x")
  })

  it.each(["javascript:alert(1)", "//evil.example", "data:text/html,x"])("refuses the link %s", async (url) => {
    list.get.mockResolvedValue([banner({ LinkURL: url })])
    render(<SiteBanners />)
    await screen.findByText("Планові роботи")
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("preserves the authoritative server priority order", async () => {
    list.get.mockResolvedValue([banner({ ID: "c", Text: "Критично", Level: "critical" }), banner({ ID: "i", Text: "Інфо" })])
    render(<SiteBanners />)
    await screen.findByText("Критично")
    const texts = screen.getAllByText(/Інфо|Критично/).map((el) => el.textContent)
    expect(texts).toEqual(["Критично"])
    fireEvent.click(screen.getByRole("button", { name: "Ще 1 оголошення" }))
    expect(screen.getByRole("dialog", { name: "Інші оголошення" })).toHaveTextContent("Інфо")
  })

  it("dismiss hides the banner and persists it; only dismissible banners have the button", async () => {
    list.get.mockResolvedValue([banner(), banner({ ID: "b2", Text: "Без закриття", Dismissible: false })])
    const view = render(<SiteBanners />)
    await screen.findByText("Планові роботи")
    expect(screen.getAllByRole("button", { name: "Закрити оголошення" })).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "Закрити оголошення" }))
    expect(screen.queryByText("Планові роботи")).not.toBeInTheDocument()
    expect(screen.getByText("Без закриття")).toBeInTheDocument()
    expect(Object.keys(localStorage).some((key) => key.includes("b1_1"))).toBe(true)
    view.unmount()
    render(<SiteBanners />)
    await screen.findByText("Без закриття")
    expect(screen.queryByText("Планові роботи")).not.toBeInTheDocument()
  })

  it("an edited banner (new Version) reappears", async () => {
    localStorage.setItem("cib_site_banner_dismissed_b1_1", "1")
    list.get.mockResolvedValue([banner({ Version: 2 })])
    render(<SiteBanners />)
    expect(await screen.findByText("Планові роботи")).toBeInTheDocument()
  })

  it("refetches the list only when the pulse version changes, and keeps the banner during failure", async () => {
    list.get.mockResolvedValueOnce([banner()]).mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([banner({ Version: 2, Text: "Оновлено" })])
    render(<SiteBanners />)
    await screen.findByText("Планові роботи")
    // Same version: a pulse never asks for the list again.
    await advancePulse()
    expect(list.get).toHaveBeenCalledTimes(1)
    version = 2
    await advancePulse()
    await vi.waitFor(() => expect(list.get).toHaveBeenCalledTimes(2))
    expect(screen.getByText("Планові роботи")).toBeInTheDocument()
    // The failed fetch did not record the version, so the next pulse retries.
    await advancePulse()
    expect(await screen.findByText("Оновлено")).toBeInTheDocument()
  })

  it("dismisses a personal banner on the server and does not store it locally", async () => {
    api.patch.mockResolvedValue(undefined)
    list.get.mockResolvedValue([banner({ ID: "p1", Kind: "personal", Text: "Особисте" })])
    render(<SiteBanners />)
    await screen.findByText("Особисте")
    fireEvent.click(screen.getByRole("button", { name: "Закрити оголошення" }))
    expect(screen.queryByText("Особисте")).not.toBeInTheDocument()
    expect(api.patch).toHaveBeenCalledWith("/api/notifications/banners/p1/dismiss", {}, undefined, { required: false })
    expect(Object.keys(localStorage)).toHaveLength(0)
  })

  it("bounds ten announcements, reveals the remaining order, and promotes after dismissal", async () => {
    list.get.mockResolvedValue(Array.from({ length: 10 }, (_, index) => banner({ ID: `b${index}`, Text: `Announcement ${index}` })))
    const { container } = render(<SiteBanners />)
    await screen.findByText("Announcement 0")
    expect(container.querySelectorAll(".ib-site-banner__text")).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "Ще 9 оголошень" }))
    const panel = screen.getByRole("dialog", { name: "Інші оголошення" })
    expect(screen.getByRole("heading", { name: "Інші оголошення" })).toHaveFocus()
    expect([...panel.querySelectorAll(".ib-site-banner__text")].map((node) => node.textContent)).toEqual(Array.from({ length: 9 }, (_, index) => `Announcement ${index + 1}`))
    fireEvent.click(panel.querySelector<HTMLButtonElement>(".ib-site-banner__x")!)
    expect(screen.queryByText("Announcement 1")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Ще 8 оголошень" })).toBeInTheDocument()
    fireEvent.click(container.querySelector<HTMLButtonElement>(".ib-site-banner__x")!)
    expect(container).toHaveTextContent("Announcement 2")
    expect(container).not.toHaveTextContent("Announcement 0")
    expect(screen.getByRole("button", { name: "Ще 7 оголошень" })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole("heading", { name: "Інші оголошення" }), { key: "Escape" })
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Ще 7 оголошень" })).toHaveFocus())
  })

  it("does not throw when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked") })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked") })
    list.get.mockResolvedValue([banner()])
    render(<SiteBanners />)
    await screen.findByText("Планові роботи")
    fireEvent.click(screen.getByRole("button", { name: "Закрити оголошення" }))
    expect(screen.queryByText("Планові роботи")).not.toBeInTheDocument()
  })
})
