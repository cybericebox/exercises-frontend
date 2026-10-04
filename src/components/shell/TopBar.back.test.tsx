// The catalog's back arrow: only when opened from admin or an event site, named by its destination.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { TopBar } from "./TopBar"

vi.mock("next/navigation", () => ({ usePathname: () => "/" }))
vi.mock("@/lib/useRole", () => ({ useRole: () => ({ me: { FirstName: "Ada", LastName: "L", Email: "a@example.org" } }) }))
vi.mock("./AccessContext", () => ({ useExerciseAccess: () => ({ access: { IsAdmin: true } }) }))
vi.mock("./InboxButton", () => ({ InboxButton: () => null }))
vi.mock("./RunningTestsMenu", () => ({ RunningTestsMenu: () => null }))
vi.mock("./ThemeSwitch", () => ({ ThemeSwitch: () => null }))
vi.mock("@/lib/origins", () => ({
  mainHost: "cybericebox.local",
  apiOrigin: "https://api.cybericebox.local",
  idOrigin: "https://id.cybericebox.local",
  adminOrigin: "https://admin.cybericebox.local",
  mainOrigin: "https://cybericebox.local",
  exercisesOrigin: "https://exercises.cybericebox.local",
  eventDomain: "cybericebox.local",
}))
vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

const open = (search: string) => {
  window.history.replaceState(null, "", `/${search}`)
  return render(<TopBar />)
}

describe("TopBar back arrow", () => {
  beforeEach(() => window.sessionStorage.clear())

  it("leads back to admin with its tooltip", async () => {
    open("?return_to=https%3A%2F%2Fadmin.cybericebox.local%2Fevents")
    const arrow = await screen.findByRole("link", { name: "back.toAdmin" })
    expect(arrow).toHaveAttribute("href", "https://admin.cybericebox.local/events")
    expect(arrow).not.toHaveAttribute("title")
    fireEvent.focus(arrow)
    expect(screen.getByRole("tooltip")).toHaveTextContent("back.toAdmin")
  })

  it("leads back to the event from the older ?return= and keeps it after navigation", async () => {
    const { unmount } = open("?return=https%3A%2F%2Fctf.cybericebox.local%2Fmanage%2Fexercises&event=ev-1")
    expect(await screen.findByRole("link", { name: "back.toEvent" })).toHaveAttribute("href", "https://ctf.cybericebox.local/manage/exercises")
    unmount()
    open("detail?id=x")
    expect(await screen.findByRole("link", { name: "back.toEvent" })).toHaveAttribute("href", "https://ctf.cybericebox.local/manage/exercises")
  })

  it("is hidden for the landing, id and foreign sources", async () => {
    for (const source of ["https://cybericebox.local/", "https://id.cybericebox.local/profile", "https://evil.com/"]) {
      window.sessionStorage.clear()
      const { unmount } = open(`?return_to=${encodeURIComponent(source)}`)
      await screen.findByRole("button", { name: "admin.accountMenu" })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(screen.queryByRole("link", { name: /back\./ }), source).not.toBeInTheDocument()
      unmount()
    }
  })
})
