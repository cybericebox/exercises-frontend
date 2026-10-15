import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { DateTimePicker } from "./date-time-picker"

describe("DateTimePicker", () => {
  it("uses the shared placeholder color until a date is selected", () => {
    const { rerender } = render(<DateTimePicker value="" onChange={vi.fn()} aria-label="Архівація" />)
    expect(screen.getByText("Оберіть дату й час", { selector: "span" })).toHaveClass("text-placeholder")
    rerender(<DateTimePicker value="2026-09-01T09:30" onChange={vi.fn()} aria-label="Архівація" />)
    expect(screen.getByText("1 вересня 2026, 09:30")).not.toHaveClass("text-placeholder")
  })

  it("opens a calendar popover, preserves the time and emits a local date-time", () => {
    const onChange = vi.fn()
    render(<DateTimePicker value="2026-09-01T09:30" onChange={onChange} aria-label="Початок" />)
    fireEvent.click(screen.getByRole("button", { name: "Початок" }))
    const calendar = screen.getByRole("dialog", { name: "Початок" })
    expect(calendar.className).not.toMatch(/shadow/)
    const selected = screen.getByRole("button", { name: "1 вересня 2026" })
    expect(selected).toHaveAttribute("aria-pressed", "true")
    fireEvent.keyDown(selected, { key: "ArrowDown" })
    expect(screen.getByRole("button", { name: "8 вересня 2026" })).toHaveAttribute("tabindex", "0")
    fireEvent.click(screen.getByRole("button", { name: "15 вересня 2026" }))
    expect(onChange).toHaveBeenCalledWith("2026-09-15T09:30")
  })

  it("sets the time before a day is picked", () => {
    const onChange = vi.fn()
    render(<DateTimePicker value="" onChange={onChange} aria-label="Початок" />)
    fireEvent.click(screen.getByRole("button", { name: "Початок" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Година" }), { target: { value: "18" } })
    expect(onChange.mock.lastCall?.[0]).toMatch(/^\d{4}-\d{2}-\d{2}T18:00$/)
  })
})
