import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ExercisesShell } from "./ExercisesShell"

const role = vi.hoisted(() => ({ value: { role: "admin" as string | null, isLoading: false, error: null as unknown, retry: (() => {}) as () => void, me: null as { Email: string } | null, can: ((): boolean => true) as (perm: string) => boolean } }))
const accessFailure = vi.hoisted(() => ({ value: null as unknown }))
const rights = vi.hoisted(() => ({ value: { IsAdmin: true, CanCreateCatalog: true, CanPublish: true, CanDelete: true, CanExport: true, CanImport: true, Events: [] as { ID: string; Name: string; Tag: string; CanWrite: boolean; InfrastructureAllowed: boolean }[] } }))

const nav = vi.hoisted(() => ({ path: "/" }))
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }))
vi.mock("@/lib/useRole", () => ({ useRole: () => role.value }))
vi.mock("@/lib/origins", () => ({ mainHost: "cybericebox.local", apiOrigin: "https://api.cybericebox.local", eventDomain: "cybericebox.local", adminOrigin: "https://admin.cybericebox.local", exercisesOrigin: "https://exercises.cybericebox.local", idOrigin: "https://id.cybericebox.local", mainOrigin: "https://cybericebox.local", signInURL: (back: string) => back.includes("/sign-in") ? "" : `https://id.cybericebox.local/sign-in?return_to=${encodeURIComponent(back)}` }))
vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/api/client", () => ({ apiPost: vi.fn() }))
vi.mock("./TopBar", () => ({ TopBar: () => <header>top</header> }))
vi.mock("./SiteBanners", () => ({ SiteBanners: () => <div role="status">announcements</div> }))
vi.mock("@/api/exercises/access", () => ({ getExerciseAccess: () => accessFailure.value ? Promise.reject(accessFailure.value) : Promise.resolve(rights.value) }))

const replace = vi.fn()
const original = window.location

