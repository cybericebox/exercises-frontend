import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ExercisesShell } from "./ExercisesShell"

const role = vi.hoisted(() => ({ value: { role: "admin" as string | null, isLoading: false, can: ((): boolean => true) as (perm: string) => boolean } }))

vi.mock("next/navigation", () => ({ usePathname: () => "/" }))
vi.mock("@/lib/useRole", () => ({ useRole: () => role.value }))
vi.mock("@/lib/origins", () => ({ publicDomain: "cybericebox.local", idOrigin: "https://id.cybericebox.local", mainOrigin: "https://cybericebox.local" }))
vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("./TopBar", () => ({ TopBar: () => <header>top</header> }))
vi.mock("./BannerStack", () => ({ BannerStack: () => null }))

describe("exercises shell", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.history.replaceState(null, "", "/")
    role.value = { role: "admin", isLoading: false, can: () => true }
  })

  it("renders the page without a return bar by default", () => {
    render(<ExercisesShell><span>content</span></ExercisesShell>)
    expect(screen.getByText("content")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /exercises.returnToEvent/ })).not.toBeInTheDocument()
  })

  it("shows the return link for a platform URL and keeps it after navigation", async () => {
    window.history.replaceState(null, "", "/?return=https%3A%2F%2Fctf.cybericebox.local%2Fadmin&event=ev-1")
    const { unmount } = render(<ExercisesShell><span>content</span></ExercisesShell>)
    expect(await screen.findByRole("link", { name: /exercises.returnToEvent/ })).toHaveAttribute("href", "https://ctf.cybericebox.local/admin")
    unmount()
    window.history.replaceState(null, "", "/detail?id=x")
    render(<ExercisesShell><span>content</span></ExercisesShell>)
    expect(await screen.findByRole("link", { name: /exercises.returnToEvent/ })).toHaveAttribute("href", "https://ctf.cybericebox.local/admin")
  })

  it("ignores a foreign return URL", async () => {
    window.history.replaceState(null, "", "/?return=https%3A%2F%2Fevil.com%2F")
    render(<ExercisesShell><span>content</span></ExercisesShell>)
    await Promise.resolve()
    expect(screen.queryByRole("link", { name: /exercises.returnToEvent/ })).not.toBeInTheDocument()
  })

  it("shows the no-access panel without catalog permission", () => {
    role.value = { role: "user", isLoading: false, can: () => false }
    render(<ExercisesShell><span>content</span></ExercisesShell>)
    expect(screen.getByText("exercises.noAccess.body")).toBeInTheDocument()
    expect(screen.queryByText("content")).not.toBeInTheDocument()
  })
})
