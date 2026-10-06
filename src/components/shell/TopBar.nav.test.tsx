// Under 640 px the section links live in the account menu, so «Пропозиції» is reachable on a phone.
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { TopBar } from "./TopBar"

vi.mock("next/navigation", () => ({ usePathname: () => "/proposals" }))
vi.mock("@/lib/useRole", () => ({ useRole: () => ({ me: { FirstName: "Ada", LastName: "L", Email: "a@example.org" } }) }))
vi.mock("./AccessContext", () => ({ useExerciseAccess: () => ({ access: { IsAdmin: true } }) }))
vi.mock("./InboxButton", () => ({ InboxButton: () => null }))
vi.mock("./RunningTestsMenu", () => ({ RunningTestsMenu: () => null }))
vi.mock("./BookingsMenu", () => ({ BookingsMenu: () => null }))
vi.mock("./ThemeSwitch", () => ({ ThemeSwitch: () => null }))
vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

describe("TopBar sections", () => {
  it("lists the sections in the account menu for small screens and marks the current page", () => {
    render(<TopBar />)
    fireEvent.pointerDown(screen.getByRole("button", { name: "admin.accountMenu" }), { button: 0, ctrlKey: false })
    const proposals = screen.getByRole("menuitem", { name: "exercises.nav.proposals" })
    expect(proposals).toHaveAttribute("href", "/proposals")
    expect(proposals).toHaveClass("sm:hidden")
    expect(proposals).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("menuitem", { name: "exercises.nav.catalog" })).toHaveAttribute("href", "/")
  })

  it("marks the active section of the top bar with the soft fill", () => {
    render(<TopBar />)
    expect(screen.getAllByRole("link", { name: "exercises.nav.proposals" })[0]).toHaveClass("bg-[var(--ib-soft)]")
  })
})
