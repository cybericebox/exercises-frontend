import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { InboxButton } from "./InboxButton"

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn() }))
const access = vi.hoisted(() => ({ allowed: true }))
const navigation = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("@/api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/client")>()), apiGet: api.get, apiPatch: api.patch, apiPost: api.post }))
vi.mock("@/lib/useRole", () => ({ useRole: () => ({ can: () => access.allowed }) }))
vi.mock("next/navigation", () => ({ useRouter: () => navigation }))

const BASE_CURSOR = { ID: "old", CreatedAt: "2026-09-24T12:00:00Z" }
const NEW_CURSOR = { ID: "new", CreatedAt: "2026-09-24T12:01:00Z" }
let autoIntersect = false
let observers: Array<{ trigger: () => void }> = []

function mockInbox(items: Record<string, unknown>[]) {
  api.get.mockImplementation((path: string) => Promise.resolve(path.includes("/poll")
    ? { Cursor: BASE_CURSOR, NewInbox: [], UnreadCount: items.filter((item) => !item.ReadAt).length }
    : { Items: items, NextCursor: null }))
}

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

  it("marks all messages read without leaving the current page", async () => {
    render(<InboxButton />)
    fireEvent.click(await screen.findByRole("button", { name: "Вхідні, непрочитані: 1" }))
    await screen.findByText("Запрошення")
    fireEvent.click(screen.getAllByRole("button", { name: "Позначити прочитаним" })[0])
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/notifications/inbox/read-all", {}))
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
    api.get.mockImplementation((path: string) => Promise.resolve(path.endsWith("/poll")
      ? { Cursor: BASE_CURSOR, NewInbox: [], UnreadCount: 25 }
      : path.includes("before_id=")
        ? { Items: [older], NextCursor: null }
        : { Items: [first], NextCursor: { ID: first.ID, CreatedAt: first.CreatedAt } }))
    render(<InboxButton />)
    fireEvent.click(await screen.findByRole("button", { name: "Вхідні, непрочитані: 25" }))
    expect(await screen.findByText("Останнє")).toBeInTheDocument()
    expect(await screen.findByText("Раніше")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Вхідні, непрочитані: 25" })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining("before_id=recent"))
    expect(screen.queryByRole("button", { name: "Завантажити ще" })).not.toBeInTheDocument()
  })

  it("loads the next page when the last row becomes visible", async () => {
    const first = { ID: "recent", Title: "Останнє", Body: "", Link: "", ReadAt: null, CreatedAt: "2026-09-25T12:00:00Z" }
    const older = { ID: "older", Title: "Раніше", Body: "", Link: "", ReadAt: null, CreatedAt: "2026-09-24T12:00:00Z" }
    api.get.mockImplementation((path: string) => Promise.resolve(path.endsWith("/poll")
      ? { Cursor: BASE_CURSOR, NewInbox: [], UnreadCount: 2 }
      : path.includes("before_id=")
        ? { Items: [older], NextCursor: null }
        : { Items: [first], NextCursor: { ID: first.ID, CreatedAt: first.CreatedAt } }))
    render(<InboxButton />)
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
    expect(screen.getByRole("link", { name: "Відкрити" })).toHaveAttribute("href", "/events")
    expect(screen.queryByRole("link", { name: "Інша дія" })).not.toBeInTheDocument()
  })

  it("does not turn a pop-in action into the optional inbox link", async () => {
    mockInbox([{ ID: "1", Title: "Подія", Body: "Деталі", Link: "", Actions: [{ label: "Перейти", href: "/events" }], ReadAt: null, CreatedAt: "2026-09-24T12:00:00Z" }])
    render(<InboxButton />)
    fireEvent.click(await screen.findByRole("button", { name: "Вхідні, непрочитані: 1" }))
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(within(screen.getByText("Подія").closest("li")!).getByRole("button", { name: "Позначити прочитаним" })).toBeInTheDocument()
  })

  it("pops only fresh unread messages with a configured duration", async () => {
    const old = { ID: "old", Title: "Старе", Body: "Вже було", Link: "", AutoDismissMs: 5000, ReadAt: null, CreatedAt: "2026-09-24T12:00:00Z" }
    const fresh = { ID: "new", Title: "Нове", Body: "Щойно прийшло", Link: "", AutoDismissMs: 5000, ReadAt: null, CreatedAt: "2026-09-24T12:01:00Z" }
    api.get.mockImplementation((path: string) => Promise.resolve(path.includes("/poll?")
      ? { Cursor: NEW_CURSOR, NewInbox: [fresh], UnreadCount: 2 }
      : path.endsWith("/poll")
        ? { Cursor: BASE_CURSOR, NewInbox: [], UnreadCount: 1 }
        : { Items: [old], NextCursor: null }))
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
    api.get.mockImplementation((path: string) => Promise.resolve(path.includes("/poll?")
      ? { Cursor: NEW_CURSOR, NewInbox: [fresh], UnreadCount: 1 }
      : path.endsWith("/poll")
        ? { Cursor: null, NewInbox: [], UnreadCount: 0 }
        : { Items: [], NextCursor: null }))
    render(<InboxButton />)
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    act(() => window.dispatchEvent(new Event("cybericebox:inbox-updated")))
    expect(await screen.findByRole("status", { name: "Нове повідомлення" })).toHaveTextContent("Нове")
  })

  it("removes a pop-in when another tab reads its message", async () => {
    const fresh = { ID: "new", Title: "Нове", Body: "Деталі", Link: "", Actions: [{ label: "Перейти", href: "/events" }], AutoDismissMs: 5000, ReadAt: null, CreatedAt: "2026-09-24T12:01:00Z" }
    let delta = 0
    api.get.mockImplementation((path: string) => {
      if (path.includes("/poll?")) {
        delta += 1
        return Promise.resolve(delta === 1
          ? { Cursor: NEW_CURSOR, NewInbox: [fresh], UnreadCount: 1 }
          : { Cursor: NEW_CURSOR, NewInbox: [], UnreadCount: 0 })
      }
      if (path.endsWith("/poll")) return Promise.resolve({ Cursor: null, NewInbox: [], UnreadCount: 0 })
      return Promise.resolve({ Items: delta > 1 ? [{ ...fresh, ReadAt: "2026-09-24T12:02:00Z" }] : [], NextCursor: null })
    })
    render(<InboxButton />)
    expect(await screen.findByRole("button", { name: "Вхідні" })).toBeInTheDocument()
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))

    act(() => window.dispatchEvent(new Event("cybericebox:inbox-updated")))
    await screen.findByRole("status", { name: "Нове повідомлення" })

    // A second tab reads the same message; a refresh must keep it out of pop-ins.
    act(() => window.dispatchEvent(new Event("cybericebox:inbox-updated")))
    await waitFor(() => expect(screen.getByRole("button", { name: "Вхідні" })).toBeInTheDocument())
    expect(screen.queryByRole("status", { name: "Нове повідомлення" })).not.toBeInTheDocument()
  })

  it("does not flash a fresh message already read in another tab", async () => {
    const fresh = { ID: "new", Title: "Вже прочитане", Body: "Деталі", Link: "", AutoDismissMs: 5000, ReadAt: null, CreatedAt: "2026-09-24T12:01:00Z" }
    api.get.mockImplementation((path: string) => Promise.resolve(path.includes("/poll?")
      ? { Cursor: NEW_CURSOR, NewInbox: [fresh], UnreadCount: 0 }
      : path.endsWith("/poll")
        ? { Cursor: null, NewInbox: [], UnreadCount: 0 }
        : { Items: [{ ...fresh, ReadAt: "2026-09-24T12:01:01Z" }], NextCursor: null }))
    render(<InboxButton />)
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    act(() => window.dispatchEvent(new Event("cybericebox:inbox-updated")))
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(4))
    expect(screen.queryByRole("status", { name: "Нове повідомлення" })).not.toBeInTheDocument()
  })

  it("marks a pop-in action read before navigating", async () => {
    const fresh = { ID: "new", Title: "Нове", Body: "Деталі", Link: "", Actions: [{ label: "Перейти", href: "/events" }], AutoDismissMs: 5000, ReadAt: null, CreatedAt: "2026-09-24T12:01:00Z" }
    api.get.mockImplementation((path: string) => Promise.resolve(path.includes("/poll?")
      ? { Cursor: NEW_CURSOR, NewInbox: [fresh], UnreadCount: 1 }
      : path.endsWith("/poll")
        ? { Cursor: null, NewInbox: [], UnreadCount: 0 }
        : { Items: [], NextCursor: null }))
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
    const lab = { ID: "lab", Title: "Лабораторія впала", Body: "", Link: "", ReadAt: null, CreatedAt: "2026-09-24T12:00:00Z", EventName: "Зимовий CTF", Type: "event.lab.failed", Category: "requests", ActionRequired: true, ResolvedAt: null }
    const done = { ID: "done", Title: "Нова заявка", Body: "", Link: "", ReadAt: "2026-09-24T12:05:00Z", CreatedAt: "2026-09-24T12:03:00Z", Type: "event.application.submitted", Category: "requests", ActionRequired: true, ResolvedAt: "2026-09-24T12:04:00Z", Resolution: "approved", ResolvedBy: { ID: "u2", Name: "Іван П." } }
    const personal = { ID: "p", Title: "Особисте повідомлення", Body: "", Link: "", ReadAt: null, CreatedAt: "2026-09-24T11:00:00Z", Category: "personal", ActionRequired: false }

    function mockCategories(pollCounts: typeof counts = counts) {
      api.get.mockImplementation((path: string) => {
        const url = new URL(path, "http://x")
        if (url.pathname.endsWith("/poll")) return Promise.resolve({ Cursor: BASE_CURSOR, NewInbox: [], UnreadCount: 2, Counts: pollCounts, OtherEventsCount: 0 })
        const category = url.searchParams.get("category")
        const all = [done, lab, personal]
        return Promise.resolve({ Items: category ? all.filter((item) => item.Category === category) : all, NextCursor: null })
      })
    }

    it("opens on «Запити» when requests are open, lists open ones first and counts per tab", async () => {
      mockCategories()
      render(<InboxButton defaultTab="requestsIfOpen" />)
      fireEvent.click(await screen.findByRole("button", { name: "Вхідні, непрочитані: 3" }))
      expect(await screen.findByRole("tab", { name: "Запити: 1" })).toHaveAttribute("aria-selected", "true")
      expect(screen.getByRole("tab", { name: "Особисте: 1" })).toBeInTheDocument()
      await screen.findByText("Лабораторія впала")
      const rows = screen.getAllByRole("listitem")
      expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining("Лабораторія впала"), expect.stringContaining("Схвалив Іван П.")])
      expect(rows[1]).toHaveClass("opacity-60")
      expect(api.get).toHaveBeenCalledWith("/api/notifications/inbox?category=requests")
    })

    it("opens on «Усі» without open requests and marks only the current tab read", async () => {
      mockCategories({ All: 1, Requests: 0, Personal: 1, Activity: 0 })
      render(<InboxButton defaultTab="requestsIfOpen" />)
      fireEvent.click(await screen.findByRole("button", { name: "Вхідні, непрочитані: 1" }))
      expect(await screen.findByRole("tab", { name: "Усі: 1" })).toHaveAttribute("aria-selected", "true")
      fireEvent.click(screen.getByRole("tab", { name: "Особисте: 1" }))
      await screen.findByText("Особисте повідомлення")
      fireEvent.click(screen.getAllByRole("button", { name: "Позначити прочитаним" })[0])
      await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/notifications/inbox/read-all?category=personal", {}))
    })

    it("resolves an open «Лабораторія впала» request and shows why a resolve failed", async () => {
      mockCategories()
      const { ApiError } = await import("@/api/client")
      api.post.mockRejectedValueOnce(new ApiError(409, {}, "already", undefined, 70219)).mockResolvedValueOnce(undefined)
      render(<InboxButton defaultTab="requestsIfOpen" />)
      fireEvent.click(await screen.findByRole("button", { name: "Вхідні, непрочитані: 3" }))
      const row = (await screen.findByText("Лабораторія впала")).closest("li")!
      expect(within(screen.getByText("Нова заявка").closest("li")!).queryByRole("button", { name: "Вирішено" })).not.toBeInTheDocument()
      fireEvent.click(within(row).getByRole("button", { name: "Вирішено" }))
      expect(await screen.findByRole("alert")).toHaveTextContent("Запит уже вирішено")
      fireEvent.click(within(row).getByRole("button", { name: "Вирішено" }))
      await waitFor(() => expect(api.post).toHaveBeenLastCalledWith("/api/notifications/inbox/lab/resolve", {}))
    })

    it("keeps other requests resolvable while one resolve is pending", async () => {
      const lab2 = { ...lab, ID: "lab2", Title: "Друга лабораторія" }
      api.get.mockImplementation((path: string) => Promise.resolve(path.includes("/poll")
        ? { Cursor: BASE_CURSOR, NewInbox: [], UnreadCount: 2, Counts: counts, OtherEventsCount: 0 }
        : { Items: [lab, lab2], NextCursor: null }))
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

  it("is absent without access to own notifications", () => {
    access.allowed = false
    render(<InboxButton />)
    expect(screen.queryByRole("button", { name: /Вхідні/ })).not.toBeInTheDocument()
  })
})
