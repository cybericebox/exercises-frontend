import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { SiteBanners } from "./SiteBanners"

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/api/client", () => ({ apiGet: api.get }))

const banner = (fields: Record<string, unknown> = {}) => ({ ID: "b1", Text: "Планові роботи", LinkURL: "", LinkLabel: "", Level: "info", Dismissible: true, Version: 1, ...fields })

describe("site banners", () => {
  beforeEach(() => { api.get.mockReset(); localStorage.clear() })
  afterEach(() => vi.restoreAllMocks())

  it("renders nothing without banners", async () => {
    api.get.mockResolvedValue([])
    const { container } = render(<SiteBanners />)
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledWith("/api/banners?site=exercises", undefined, { required: false }))
    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing when the request fails", async () => {
    api.get.mockRejectedValue(new Error("down"))
    const { container } = render(<SiteBanners />)
    await vi.waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it("renders the text and a safe link with the default label", async () => {
    api.get.mockResolvedValue([banner({ LinkURL: "/status" })])
    render(<SiteBanners />)
    expect(await screen.findByText("Планові роботи")).toBeInTheDocument()
    expect(screen.getByRole("status", { name: "Оголошення" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Докладніше" })).toHaveAttribute("href", "/status")
  })

  it("uses the custom link label and accepts https links", async () => {
    api.get.mockResolvedValue([banner({ LinkURL: "https://example.com/x", LinkLabel: "Деталі" })])
    render(<SiteBanners />)
    expect(await screen.findByRole("link", { name: "Деталі" })).toHaveAttribute("href", "https://example.com/x")
  })

  it.each(["javascript:alert(1)", "//evil.example", "data:text/html,x"])("refuses the link %s", async (url) => {
    api.get.mockResolvedValue([banner({ LinkURL: url })])
    render(<SiteBanners />)
    await screen.findByText("Планові роботи")
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("preserves the authoritative server priority order", async () => {
    api.get.mockResolvedValue([banner({ ID: "c", Text: "Критично", Level: "critical" }), banner({ ID: "i", Text: "Інфо" })])
    render(<SiteBanners />)
    await screen.findByText("Критично")
    const texts = screen.getAllByText(/Інфо|Критично/).map((el) => el.textContent)
    expect(texts).toEqual(["Критично"])
    fireEvent.click(screen.getByRole("button", { name: "Ще 1 оголошення" }))
    expect(screen.getByRole("dialog", { name: "Інші оголошення" })).toHaveTextContent("Інфо")
  })

  it("dismiss hides the banner and persists it; only dismissible banners have the button", async () => {
    api.get.mockResolvedValue([banner(), banner({ ID: "b2", Text: "Без закриття", Dismissible: false })])
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
    api.get.mockResolvedValue([banner({ Version: 2 })])
    render(<SiteBanners />)
    expect(await screen.findByText("Планові роботи")).toBeInTheDocument()
  })

  it("refreshes on focus and recovery while retaining the visible banner during failure", async () => {
    api.get.mockResolvedValueOnce([banner()]).mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([banner({ Version: 2, Text: "Оновлено" })])
    render(<SiteBanners />)
    await screen.findByText("Планові роботи")
    fireEvent(window, new Event("focus"))
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    expect(screen.getByText("Планові роботи")).toBeInTheDocument()
    fireEvent(window, new Event("online"))
    expect(await screen.findByText("Оновлено")).toBeInTheDocument()
  })

  it("bounds ten announcements, reveals the remaining order, and promotes after dismissal", async () => {
    api.get.mockResolvedValue(Array.from({ length: 10 }, (_, index) => banner({ ID: `b${index}`, Text: `Announcement ${index}` })))
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
    api.get.mockResolvedValue([banner()])
    render(<SiteBanners />)
    await screen.findByText("Планові роботи")
    fireEvent.click(screen.getByRole("button", { name: "Закрити оголошення" }))
    expect(screen.queryByText("Планові роботи")).not.toBeInTheDocument()
  })
})
