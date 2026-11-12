import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
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

  it("keeps its one column within its width, so long unbreakable content shrinks instead of scrolling the dialog sideways", () => {
    render(<Dialog open><DialogContent><DialogTitle>Заголовок</DialogTitle></DialogContent></Dialog>)
    expect(screen.getByRole("dialog")).toHaveClass("grid-cols-[minmax(0,1fr)]")
  })

  it("returns focus to the element that opened it when it was opened from state, not through a trigger", async () => {
    function Host() {
      const [open, setOpen] = useState(false)
      return <>
        <button type="button" onClick={() => setOpen(true)}>Відкрити</button>
        <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Заголовок</DialogTitle><DialogDescription>Опис</DialogDescription></DialogContent></Dialog>
      </>
    }
    render(<Host />)
    const opener = screen.getByRole("button", { name: "Відкрити" })
    opener.focus()
    fireEvent.click(opener)
    await screen.findByRole("dialog")
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(opener).toHaveFocus())
  })
})
