// «Налаштування файлів cookie» in the account menu: always shown (no GA needed), a link to the
// main-site cookie policy that opens the consent panel instead of navigating.
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { CONSENT_OPEN_EVENT } from "@/lib/consent"
import { TopBar } from "./TopBar"

vi.mock("next/navigation", () => ({ usePathname: () => "/" }))
vi.mock("@/lib/useRole", () => ({ useRole: () => ({ me: { FirstName: "Ada", LastName: "L", Email: "a@example.org" } }) }))
vi.mock("./AccessContext", () => ({ useExerciseAccess: () => ({ access: { IsAdmin: false } }) }))
vi.mock("./InboxButton", () => ({ InboxButton: () => null }))
vi.mock("./ThemeSwitch", () => ({ ThemeSwitch: () => null }))
vi.mock("@/lib/origins", async (orig) => ({ ...(await orig<typeof import("@/lib/origins")>()), idOrigin: "https://id.x", adminOrigin: "https://admin.x", mainOrigin: "https://x" }))
vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

describe("TopBar cookie settings", () => {
  it("is always in the account menu and opens the consent panel without navigating", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ANALYTICS_ID", "")
    const opened = vi.fn()
    window.addEventListener(CONSENT_OPEN_EVENT, opened)
    render(<TopBar />)
    const trigger = screen.getByRole("button", { name: "admin.accountMenu" })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    const item = screen.getByRole("menuitem", { name: "consent.settings" })
    expect(item.tagName).toBe("A")
    expect(item).toHaveAttribute("href", "https://x/cookies")
    expect(fireEvent.click(item)).toBe(false) // navigation cancelled
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument()
    // opens after the menu hands focus back to its trigger
    await waitFor(() => expect(opened).toHaveBeenCalledTimes(1))
    window.removeEventListener(CONSENT_OPEN_EVENT, opened)
    vi.unstubAllEnvs()
  })
})
