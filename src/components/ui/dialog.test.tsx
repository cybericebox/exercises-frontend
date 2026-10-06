import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "./dialog"

describe("DialogContent", () => {
  it("fits a short viewport, stacks its footer with a gap and avoids scale and slide motion", () => {
    render(<Dialog open><DialogContent><DialogTitle>Заголовок</DialogTitle><DialogDescription>Опис</DialogDescription><DialogFooter data-testid="footer" /></DialogContent></Dialog>)
    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveClass("max-h-[calc(100dvh-2rem)]", "overflow-y-auto")
    expect(dialog.className).not.toMatch(/zoom-|slide-|animate-in/)
    expect(screen.getByTestId("footer")).toHaveClass("gap-2")
    expect(screen.getByText("Заголовок")).toHaveClass("leading-snug")
  })
})
