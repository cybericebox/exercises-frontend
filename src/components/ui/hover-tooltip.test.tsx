import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { HoverTooltip } from "./hover-tooltip"

describe("HoverTooltip", () => {
  it("closes on pointer leave even when its trigger keeps focus", () => {
    render(<HoverTooltip text="Пояснення"><button type="button">Довідка</button></HoverTooltip>)
    const trigger = screen.getByRole("button", { name: "Довідка" })

    fireEvent.pointerEnter(trigger)
    fireEvent.focus(trigger)
    fireEvent.click(trigger)
    expect(screen.getByRole("tooltip")).toBeInTheDocument()

    fireEvent.pointerLeave(trigger)
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })

  it("closes when the pointer moves outside after opening", () => {
    render(<HoverTooltip text="Пояснення"><button type="button">Довідка</button></HoverTooltip>)
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Довідка" }))
    expect(screen.getByRole("tooltip")).toBeInTheDocument()

    fireEvent.pointerMove(document.body)
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })

  it("closes when the pointer leaves the browser window", () => {
    render(<HoverTooltip text="Пояснення"><button type="button">Довідка</button></HoverTooltip>)
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Довідка" }))
    expect(screen.getByRole("tooltip")).toBeInTheDocument()

    fireEvent.pointerOut(window, { relatedTarget: null })
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })

  it("closes when the browser loses focus", () => {
    render(<HoverTooltip text="Пояснення"><button type="button">Довідка</button></HoverTooltip>)
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Довідка" }))
    expect(screen.getByRole("tooltip")).toBeInTheDocument()

    fireEvent.blur(window)
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })

  it("places a long tooltip below when it would be clipped above", () => {
    const bounds = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const height = this.getAttribute("role") === "tooltip" ? 300 : 20
      return { left: 100, right: 120, top: 80, bottom: 80 + height, width: 20, height,
        x: 100, y: 80, toJSON: () => ({}) } as DOMRect
    })
    try {
      render(<HoverTooltip text={"Довга підказка ".repeat(30)}><button type="button">Довідка</button></HoverTooltip>)
      fireEvent.pointerEnter(screen.getByRole("button", { name: "Довідка" }))
      expect(screen.getByRole("tooltip")).toHaveStyle({ top: "107px", transform: "translate(-50%, 0)" })
    } finally {
      bounds.mockRestore()
    }
  })
  it("describes the child only while open when describe is set", () => {
    render(<HoverTooltip text="Пояснення" describe><button type="button">Довідка</button></HoverTooltip>)
    const trigger = screen.getByRole("button", { name: "Довідка" })
    expect(trigger).not.toHaveAttribute("aria-describedby")

    fireEvent.focus(trigger)
    expect(trigger).toHaveAccessibleDescription("Пояснення")

    fireEvent.blur(trigger)
    expect(trigger).not.toHaveAttribute("aria-describedby")
  })

  it("opens a truncated hint only when the text overflows", () => {
    render(<HoverTooltip text="Повний текст" truncated><span>Повний текст</span></HoverTooltip>)
    const text = screen.getByText("Повний текст")
    fireEvent.pointerEnter(text)
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()

    Object.defineProperty(text, "scrollWidth", { configurable: true, value: 200 })
    Object.defineProperty(text, "clientWidth", { configurable: true, value: 100 })
    fireEvent.pointerEnter(text)
    expect(screen.getByRole("tooltip")).toHaveTextContent("Повний текст")
  })
})
