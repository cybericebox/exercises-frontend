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
    await vi.waitFor(() => expect(api.get).toHaveBeenCalled())
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

  it("shows critical before info", async () => {
    api.get.mockResolvedValue([banner({ ID: "i", Text: "Інфо" }), banner({ ID: "c", Text: "Критично", Level: "critical" })])
    render(<SiteBanners />)
    await screen.findByText("Критично")
    const texts = screen.getAllByText(/Інфо|Критично/).map((el) => el.textContent)
    expect(texts).toEqual(["Критично", "Інфо"])
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
