import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { act } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FieldHelp } from "./field-help"
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

describe("HoverTooltip — short labels", () => {
  it("keeps a short label on one line and a long one wrapping", () => {
    const { unmount } = render(<HoverTooltip text="Завантажити VPN‑конфігурацію"><button type="button">a</button></HoverTooltip>)
    fireEvent.pointerEnter(screen.getByRole("button", { name: "a" }))
    expect(screen.getByRole("tooltip").className).toContain("whitespace-nowrap")
    unmount()
    render(<HoverTooltip text={"дуже довге пояснення ".repeat(5)}><button type="button">b</button></HoverTooltip>)
    fireEvent.pointerEnter(screen.getByRole("button", { name: "b" }))
    expect(screen.getByRole("tooltip").className).not.toContain("whitespace-nowrap")
  })

  it("follows its trigger when the trigger moves while open", async () => {
    render(<HoverTooltip text="Пояснення"><button type="button">Довідка</button></HoverTooltip>)
    const trigger = screen.getByRole("button", { name: "Довідка" })
    let top = 300
    trigger.parentElement!.getBoundingClientRect = () => ({ left: 100, right: 130, top, bottom: top + 30, width: 30, height: 30, x: 100, y: top, toJSON: () => ({}) })
    fireEvent.pointerEnter(trigger)
    expect(screen.getByRole("tooltip").style.top).toBe("293px")

    top = 400
    await waitFor(() => expect(screen.getByRole("tooltip").style.top).toBe("393px"))
  })
})

describe("HoverTooltip — contract", () => {
  afterEach(() => { vi.useRealTimers() })

  it("opens a real mouse hover only after 300 ms, never for touch", () => {
    vi.useFakeTimers()
    render(<HoverTooltip text="Пояснення"><button type="button">a</button></HoverTooltip>)
    const trigger = screen.getByRole("button", { name: "a" })
    fireEvent.pointerEnter(trigger, { pointerType: "touch" })
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    fireEvent.pointerLeave(trigger)

    fireEvent.pointerEnter(trigger, { pointerType: "mouse" })
    act(() => { vi.advanceTimersByTime(299) })
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(2) })
    expect(screen.getByRole("tooltip")).toBeInTheDocument()
  })

  it("keeps the bubble while the pointer is on it and closes on Esc", () => {
    render(<HoverTooltip text="Пояснення"><button type="button">a</button></HoverTooltip>)
    const trigger = screen.getByRole("button", { name: "a" })
    fireEvent.pointerEnter(trigger)
    const bubble = screen.getByRole("tooltip")
    expect(bubble.className).not.toContain("pointer-events-none")
    fireEvent.pointerLeave(trigger, { relatedTarget: bubble })
    fireEvent.pointerMove(bubble)
    expect(screen.getByRole("tooltip")).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    // dismissed until the pointer leaves: re-entering the same hover does not reopen it
    fireEvent.pointerEnter(trigger)
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    fireEvent.pointerLeave(trigger)
    fireEvent.pointerEnter(trigger)
    expect(screen.getByRole("tooltip")).toBeInTheDocument()
  })

  it("keeps a reason in aria-describedby permanently with describe=always", () => {
    render(<HoverTooltip text="Спершу збережіть" describe="always"><button type="button" aria-disabled="true">Тест</button></HoverTooltip>)
    expect(screen.getByRole("button", { name: "Тест" })).toHaveAccessibleDescription("Спершу збережіть")
  })
})

describe("FieldHelp", () => {
  it("is named «Довідка», describes by the text, toggles on tap and does not open on focus", () => {
    render(<FieldHelp text="Назва, яку бачать учасники." />)
    const button = screen.getByRole("button", { name: "Довідка" })
    expect(button).toHaveAccessibleDescription("Назва, яку бачать учасники.")

    fireEvent.focus(button)
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()

    fireEvent.pointerDown(button, { pointerType: "touch" })
    fireEvent.click(button)
    expect(screen.getByRole("tooltip")).toHaveTextContent("Назва, яку бачать учасники.")

    fireEvent.click(button)
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()

    fireEvent.click(button)
    fireEvent.pointerDown(document.body, { pointerType: "touch" })
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })
})
