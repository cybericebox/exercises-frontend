import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/lib/useRole", () => ({ useRole: () => ({ me: { Email: "a@example.test" } }) }))
const apiPost = vi.hoisted(() => vi.fn(async () => ({})))
vi.mock("@/api/client", () => ({ apiPost }))
vi.mock("@/lib/origins", () => ({ signInURL: vi.fn(() => ""), idOrigin: "https://id.x" }))

import { NoAccessScreen } from "./NoAccessScreen"

afterEach(() => { vi.unstubAllEnvs(); document.documentElement.removeAttribute("data-cfg-main-site-url") })

describe("NoAccessScreen main-site button", () => {
  it("is the main-site anchor with the cfg-main-only class (the stylesheet hides it while the setting is empty)", () => {
    vi.stubEnv("NEXT_PUBLIC_MAIN_SITE_URL", "https://example.org")
    render(<NoAccessScreen />)
    const home = screen.getByRole("link", { name: "auth.noAccess.home" })
    expect(home).toHaveAttribute("href", "https://example.org")
    expect(home).toHaveClass("cfg-main-only")
  })

  it("keeps the switch-account button without a class that hides it", () => {
    render(<NoAccessScreen />)
    expect(screen.getByRole("button", { name: "auth.noAccess.switch" }).className).not.toContain("cfg-")
  })

  it.each([["", "/"], ["https://example.org", "https://example.org"]])("with main site %j and no sign-in target, switching account falls back to %j (never to another site)", async (main, expected) => {
    const replace = vi.fn()
    const original = window.location
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, href: "https://exercises.x/", replace } })
    if (main) document.documentElement.setAttribute("data-cfg-main-site-url", main)
    try {
      render(<NoAccessScreen />)
      fireEvent.click(screen.getByRole("button", { name: "auth.noAccess.switch" }))
      await waitFor(() => expect(replace).toHaveBeenCalledWith(expected))
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original })
    }
  })
})
