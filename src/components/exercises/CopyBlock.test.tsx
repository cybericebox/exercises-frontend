import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CopyBlock, copyBlockUrl } from "./CopyBlock"
const labels = { copy: "Copy", copied: "Copied", open: "Open", copyFailed: "Copy failed" }
describe("resolved copy block", () => {
 it.each(["javascript:alert(1)", "data:text/html,bad", "//example.test", "https://name:password@example.test", "https://good.test\\@evil.test", "https://good.test/a b"])('rejects unsafe value %s', (value) => {
  expect(copyBlockUrl(value)).toBeNull()
 })
 it("copies exact plain text and acknowledges completion without exposing HTML", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  render(<CopyBlock value="<script>literal & text</script>" labels={labels} />)
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy" })))
  expect(writeText).toHaveBeenCalledWith("<script>literal & text</script>")
  expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument()
  expect(document.querySelector("script")).toBeNull()
 })
 it("handles clipboard rejection and lets the same action retry", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } })
  render(<CopyBlock value="cmd" labels={labels} />)
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy" })))
  expect(screen.getByRole("status")).toHaveTextContent("Copy failed")
  expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled()
 })
 it("forwards a validated web open to the catalog proxy handler", () => {
  const open = vi.fn()
  render(<CopyBlock value="http://10.0.0.5:8080" labels={labels} onOpen={open} />)
  fireEvent.click(screen.getByRole("button", { name: "Open" }))
  expect(open).toHaveBeenCalledWith("http://10.0.0.5:8080/")
 })
 it("never acknowledges an old copy after the resolved value changes and returns", async () => {
  let resolve!: () => void
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockReturnValue(new Promise<void>(r => { resolve = r })) } })
  const { rerender } = render(<CopyBlock value="old" labels={labels} />)
  fireEvent.click(screen.getByRole("button", { name: "Copy" }))
  rerender(<CopyBlock value="new" labels={labels} />)
  rerender(<CopyBlock value="old" labels={labels} />)
  await act(async () => resolve())
  expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument()
 })
})

it("does not restore old copied feedback when the value returns after a successful copy", async () => {
 Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
 const { rerender } = render(<CopyBlock value="A" labels={labels} />)
 await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy" })))
 expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument()
 rerender(<CopyBlock value="B" labels={labels} />)
 rerender(<CopyBlock value="A" labels={labels} />)
 expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument()
})
