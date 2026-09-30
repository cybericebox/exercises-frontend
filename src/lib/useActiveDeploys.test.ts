import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

import { ACTIVE_DEPLOYS_POLL_MS, useActiveDeploys } from "./useActiveDeploys"
import * as deployApi from "@/api/exercises/deploy"

vi.mock("@/api/exercises/deploy")

const mocked = vi.mocked(deployApi)
const item = (id: string): deployApi.DeployListItem => ({ DeployID: id, Lab: "lab", VersionID: "v", VariantID: "var", CreatedAt: "2026-09-30T10:00:00Z", ExpiresAt: "2026-09-30T12:00:00Z", Flags: [] })

describe("useActiveDeploys", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })
  afterEach(() => vi.useRealTimers())

  it("loads on mount, polls while a deploy exists and refetches on focus", async () => {
    mocked.listDeploys.mockResolvedValue([item("d1")])
    const { result } = renderHook(() => useActiveDeploys("ex"))
    await act(async () => {})
    expect(result.current.items.map((i) => i.DeployID)).toEqual(["d1"])
    expect(mocked.listDeploys).toHaveBeenCalledWith("ex")

    mocked.listDeploys.mockClear()
    await act(async () => { await vi.advanceTimersByTimeAsync(ACTIVE_DEPLOYS_POLL_MS) })
    expect(mocked.listDeploys).toHaveBeenCalledTimes(1)

    await act(async () => { window.dispatchEvent(new Event("focus")) })
    expect(mocked.listDeploys).toHaveBeenCalledTimes(2)
  })

  it("does not poll while nothing is running", async () => {
    mocked.listDeploys.mockResolvedValue([])
    renderHook(() => useActiveDeploys("ex"))
    await act(async () => {})
    mocked.listDeploys.mockClear()
    await act(async () => { await vi.advanceTimersByTimeAsync(ACTIVE_DEPLOYS_POLL_MS * 3) })
    expect(mocked.listDeploys).not.toHaveBeenCalled()
  })

  it("keeps the previous items while refetching and when a refetch fails", async () => {
    mocked.listDeploys.mockResolvedValueOnce([item("d1")])
    const { result } = renderHook(() => useActiveDeploys("ex"))
    await act(async () => {})

    let resolve: (v: deployApi.DeployListItem[]) => void = () => {}
    mocked.listDeploys.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    await act(async () => { void result.current.refresh() })
    expect(result.current.items).toHaveLength(1)
    await act(async () => { resolve([item("d1"), item("d2")]) })
    expect(result.current.items).toHaveLength(2)

    mocked.listDeploys.mockRejectedValueOnce(new Error("offline"))
    await act(async () => { await result.current.refresh() })
    expect(result.current.items).toHaveLength(2)
  })

  it("hides a deploy being torn down until the server stops listing it", async () => {
    mocked.listDeploys.mockResolvedValue([item("d1")])
    const { result } = renderHook(() => useActiveDeploys("ex"))
    await act(async () => {})
    act(() => result.current.forget("d1"))
    expect(result.current.items).toHaveLength(0)
    await act(async () => { await result.current.refresh() })
    expect(result.current.items).toHaveLength(0)
  })
})
