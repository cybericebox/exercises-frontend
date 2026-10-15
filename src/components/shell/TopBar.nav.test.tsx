// App navigation belongs to the sidebar, not the account menu.
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { TopBar } from "./TopBar"

vi.mock("next/navigation", () => ({ usePathname: () => "/proposals" }))
vi.mock("@/lib/useRole", () => ({ useRole: () => ({ me: { FirstName: "Ada", LastName: "L", Email: "a@example.org" } }) }))
vi.mock("./AccessContext", () => ({ useExerciseAccess: () => ({ access: { IsAdmin: true } }) }))
vi.mock("./InboxButton", () => ({ InboxButton: () => null }))
vi.mock("./RunningTestsMenu", () => ({ RunningTestsMenu: () => null }))
vi.mock("./BookingsMenu", () => ({ BookingsMenu: () => null }))
vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

describe("TopBar sections", () => {
  it("keeps application navigation out of the account menu and the top bar", () => {
    render(<TopBar />)
    fireEvent.pointerDown(screen.getByRole("button", { name: "admin.accountMenu" }), { button: 0, ctrlKey: false })
    expect(screen.queryByRole("menuitem", { name: "exercises.nav.proposals" })).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "exercises.nav.catalog" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "exercises.nav.proposals" })).not.toBeInTheDocument()
    expect(screen.getAllByRole("menuitem")[0]).toHaveTextContent("accountMenu.profile")
  })
})
