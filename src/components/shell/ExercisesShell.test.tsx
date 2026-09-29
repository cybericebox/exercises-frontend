import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ExercisesShell } from "./ExercisesShell"

const role = vi.hoisted(() => ({ value: { role: "admin" as string | null, isLoading: false, can: ((): boolean => true) as (perm: string) => boolean } }))
const rights = vi.hoisted(() => ({ value: { IsAdmin: true, CanCreateCatalog: true, CanPublish: true, CanDelete: true, CanExport: true, Events: [] as { ID: string; Name: string; Tag: string; CanWrite: boolean; InfrastructureAllowed: boolean }[] } }))

vi.mock("next/navigation", () => ({ usePathname: () => "/" }))
vi.mock("@/lib/useRole", () => ({ useRole: () => role.value }))
vi.mock("@/lib/origins", () => ({ publicDomain: "cybericebox.local", idOrigin: "https://id.cybericebox.local", mainOrigin: "https://cybericebox.local" }))
vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("./TopBar", () => ({ TopBar: () => <header>top</header> }))
vi.mock("./BannerStack", () => ({ BannerStack: () => null }))
vi.mock("@/api/exercises/access", () => ({ getExerciseAccess: () => Promise.resolve(rights.value) }))

describe("exercises shell", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.history.replaceState(null, "", "/")
    role.value = { role: "admin", isLoading: false, can: () => true }
    rights.value = { IsAdmin: true, CanCreateCatalog: true, CanPublish: true, CanDelete: true, CanExport: true, Events: [] }
  })

  it("renders the page", async () => {
    render(<ExercisesShell><span>content</span></ExercisesShell>)
    expect(await screen.findByText("content")).toBeInTheDocument()
  })

  it("shows the no-access panel for a user who is neither admin nor event member", async () => {
    role.value = { role: "user", isLoading: false, can: () => false }
    rights.value = { ...rights.value, IsAdmin: false, Events: [] }
    render(<ExercisesShell><span>content</span></ExercisesShell>)
    expect(await screen.findByText("exercises.noAccess.body")).toBeInTheDocument()
    expect(screen.queryByText("content")).not.toBeInTheDocument()
  })

  it("opens for an event manager without RBAC exercise permissions", async () => {
    role.value = { role: "user", isLoading: false, can: () => false }
    rights.value = { ...rights.value, IsAdmin: false, Events: [{ ID: "ev1", Name: "CTF", Tag: "ctf", CanWrite: true, InfrastructureAllowed: false }] }
    render(<ExercisesShell><span>content</span></ExercisesShell>)
    expect(await screen.findByText("content")).toBeInTheDocument()
  })
})
