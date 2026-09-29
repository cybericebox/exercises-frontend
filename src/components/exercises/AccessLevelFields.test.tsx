import { describe, expect, it, vi, beforeEach } from "vitest"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { useState } from "react"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/api/events/list", () => ({ listEventOptions: vi.fn(), listNearestEvents: vi.fn(), getEventOption: vi.fn() }))

import { getEventOption, listEventOptions, listNearestEvents } from "@/api/events/list"
import { AccessLevelFields, type AccessValue } from "./AccessLevelFields"

const nearest = vi.mocked(listNearestEvents)
const search = vi.mocked(listEventOptions)
const byId = vi.mocked(getEventOption)

function Harness({ initial }: { initial: AccessValue }) {
  const [value, setValue] = useState(initial)
  return <AccessLevelFields value={value} onChange={setValue} allowOwn={false} />
}

describe("AccessLevelFields event picker", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nearest.mockResolvedValue([{ ID: "e1", Name: "Winter CTF", Tag: "winter" }, { ID: "e2", Name: "Spring CTF", Tag: "spring" }])
    search.mockResolvedValue([{ ID: "e7", Name: "Autumn Cup", Tag: "autumn" }])
    byId.mockResolvedValue({ ID: "e9", Name: "Old Cup", Tag: "old" })
  })

  it("offers «unavailable to everyone» as the last option", async () => {
    render(<Harness initial={{ level: "all", eventIds: [] }} />)
    await act(async () => {})
    const radios = screen.getAllByRole("radio")
    expect(radios.map((radio) => (radio as HTMLInputElement).value)).toEqual(["all", "selected", "none"])
    fireEvent.click(screen.getByRole("radio", { name: /exercises.access.level.none/ }))
    expect(screen.getByRole("radio", { name: /exercises.access.level.none/ })).toBeChecked()
    expect(screen.queryByTestId("access-events")).not.toBeInTheDocument()
  })

  it("prefetches the nearest events before «selected» is chosen", async () => {
    render(<Harness initial={{ level: "all", eventIds: [] }} />)
    expect(nearest).toHaveBeenCalledTimes(1)
    await act(async () => {})
    fireEvent.click(screen.getByRole("radio", { name: /exercises.access.level.selected/ }))
    expect(screen.getByText("Winter CTF")).toBeInTheDocument()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("keeps a fixed-height list block and loads inside it", async () => {
    let resolve: (items: { ID: string; Name: string; Tag: string }[]) => void = () => undefined
    nearest.mockReturnValue(new Promise((r) => { resolve = r }))
    render(<Harness initial={{ level: "selected", eventIds: [] }} />)
    const block = screen.getByTestId("access-events")
    expect(block).toHaveClass("h-56")
    expect(within(block).getByRole("status")).toBeInTheDocument()
    expect(screen.getByText("exercises.access.selected")).toBeInTheDocument()
    await act(async () => resolve([{ ID: "e1", Name: "Winter CTF", Tag: "winter" }]))
    expect(screen.getByTestId("access-events")).toBe(block)
    expect(within(block).getByText("Winter CTF")).toBeInTheDocument()
  })

  it("pins already selected events that are not among the nearest ones", async () => {
    render(<Harness initial={{ level: "selected", eventIds: ["e9"] }} />)
    expect(await screen.findByText("Old Cup")).toBeInTheDocument()
    expect(byId).toHaveBeenCalledWith("e9")
    expect(screen.getByRole("checkbox", { name: /Old Cup/ })).toBeChecked()
  })

  it("finds other events through server search and keeps the selection pinned", async () => {
    vi.useFakeTimers()
    try {
      render(<Harness initial={{ level: "selected", eventIds: ["e1"] }} />)
      await act(async () => {})
      fireEvent.change(screen.getByRole("searchbox", { name: "exercises.access.search" }), { target: { value: "aut" } })
      expect(within(screen.getByTestId("access-events")).getByRole("status")).toBeInTheDocument()
      await act(async () => { await vi.advanceTimersByTimeAsync(300) })
      expect(search).toHaveBeenCalledWith("aut", 20)
      fireEvent.click(screen.getByRole("checkbox", { name: /Autumn Cup/ }))
      expect(screen.getByRole("checkbox", { name: /Winter CTF/ })).toBeChecked()
      expect(screen.getByRole("checkbox", { name: /Autumn Cup/ })).toBeChecked()
    } finally {
      vi.useRealTimers()
    }
  })
})
