import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ThemeSwitch } from "./ThemeSwitch"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

describe("admin theme switch", () => {
  it("offers light, dark and system choices", async () => {
    render(<ThemeSwitch />)
    await waitFor(() => expect(screen.getByRole("radio", { name: "theme.system" })).toHaveAttribute("aria-checked", "true"))
    expect(screen.getByRole("radio", { name: "theme.light" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("radio", { name: "theme.dark" }))
    expect(screen.getByRole("radio", { name: "theme.dark" })).toHaveAttribute("aria-checked", "true")
    expect(document.documentElement.dataset.theme).toBe("dark")
    expect(screen.getByRole("radio", { name: "theme.system" })).toBeInTheDocument()
  })
})
