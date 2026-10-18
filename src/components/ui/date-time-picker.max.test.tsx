import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { DateTimePicker } from "./date-time-picker"
import { t } from "@/i18n/t"

const label = (day: number) => new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric" }).format(new Date(2030, 4, day)).replace(/\s*р\.$/, "")

describe("date time picker max", () => {
  function open(onChange = vi.fn()) {
    render(<DateTimePicker value="2030-05-10T09:00" max={new Date(2030, 4, 10, 12, 0)} onChange={onChange} aria-label="start" />)
    fireEvent.click(screen.getByRole("button", { name: "start" }))
    return onChange
  }

  it("disables days after the limit and refuses to pick them", () => {
    const onChange = open()
    expect(screen.getByRole("button", { name: label(10) })).toBeEnabled()
    const later = screen.getByRole("button", { name: label(11) })
    expect(later).toBeDisabled()
    fireEvent.click(later)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: t("ui.dateTime.nextMonth") })).toBeDisabled()
  })

  it("clamps a later time on the last day to the limit", () => {
    const onChange = open()
    fireEvent.change(screen.getByRole("textbox", { name: t("ui.dateTime.hour") }), { target: { value: "23" } })
    expect(onChange).toHaveBeenLastCalledWith("2030-05-10T12:00")
  })
})