describe("exercises shell", () => {
  beforeEach(() => {
    replace.mockReset()
    Object.defineProperty(window, "location", { configurable: true, value: { href: "https://exercises.cybericebox.local/catalog?x=1", replace } })
  })
  afterEach(() => Object.defineProperty(window, "location", { configurable: true, value: original }))

  beforeEach(() => {
    window.sessionStorage.clear()
    window.history.replaceState(null, "", "/")
    role.value = { role: "admin", isLoading: false, error: null, retry: () => {}, me: null, can: () => true }
    rights.value = { IsAdmin: true, CanCreateCatalog: true, CanPublish: true, CanDelete: true, CanExport: true, CanImport: true, Events: [] }
    accessFailure.value = null
  })

  it("gives the lab testing page the whole screen: no top bar", async () => {
    nav.path = "/test"
    render(<ExercisesShell><span>lab</span></ExercisesShell>)
    expect(await screen.findByText("lab")).toBeInTheDocument()
    expect(screen.queryByText("top")).not.toBeInTheDocument()
    nav.path = "/"
  })

  it("puts the skip link first and the page in <main id=\"main\">, also on the lab page", async () => {
    const { container, unmount } = render(<ExercisesShell><span>content</span></ExercisesShell>)
    const skip = await screen.findByRole("link", { name: "exercises.shell.skipToContent" })
    expect(skip).toHaveAttribute("href", "#main")
    expect(container.firstElementChild).toBe(skip)
    expect(screen.getByRole("main")).toHaveAttribute("id", "main")
    // One inner padding for every page, as in the admin app: 16px on a phone, 24px from md.
    expect(screen.getByRole("main")).toHaveClass("p-4", "md:p-6")
    // A flex column filling the screen: pages stretch to its bottom by flex, the padding counted inside; it is the
    // containing block of its absolutely placed descendants, so none of them scrolls the document.
    expect(screen.getByRole("main")).toHaveClass("relative", "flex", "flex-col", "min-h-0", "flex-1", "overflow-auto")
    // A page is never squeezed below its content: a long page (the guide) scrolls the main area inside its own frame.
    expect(screen.getByRole("main")).toHaveClass("[&>*]:shrink-0")
    unmount()
    nav.path = "/test"
    render(<ExercisesShell><span>lab</span></ExercisesShell>)
    expect(await screen.findByRole("link", { name: "exercises.shell.skipToContent" })).toHaveAttribute("href", "#main")
    expect(screen.getByRole("main")).toHaveAttribute("id", "main")
    nav.path = "/"
  })

  it("places announcements above navigation", async () => {
    render(<ExercisesShell><span>content</span></ExercisesShell>)
    await screen.findByText("content")
    const announcements = screen.getByText("announcements")
    const navigation = screen.getByText("top")
    expect(announcements.compareDocumentPosition(navigation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("renders the page", async () => {
    render(<ExercisesShell><span>content</span></ExercisesShell>)
    expect(await screen.findByText("content")).toBeInTheDocument()
  })

  it("shows the no-access panel for a user who is neither admin nor event member", async () => {
    role.value = { role: "user", isLoading: false, error: null, retry: () => {}, me: { Email: "a@b.test" }, can: () => false }
    rights.value = { ...rights.value, IsAdmin: false, Events: [] }
    render(<ExercisesShell><span>content</span></ExercisesShell>)
    expect(await screen.findByText("auth.noAccess.body")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "auth.noAccess.switch" })).toBeInTheDocument()
    expect(screen.queryByText("content")).not.toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it("redirects a visitor without a session straight to the sign-in, with the loader and no button", () => {
    role.value = { role: null, isLoading: false, error: null, retry: () => {}, me: null, can: () => false }
    render(<ExercisesShell><span>content</span></ExercisesShell>)
    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith(`https://id.cybericebox.local/sign-in?return_to=${encodeURIComponent(window.location.href)}`)
    expect(screen.getByRole("status")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("shows the 500 error page on a failed session check, retry runs the check again, no redirect", () => {
    const retry = vi.fn()
    const failure = Object.assign(new Error("API error 503"), { status: 503, requestId: "0a1b2c3d-4e5f-6789-abcd-ef0123456789" })
    role.value = { role: null, isLoading: false, error: failure, retry, me: null, can: () => false }
    render(<ExercisesShell><span>content</span></ExercisesShell>)
    expect(screen.getByText("500")).toBeInTheDocument()
    expect(screen.getByText("error.page.ref")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "error.load.retry" }))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
    expect(screen.queryByText("content")).not.toBeInTheDocument()
  })

  it("opens for an event manager without RBAC exercise permissions", async () => {
    role.value = { role: "user", isLoading: false, error: null, retry: () => {}, me: null, can: () => false }
    rights.value = { ...rights.value, IsAdmin: false, Events: [{ ID: "ev1", Name: "CTF", Tag: "ctf", CanWrite: true, InfrastructureAllowed: false }] }
    render(<ExercisesShell><span>content</span></ExercisesShell>)
    expect(await screen.findByText("content")).toBeInTheDocument()
  })

  it("shows a load error with retry, not «no access», when the rights could not be read", async () => {
    role.value = { role: "user", isLoading: false, error: null, retry: () => {}, me: { Email: "a@b.test" }, can: () => false }
    rights.value = { ...rights.value, IsAdmin: false, Events: [{ ID: "ev1", Name: "CTF", Tag: "ctf", CanWrite: true, InfrastructureAllowed: false }] }
    accessFailure.value = Object.assign(new Error("API error 503"), { status: 503 })
    render(<ExercisesShell><span>content</span></ExercisesShell>)
    const retry = await screen.findByRole("button", { name: "error.load.retry" })
    expect(screen.queryByText("auth.noAccess.body")).not.toBeInTheDocument()
    expect(screen.queryByText("content")).not.toBeInTheDocument()
    accessFailure.value = null
    fireEvent.click(retry)
    expect(await screen.findByText("content")).toBeInTheDocument()
  })
})
