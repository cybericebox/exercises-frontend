import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { InboxButton } from "./InboxButton"

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn() }))
const access = vi.hoisted(() => ({ allowed: true }))
const navigation = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("@/api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/client")>()), apiGet: api.get, apiPatch: api.patch, apiPost: api.post }))
vi.mock("@/lib/useRole", () => ({ useRole: () => ({ can: () => access.allowed }) }))
vi.mock("next/navigation", () => ({ useRouter: () => navigation }))

const BASE = "2026-09-24T12:00:00Z|old"
const NEXT = "2026-09-24T12:01:00Z|new"
let autoIntersect = false
let observers: Array<{ trigger: () => void }> = []

type Route = { pulse?: (n: number) => { Cursor: string; Unread: number }; since?: (since: string, n: number) => Record<string, unknown>; list?: (url: URL) => Record<string, unknown> }

/** Routes the three inbox endpoints: pulse, since (news) and the list. */
function mockRoutes(route: Route) {
  const counter = { pulse: 0, since: 0 }
  api.get.mockImplementation((path: string) => {
    const url = new URL(path, "http://x")
    if (url.pathname.endsWith("/pulse")) return Promise.resolve({ Banners: "1", Inbox: (route.pulse ?? (() => ({ Cursor: BASE, Unread: 0 })))(counter.pulse++) })
    if (url.searchParams.has("since")) return Promise.resolve((route.since ?? (() => ({ Cursor: BASE, Items: [], Unread: 0 })))(url.searchParams.get("since")!, counter.since++))
    return Promise.resolve((route.list ?? (() => ({ Items: [], NextCursor: "" })))(url))
  })
}

function mockInbox(items: Record<string, unknown>[]) {
  const unread = items.filter((item) => !item.ReadAt).length
  mockRoutes({ pulse: () => ({ Cursor: BASE, Unread: unread }), since: () => ({ Cursor: BASE, Items: [], Unread: unread }), list: () => ({ Items: items, NextCursor: "" }) })
}

/** Baseline for the empty cursor, the news for the baseline cursor, nothing after that. */
const newsOnce = (items: Record<string, unknown>[], unread: number, baselineUnread = 0) => (since: string) =>
  since === "" ? { Cursor: BASE, Items: [], Unread: baselineUnread }
    : since === BASE ? { Cursor: NEXT, Items: items, Unread: unread }
      : { Cursor: NEXT, Items: [], Unread: unread }

const sinceCalls = () => api.get.mock.calls.map(([path]) => String(path)).filter((path) => path.includes("since="))

