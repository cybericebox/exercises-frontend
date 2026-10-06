import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { Segmented } from "./segmented"

const options = [{ value: "a", label: "A" }, { value: "b", label: "B" }, { value: "c", label: "C" }]

describe("Segmented", () => {
  it("has one tab stop on the checked option", () => {
    render(<Segmented value="b" onChange={vi.fn()} options={options} ariaLabel="Group" />)
    expect(screen.getByRole("radiogroup", { name: "Group" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "B" })).toHaveAttribute("tabindex", "0")
    expect(screen.getByRole("radio", { name: "A" })).toHaveAttribute("tabindex", "-1")
  })

  it("arrows, Home and End select and move the focus, wrapping around", () => {
    const onChange = vi.fn()
    render(<Segmented value="a" onChange={onChange} options={options} ariaLabel="Group" />)
    const first = screen.getByRole("radio", { name: "A" })
    fireEvent.keyDown(first, { key: "ArrowLeft" })
    expect(onChange).toHaveBeenLastCalledWith("c")
    expect(screen.getByRole("radio", { name: "C" })).toHaveFocus()
    fireEvent.keyDown(first, { key: "ArrowRight" })
    expect(onChange).toHaveBeenLastCalledWith("b")
    fireEvent.keyDown(first, { key: "End" })
    expect(onChange).toHaveBeenLastCalledWith("c")
    fireEvent.keyDown(first, { key: "Home" })
    expect(onChange).toHaveBeenLastCalledWith("a")
  })
})
