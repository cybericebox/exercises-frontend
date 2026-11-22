import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { CheckMenu } from "./check-menu"
import { SelectMenu } from "./select-menu"

describe("selection marks in menus", () => {
  it("several items: every item has a square in the reserved column on the first line, filled when on", () => {
    render(<CheckMenu label="Params" values={["a"]} options={[{ value: "a", label: "A" }, { value: "b", label: "B", description: "long text" }]} onToggle={() => undefined} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "Params" }), { key: "ArrowDown" })
    const items = screen.getAllByRole("menuitemcheckbox")
    expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual(["true", "false"])
    for (const item of items) {
      const mark = item.querySelector("span[aria-hidden]")
      expect(mark).toHaveClass("left-2", "top-2", "h-4", "w-4", "border")
    }
  })

  it("one of many: the chosen item has a dot in the same column", () => {
    render(<SelectMenu value="a" onChange={() => undefined} ariaLabel="Pick" options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "Pick" }), { key: "ArrowDown" })
    const [chosen, other] = screen.getAllByRole("menuitemradio")
    expect(chosen.querySelector("svg")).not.toBeNull()
    expect(other.querySelector("svg")).toBeNull()
    expect(chosen.querySelector("span[aria-hidden]")).toHaveClass("left-2", "top-2", "h-4", "w-4")
  })
})