describe("top-bar inbox", () => {
  beforeEach(() => {
    autoIntersect = false
    observers = []
    vi.stubGlobal("IntersectionObserver", class {
      private callback: IntersectionObserverCallback
      private target: Element | null = null
      constructor(callback: IntersectionObserverCallback) { this.callback = callback; observers.push(this) }
      observe(target: Element) { this.target = target; if (autoIntersect) queueMicrotask(() => this.trigger()) }
      disconnect() { this.target = null }
      trigger() {
        if (this.target) this.callback([{ isIntersecting: true, target: this.target } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
      }
    })
    api.get.mockReset()
    api.patch.mockReset()
    api.post.mockReset()
    navigation.push.mockReset()
    access.allowed = true
    mockInbox([{ ID: "1", Title: "Запрошення", Body: "Деталі запрошення", Link: "", ReadAt: null, CreatedAt: "2026-09-24T12:00:00Z" }])
    api.patch.mockResolvedValue(undefined)
  })

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it("shows the message in place and marks it read without opening a detail view", async () => {
    render(<InboxButton />)
    expect(await screen.findByText("1")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /Вхідні/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Вхідні, непрочитані: 1" }))
    const row = (await screen.findByText("Запрошення")).closest("li")!
    fireEvent.click(within(row).getByRole("button", { name: "Позначити прочитаним" }))
    expect(screen.getByText("Деталі запрошення")).toBeInTheDocument()
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/notifications/inbox/1/read", {}))
  })

  it("a card with a link is clickable as a whole through its link; a card without one is not", async () => {
    mockInbox([
      { ID: "1", Title: "Доступ", Body: "", Link: "https://spring.example.org/manage/", ReadAt: null, CreatedAt: "2026-09-24T12:00:00Z" },
      { ID: "2", Title: "Без посилання", Body: "", Link: "", ReadAt: null, CreatedAt: "2026-09-24T11:00:00Z" },
    ])
    render(<InboxButton />)
    fireEvent.click(await screen.findByRole("button", { name: "Вхідні, непрочитані: 2" }))
    const [linked, plain] = await screen.findAllByRole("listitem")
    const link = within(linked).getByRole("link", { name: "Відкрити" })
    expect(link).toHaveAttribute("href", "https://spring.example.org/manage/")
    expect(link.className).toContain("after:inset-0")
    expect(linked.className).toContain("cursor-pointer")
    expect(within(plain).queryByRole("link")).not.toBeInTheDocument()
    expect(plain.className).not.toContain("cursor-pointer")
  })

  it("«Вирішено» sits above the card link and resolves without following it", async () => {
    mockInbox([{ ID: "1", Title: "Збій", Body: "", Link: "https://spring.example.org/manage/", ActionRequired: true, Resolvable: true, ReadAt: null, CreatedAt: "2026-09-24T12:00:00Z" }])
    api.post.mockResolvedValue(undefined)
    render(<InboxButton />)
    fireEvent.click(await screen.findByRole("button", { name: /Вхідні/ }))
    const row = await screen.findByRole("listitem")
    const resolve = within(row).getByRole("button", { name: "Вирішено" })
    // The link's pseudo-element covers the row; the button must be positioned above it.
    expect(resolve.className).toContain("relative")
    expect(resolve.className).toContain("z-10")
    fireEvent.click(resolve)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/notifications/inbox/1/resolve", {}))
    expect(api.patch).not.toHaveBeenCalled()
    expect(navigation.push).not.toHaveBeenCalled()
  })

  it("marks all messages read without leaving the current page", async () => {
    render(<InboxButton />)
    fireEvent.click(await screen.findByRole("button", { name: "Вхідні, непрочитані: 1" }))
    await screen.findByText("Запрошення")
    fireEvent.click(screen.getAllByRole("button", { name: "Позначити прочитаним" })[0])
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/notifications/inbox/read-all?site=exercises", {}))
    expect(screen.getByRole("button", { name: "Вхідні" })).toBeInTheDocument()
  })

  it("lists every notification and labels Event-bound ones with the Event name", async () => {
    mockInbox([
      { ID: "1", Title: "Старт", Body: "", Link: "", ReadAt: null, CreatedAt: "2026-09-24T12:00:00Z", EventID: "e1", EventName: "Зимовий CTF", EventTag: "winter" },
      { ID: "2", Title: "Акаунт", Body: "", Link: "", ReadAt: null, CreatedAt: "2026-09-24T11:00:00Z", EventID: null, EventName: null, EventTag: null },
    ])
    render(<InboxButton />)
    fireEvent.click(await screen.findByRole("button", { name: /Вхідні/ }))
    expect((await screen.findByText("Старт")).closest("li")).toHaveTextContent("Зимовий CTF")
    expect(screen.getByText("Акаунт").closest("li")).not.toHaveTextContent("Зимовий CTF")
    for (const [path] of api.get.mock.calls) expect(new URL(path as string, "http://x").searchParams.has("event")).toBe(false)
  })

  it("shows the saved notification icon in the inbox", async () => {
    mockInbox([{ ID: "1", Title: "Подія", Body: "Деталі", Link: "", Icon: "calendar", Tone: "info", AccentColor: "", ReadAt: null, CreatedAt: "2026-09-24T12:00:00Z" }])
    render(<InboxButton />)
    fireEvent.click(await screen.findByRole("button", { name: "Вхідні, непрочитані: 1" }))
    expect((await screen.findByText("Подія")).closest("li")).toContainHTML("lucide-calendar-days")
  })

  it("fills an underfull inbox automatically without a load-more button", async () => {
    autoIntersect = true
    const first = { ID: "recent", Title: "Останнє", Body: "", Link: "", ReadAt: null, CreatedAt: "2026-09-25T12:00:00Z" }
    const older = { ID: "older", Title: "Раніше", Body: "", Link: "", ReadAt: null, CreatedAt: "2026-09-24T12:00:00Z" }
    mockRoutes({
      pulse: () => ({ Cursor: BASE, Unread: 25 }),
      since: () => ({ Cursor: BASE, Items: [], Unread: 25 }),
      list: (url) => url.searchParams.has("before") ? { Items: [older], NextCursor: "" } : { Items: [first], NextCursor: "recent" },
    })
    render(<InboxButton />)
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    fireEvent.click(await screen.findByRole("button", { name: "Вхідні, непрочитані: 25" }))
    expect(await screen.findByText("Останнє")).toBeInTheDocument()
    expect(await screen.findByText("Раніше")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Вхідні, непрочитані: 25" })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining("before=recent"))
    expect(screen.queryByRole("button", { name: "Завантажити ще" })).not.toBeInTheDocument()
  })

  it("loads the next page when the last row becomes visible", async () => {
    const first = { ID: "recent", Title: "Останнє", Body: "", Link: "", ReadAt: null, CreatedAt: "2026-09-25T12:00:00Z" }
    const older = { ID: "older", Title: "Раніше", Body: "", Link: "", ReadAt: null, CreatedAt: "2026-09-24T12:00:00Z" }
    mockRoutes({
      pulse: () => ({ Cursor: BASE, Unread: 2 }),
      since: () => ({ Cursor: BASE, Items: [], Unread: 2 }),
      list: (url) => url.searchParams.has("before") ? { Items: [older], NextCursor: "" } : { Items: [first], NextCursor: "recent" },
    })
    render(<InboxButton />)
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    fireEvent.click(await screen.findByRole("button", { name: /Вхідні/ }))
    expect(await screen.findByText("Останнє")).toBeInTheDocument()
    expect(screen.queryByText("Раніше")).not.toBeInTheDocument()
    act(() => observers.at(-1)?.trigger())
    expect(await screen.findByText("Раніше")).toBeInTheDocument()
  })

  it("shows a safe transition link below the message", async () => {
    mockInbox([{ ID: "1", Title: "Подія", Body: "Деталі", Link: "/events", Actions: [{ label: "Інша дія", href: "/other" }], ReadAt: null, CreatedAt: "2026-09-24T12:00:00Z" }])
    render(<InboxButton />)
    fireEvent.click(await screen.findByRole("button", { name: "Вхідні, непрочитані: 1" }))
    expect(await screen.findByRole("link", { name: "Відкрити" })).toHaveAttribute("href", "/events")
    expect(screen.queryByRole("link", { name: "Інша дія" })).not.toBeInTheDocument()
  })

  it("does not turn a pop-in action into the optional inbox link", async () => {
    mockInbox([{ ID: "1", Title: "Подія", Body: "Деталі", Link: "", Actions: [{ label: "Перейти", href: "/events" }], ReadAt: null, CreatedAt: "2026-09-24T12:00:00Z" }])
    render(<InboxButton />)
    fireEvent.click(await screen.findByRole("button", { name: "Вхідні, непрочитані: 1" }))
    const title = await screen.findByText("Подія")
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(within(title.closest("li")!).getByRole("button", { name: "Позначити прочитаним" })).toBeInTheDocument()
  })

  it("pops only fresh unread messages with a configured duration", async () => {
    const old = { ID: "old", Title: "Старе", Body: "Вже було", Link: "", AutoDismissMs: 5000, ReadAt: null, CreatedAt: "2026-09-24T12:00:00Z" }
    const fresh = { ID: "new", Title: "Нове", Body: "Щойно прийшло", Link: "", AutoDismissMs: 5000, ReadAt: null, CreatedAt: "2026-09-24T12:01:00Z" }
    mockRoutes({
      pulse: (n) => n === 0 ? { Cursor: BASE, Unread: 1 } : { Cursor: NEXT, Unread: 2 },
      since: newsOnce([fresh], 2, 1),
      list: () => ({ Items: [old], NextCursor: "" }),
    })
    render(<InboxButton />)
    expect(await screen.findByRole("button", { name: "Вхідні, непрочитані: 1" })).toBeInTheDocument()
    expect(screen.queryByRole("status", { name: "Нове повідомлення" })).not.toBeInTheDocument()

    act(() => window.dispatchEvent(new Event("cybericebox:inbox-updated")))
    const popIn = await screen.findByRole("status", { name: "Нове повідомлення" })
    expect(popIn).toHaveTextContent("Нове")
    expect(screen.getByRole("button", { name: "Вхідні, непрочитані: 2" })).toBeInTheDocument()
  })

  it("pops a fresh message for five seconds when the template duration is empty", async () => {
    const fresh = { ID: "new", Title: "Нове", Body: "Деталі", Link: "", AutoDismissMs: null, ReadAt: null, CreatedAt: "2026-09-24T12:01:00Z" }
    mockRoutes({
      pulse: (n) => n === 0 ? { Cursor: BASE, Unread: 0 } : { Cursor: NEXT, Unread: 1 },
      since: newsOnce([fresh], 1),
    })
    render(<InboxButton />)
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    act(() => window.dispatchEvent(new Event("cybericebox:inbox-updated")))
    expect(await screen.findByRole("status", { name: "Нове повідомлення" })).toHaveTextContent("Нове")
  })

  it("removes a pop-in when another tab reads its message while the dropdown is open", async () => {
    const fresh = { ID: "new", Title: "Нове", Body: "Деталі", Link: "", Actions: [{ label: "Перейти", href: "/events" }], AutoDismissMs: 5000, ReadAt: null, CreatedAt: "2026-09-24T12:01:00Z" }
    let delta = 0
    mockRoutes({
      pulse: (n) => n === 0 ? { Cursor: BASE, Unread: 0 } : n === 1 ? { Cursor: NEXT, Unread: 1 } : { Cursor: NEXT, Unread: 0 },
      since: (since) => {
        if (since === "") return { Cursor: BASE, Items: [], Unread: 0 }
        delta += 1
        return delta === 1 ? { Cursor: NEXT, Items: [fresh], Unread: 1 } : { Cursor: NEXT, Items: [], Unread: 0 }
      },
      list: () => ({ Items: delta > 1 ? [{ ...fresh, ReadAt: "2026-09-24T12:02:00Z" }] : [], NextCursor: "" }),
    })
    render(<InboxButton />)
    expect(await screen.findByRole("button", { name: "Вхідні" })).toBeInTheDocument()
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))

    act(() => window.dispatchEvent(new Event("cybericebox:inbox-updated")))
    await screen.findByRole("status", { name: "Нове повідомлення" })
    fireEvent.click(screen.getByRole("button", { name: "Вхідні, непрочитані: 1" }))

    // A second tab reads the same message; the refreshed list keeps it out of pop-ins.
    act(() => window.dispatchEvent(new Event("cybericebox:inbox-updated")))
    await waitFor(() => expect(screen.queryByRole("status", { name: "Нове повідомлення" })).not.toBeInTheDocument())
  })

  it("never pops a fresh message that arrives already read", async () => {
    const fresh = { ID: "new", Title: "Вже прочитане", Body: "Деталі", Link: "", AutoDismissMs: 5000, ReadAt: "2026-09-24T12:01:01Z", CreatedAt: "2026-09-24T12:01:00Z" }
    mockRoutes({
      pulse: (n) => n === 0 ? { Cursor: BASE, Unread: 0 } : { Cursor: NEXT, Unread: 0 },
      since: newsOnce([fresh], 0),
    })
    render(<InboxButton />)
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    act(() => window.dispatchEvent(new Event("cybericebox:inbox-updated")))
    await waitFor(() => expect(sinceCalls()).toHaveLength(2))
    expect(screen.queryByRole("status", { name: "Нове повідомлення" })).not.toBeInTheDocument()
  })

  it("never reads the list while the dropdown is closed, and reads it behind the crest when it opens", async () => {
    let answer: () => void = () => {}
    mockRoutes({
      pulse: (n) => n === 0 ? { Cursor: BASE, Unread: 1 } : { Cursor: BASE, Unread: 0 },
      since: (since) => ({ Cursor: BASE, Items: [], Unread: since === "" ? 1 : 0 }),
    })
    const routed = api.get.getMockImplementation()!
    const lists = () => api.get.mock.calls.map(([path]) => String(path)).filter((path) => path.includes("/inbox") && !path.includes("since="))
    api.get.mockImplementation((path: string) => path.includes("/inbox") && !path.includes("since=")
      ? new Promise((resolve) => { answer = () => resolve({ Items: [{ ID: "1", Title: "Запрошення", Body: "", Link: "", ReadAt: null, CreatedAt: "2026-09-24T12:00:00Z" }], NextCursor: "" }) })
      : routed(path))
    render(<InboxButton />)
    await waitFor(() => expect(sinceCalls()).toHaveLength(1))
    // Unread moved without news (read elsewhere): only the since call.
    act(() => window.dispatchEvent(new Event("cybericebox:inbox-updated")))
    await waitFor(() => expect(sinceCalls()).toHaveLength(2))
    expect(lists()).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: /Вхідні/ }))
    expect(lists()).toHaveLength(1)
    await waitFor(() => expect(document.querySelector(".crest-loader")).not.toBeNull())
    await act(async () => { answer() })
    expect(await screen.findByText("Запрошення")).toBeInTheDocument()
  })

  it("marks a pop-in action read before navigating", async () => {
    const fresh = { ID: "new", Title: "Нове", Body: "Деталі", Link: "", Actions: [{ label: "Перейти", href: "/events" }], AutoDismissMs: 5000, ReadAt: null, CreatedAt: "2026-09-24T12:01:00Z" }
    mockRoutes({
      pulse: (n) => n === 0 ? { Cursor: BASE, Unread: 0 } : { Cursor: NEXT, Unread: 1 },
      since: newsOnce([fresh], 1),
    })
    render(<InboxButton />)
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    act(() => window.dispatchEvent(new Event("cybericebox:inbox-updated")))
    const popIn = await screen.findByRole("status", { name: "Нове повідомлення" })
    fireEvent.click(within(popIn).getByRole("button", { name: "Перейти" }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/notifications/inbox/new/read", {}))
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/events"))
  })

  it("centers the framed shared icon and disables read-all when the inbox is empty", async () => {
    mockInbox([])
    render(<InboxButton />)
    fireEvent.click(screen.getByRole("button", { name: "Вхідні" }))
    const empty = await screen.findByText("Немає сповіщень")
    expect(empty.closest("[data-empty-state]")?.querySelector("svg path")?.getAttribute("d"))
      .toBe("M4.5 5.5h15L21.5 18a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2l2-12.5Z")
    expect(empty.closest("[data-empty-state]")?.querySelector("span")).toHaveClass("border")
    expect(empty.closest("[data-empty-state]")?.querySelector("svg")).toHaveClass("h-5", "w-5")
    expect(empty.closest("[data-empty-state]")?.parentElement).toHaveClass("min-h-48", "items-center", "justify-center")
    expect(screen.getByRole("button", { name: "Позначити прочитаним" })).toBeDisabled()
    expect(document.querySelectorAll("svg.lucide-bell")).toHaveLength(2)
  })

  describe("categories (INBOX-DESIGN §8)", () => {
    const counts = { All: 3, Requests: 1, Personal: 1, Activity: 1 }
    const lab = { ID: "lab", Title: "Лабораторія впала", Body: "", Link: "", ReadAt: null, CreatedAt: "2026-09-24T12:00:00Z", EventName: "Зимовий CTF", Type: "event.lab.failed", Resolvable: true, Category: "requests", ActionRequired: true, ResolvedAt: null }
    const done = { ID: "done", Title: "Нова заявка", Body: "", Link: "", ReadAt: "2026-09-24T12:05:00Z", CreatedAt: "2026-09-24T12:03:00Z", Type: "event.application.submitted", Category: "requests", ActionRequired: true, ResolvedAt: "2026-09-24T12:04:00Z", Resolution: "approved", ResolvedBy: { ID: "u2", Name: "Іван П." } }
    const personal = { ID: "p", Title: "Особисте повідомлення", Body: "", Link: "", ReadAt: null, CreatedAt: "2026-09-24T11:00:00Z", Category: "personal", ActionRequired: false }

    function mockCategories(pollCounts: typeof counts = counts) {
      const all = [done, lab, personal]
      mockRoutes({
        pulse: () => ({ Cursor: BASE, Unread: 2 }),
        since: () => ({ Cursor: BASE, Items: [], Unread: 2, Counts: pollCounts, OtherEventsCount: 0 }),
        list: (url) => {
          const category = url.searchParams.get("category")
          return { Items: category ? all.filter((item) => item.Category === category) : all, NextCursor: "" }
        },
      })
    }

    it("opens on «Запити» when requests are open, lists open ones first and counts per tab", async () => {
      mockCategories()
      render(<InboxButton defaultTab="requestsIfOpen" />)
      fireEvent.click(await screen.findByRole("button", { name: "Вхідні: запитів у роботі 1, непрочитаних 2" }))
      expect(await screen.findByRole("tab", { name: "Запити, потребують дії: 1" })).toHaveAttribute("aria-selected", "true")
      expect(screen.getByRole("tab", { name: "Особисте: 1" })).toBeInTheDocument()
      await screen.findByText("Лабораторія впала")
      const rows = screen.getAllByRole("listitem")
      expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining("Лабораторія впала"), expect.stringContaining("Схвалив Іван П.")])
      expect(rows[1]).toHaveClass("opacity-60")
      expect(api.get).toHaveBeenCalledWith("/api/notifications/inbox?site=exercises&category=requests")
    })

    it("opens on «Усі» without open requests and marks only the current tab read", async () => {
      mockCategories({ All: 1, Requests: 0, Personal: 1, Activity: 0 })
      render(<InboxButton defaultTab="requestsIfOpen" />)
      fireEvent.click(await screen.findByRole("button", { name: "Вхідні, непрочитані: 1" }))
      expect(await screen.findByRole("tab", { name: "Усі: 1" })).toHaveAttribute("aria-selected", "true")
      fireEvent.click(screen.getByRole("tab", { name: "Особисте: 1" }))
      await screen.findByText("Особисте повідомлення")
      fireEvent.click(screen.getAllByRole("button", { name: "Позначити прочитаним" })[0])
      await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/notifications/inbox/read-all?site=exercises&category=personal", {}))
    })

    it("resolves an open «Лабораторія впала» request and shows why a resolve failed", async () => {
      mockCategories()
      const { ApiError } = await import("@/api/client")
      api.post.mockRejectedValueOnce(new ApiError(409, {}, "already", undefined, 70219)).mockResolvedValueOnce(undefined)
      render(<InboxButton defaultTab="requestsIfOpen" />)
      fireEvent.click(await screen.findByRole("button", { name: "Вхідні: запитів у роботі 1, непрочитаних 2" }))
      const row = (await screen.findByText("Лабораторія впала")).closest("li")!
      expect(within(screen.getByText("Нова заявка").closest("li")!).queryByRole("button", { name: "Вирішено" })).not.toBeInTheDocument()
      fireEvent.click(within(row).getByRole("button", { name: "Вирішено" }))
      expect(await screen.findByRole("alert")).toHaveTextContent("Запит уже вирішено")
      fireEvent.click(within(row).getByRole("button", { name: "Вирішено" }))
      await waitFor(() => expect(api.post).toHaveBeenLastCalledWith("/api/notifications/inbox/lab/resolve", {}))
    })

    it("keeps other requests resolvable while one resolve is pending", async () => {
      const lab2 = { ...lab, ID: "lab2", Title: "Друга лабораторія" }
      mockRoutes({
        pulse: () => ({ Cursor: BASE, Unread: 2 }),
        since: () => ({ Cursor: BASE, Items: [], Unread: 2, Counts: counts, OtherEventsCount: 0 }),
        list: () => ({ Items: [lab, lab2], NextCursor: "" }),
      })
      api.post.mockReturnValueOnce(new Promise(() => undefined)).mockResolvedValueOnce(undefined)
      render(<InboxButton defaultTab="requestsIfOpen" />)
      fireEvent.click(await screen.findByRole("button", { name: /Вхідні/ }))
      const first = (await screen.findByText("Лабораторія впала")).closest("li")!
      const second = screen.getByText("Друга лабораторія").closest("li")!
      fireEvent.click(within(first).getByRole("button", { name: "Вирішено" }))
      expect(within(first).getByRole("button", { name: /Вирішено/ })).toBeDisabled()
      expect(within(second).getByRole("button", { name: "Вирішено" })).toBeEnabled()
      fireEvent.click(within(second).getByRole("button", { name: "Вирішено" }))
      await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/notifications/inbox/lab2/resolve", {}))
    })

    it("shows only «Усі» when the backend sends no Counts", async () => {
      render(<InboxButton defaultTab="requestsIfOpen" />)
      fireEvent.click(await screen.findByRole("button", { name: "Вхідні, непрочитані: 1" }))
      await screen.findByText("Запрошення")
      expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
    })
  })

  it("asks the news again while the answer cursor is behind the pulse cursor, and only when the pulse changed", async () => {
    const first = { ID: "a", Title: "Перше", Body: "", Link: "", ReadAt: null, CreatedAt: "2026-09-24T12:01:00Z" }
    const second = { ID: "b", Title: "Друге", Body: "", Link: "", ReadAt: null, CreatedAt: "2026-09-24T12:02:00Z" }
    mockRoutes({
      pulse: (n) => n === 0 ? { Cursor: BASE, Unread: 0 } : { Cursor: "far", Unread: 2 },
      since: (since) => since === "" || since === "end" ? { Cursor: since === "" ? BASE : "end", Items: [], Unread: 0 }
        : since === BASE ? { Cursor: "mid", Items: [first], Unread: 1 } : { Cursor: "end", Items: [second], Unread: 2 },
    })
    render(<InboxButton />)
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    expect(sinceCalls()).toEqual(["/api/notifications/inbox?site=exercises&since="])
    act(() => window.dispatchEvent(new Event("cybericebox:inbox-updated")))
    await waitFor(() => expect(sinceCalls().slice(1)).toEqual([
      `/api/notifications/inbox?site=exercises&since=${encodeURIComponent(BASE)}`,
      "/api/notifications/inbox?site=exercises&since=mid",
      // the cursor stopped moving, so the loop ends even though it is still behind the pulse
      "/api/notifications/inbox?site=exercises&since=end",
    ]))
  })

  it("after an empty baseline the next request uses the epoch cursor and new items pop in", async () => {
    const EPOCH = "1970-01-01T00:00:00Z_00000000-0000-0000-0000-000000000000"
    const fresh = { ID: "new", Title: "Нове", Body: "Деталі", Link: "", AutoDismissMs: 5000, ReadAt: null, CreatedAt: "2026-09-24T12:01:00Z" }
    mockRoutes({
      pulse: (n) => n === 0 ? { Cursor: "", Unread: 0 } : { Cursor: NEXT, Unread: 1 },
      since: (since) => since === "" ? { Cursor: "", Items: [], Unread: 0 } : { Cursor: NEXT, Items: [fresh], Unread: 1 },
      list: () => ({ Items: [], NextCursor: "" }),
    })
    render(<InboxButton />)
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    act(() => window.dispatchEvent(new Event("cybericebox:inbox-updated")))
    expect(await screen.findByRole("status", { name: "Нове повідомлення" })).toHaveTextContent("Нове")
    expect(sinceCalls()[1]).toBe(`/api/notifications/inbox?site=exercises&since=${encodeURIComponent(EPOCH)}`)
  })

  it("a local change or a restored API asks the pulse, never the inbox directly", async () => {
    render(<InboxButton />)
    await waitFor(() => expect(sinceCalls()).toHaveLength(1))
    const pulses = () => api.get.mock.calls.filter(([path]) => String(path).includes("/pulse")).length
    const before = pulses()
    act(() => window.dispatchEvent(new Event("cybericebox:inbox-updated")))
    await waitFor(() => expect(pulses()).toBe(before + 1))
    // The pulse is unchanged, so no news are asked for.
    await act(async () => { await Promise.resolve() })
    expect(sinceCalls()).toHaveLength(1)
  })

  it("is absent without access to own notifications", () => {
    access.allowed = false
    render(<InboxButton />)
    expect(screen.queryByRole("button", { name: /Вхідні/ })).not.toBeInTheDocument()
  })
})
