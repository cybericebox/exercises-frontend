/**
 * A floating panel portalled out of an open dialog keeps its own wheel/touch scrolling: the dialog's scroll lock
 * cancels wheel events that start outside its content, and a portalled list would never scroll.
 */
import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { Dialog, DialogContent, DialogTitle } from "./dialog"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu"

const items = Array.from({ length: 40 }, (_, index) => `Item ${index + 1}`)

function wheel(target: Element) {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 120 })
  target.dispatchEvent(event)
  return event
}

describe("floating panels inside a dialog", () => {
  it("a popover's list scrolls: its own overflow, and the dialog's lock never cancels its wheel", () => {
    render(<Dialog open><DialogContent><DialogTitle>Import</DialogTitle>
      <Popover open><PopoverTrigger>Pick</PopoverTrigger><PopoverContent data-testid="panel">{items.map((item) => <button key={item}>{item}</button>)}</PopoverContent></Popover>
    </DialogContent></Dialog>)
    const panel = screen.getByTestId("panel")
    expect(panel).toHaveClass("overflow-y-auto", "overscroll-contain", "max-h-[var(--radix-popover-content-available-height)]")
    // The dialog's lock listens on the document; the panel's wheel never gets there, so nothing cancels it.
    let reachedDocument = false
    const spy = () => { reachedDocument = true }
    document.addEventListener("wheel", spy)
    const event = wheel(screen.getByText("Item 30"))
    document.removeEventListener("wheel", spy)
    expect(reachedDocument).toBe(false)
    expect(event.defaultPrevented).toBe(false)
    fireEvent.touchMove(screen.getByText("Item 30"))
  })

  it("a menu's list does the same", () => {
    render(<Dialog open><DialogContent><DialogTitle>Edit</DialogTitle>
      <DropdownMenu open modal={false}><DropdownMenuTrigger>Open</DropdownMenuTrigger><DropdownMenuContent data-testid="menu">{items.map((item) => <DropdownMenuItem key={item}>{item}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
    </DialogContent></Dialog>)
    expect(screen.getByTestId("menu")).toHaveClass("overflow-y-auto", "overscroll-contain")
    let reachedDocument = false
    const spy = () => { reachedDocument = true }
    document.addEventListener("wheel", spy)
    const event = wheel(screen.getByText("Item 35"))
    document.removeEventListener("wheel", spy)
    expect(reachedDocument).toBe(false)
    expect(event.defaultPrevented).toBe(false)
  })
})
