import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TestFlagCheck } from "./TestFlagCheck"
const check = vi.fn()
vi.mock("@/api/exercises/deploy", () => ({ checkDeployFlag: (...args: unknown[]) => check(...args) }))
vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
describe("flag response ownership", () => {
 it("keeps one pending request and hides its feedback after the input changes", async () => {
  let resolve!: (v: { Correct: boolean }) => void
  check.mockReturnValue(new Promise(r => { resolve = r }))
  const result = vi.fn()
  render(<TestFlagCheck deployId="d" taskId="t" taskName="Task" onResult={result} />)
  const input = screen.getByRole("textbox")
  fireEvent.change(input, { target: { value: "ICE{old}" } })
  fireEvent.keyDown(input, { key: "Enter" })
  fireEvent.change(input, { target: { value: "ICE{new}" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(check).toHaveBeenCalledTimes(1)
  await act(async () => resolve({ Correct: true }))
  expect(screen.queryByRole("status")).not.toBeInTheDocument()
  expect(result).toHaveBeenCalledWith(true)
 })
})
