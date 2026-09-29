import { afterEach, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { NotificationPopIn } from "./NotificationPopIn"

afterEach(() => vi.useRealTimers())

it("shows the configured action and closes after the template duration", () => {
  vi.useFakeTimers()
  const onClose = vi.fn()
  const onAction = vi.fn()
  render(<NotificationPopIn message={{ ID: "1", Title: "Запрошення", Body: "Вас запросили", AutoDismissMs: 5000, Actions: [{ label: "Перейти", href: "/events" }] }} onClose={onClose} onAction={onAction} />)

  fireEvent.click(screen.getByRole("button", { name: "Перейти" }))
  expect(onAction).toHaveBeenCalledWith("/events")
  act(() => vi.advanceTimersByTime(4999))
  expect(onClose).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1))
  expect(onClose).toHaveBeenCalledOnce()
})

it("pauses the countdown while the card is hovered", () => {
  vi.useFakeTimers()
  const onClose = vi.fn()
  render(<NotificationPopIn message={{ ID: "2", Title: "Нове", Body: "Текст", AutoDismissMs: 5000 }} onClose={onClose} onAction={vi.fn()} />)
  const card = screen.getByRole("status", { name: "Нове повідомлення" })

  act(() => vi.advanceTimersByTime(3000))
  fireEvent.mouseEnter(card)
  act(() => vi.advanceTimersByTime(5000))
  expect(onClose).not.toHaveBeenCalled()
  fireEvent.mouseLeave(card)
  act(() => vi.advanceTimersByTime(2000))
  expect(onClose).toHaveBeenCalledOnce()
})
