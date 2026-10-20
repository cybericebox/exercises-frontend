import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { FlagHelp } from "./FlagHelp"

describe("FlagHelp", () => {
  it("links to the flags page of the guide", async () => {
    render(<FlagHelp />)
    const trigger = screen.getByRole("button")
    fireEvent.mouseEnter(trigger)
    fireEvent.focus(trigger)
    fireEvent.click(trigger)
    const link = await screen.findByRole("link", { name: "Докладніше про прапори" })
    expect(link).toHaveAttribute("href", expect.stringMatching(/^\/guide\/prapory\/?$/))
  })
})

it("opens a bounded dialog with a short trigger name and a keyboard reachable guide link", () => {
 render(<FlagHelp />)
 const trigger = screen.getByRole("button")
 expect(trigger.getAttribute("aria-label")!.length).toBeLessThan(100)
 fireEvent.click(trigger)
 expect(screen.getByRole("dialog")).toContainElement(screen.getByRole("link"))
})

it("bounds long help by the collision-aware available height on tablets", () => {
 render(<FlagHelp />)
 fireEvent.click(screen.getByRole("button"))
 const content = screen.getByRole("dialog")
 expect(content.style.maxHeight).toBe("min(36rem, 80dvh, var(--radix-popover-content-available-height))")
 expect(content).toHaveClass("overflow-y-auto")
 expect(screen.getByRole("link")).toBeInTheDocument()
})
