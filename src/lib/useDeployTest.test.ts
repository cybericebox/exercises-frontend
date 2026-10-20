import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"

import { PopupBlockedError, useDeployTest } from "./useDeployTest"
import * as deployApi from "@/api/exercises/deploy"
import { ApiError } from "@/api/client"

vi.mock("@/api/exercises/deploy")

const mocked = vi.mocked(deployApi)

describe("useDeployTest", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.destroyDeploy.mockResolvedValue(undefined)
  })

  it("starts a deploy and reflects a Ready status", async () => {
    mocked.deployVariant.mockResolvedValue({ DeployID: "g1", Lab: "lab" })
    mocked.deployStatus.mockResolvedValue({ Phase: "Ready", Ready: true, VPNCIDR: "10.128.1.0/24" })

    const { result } = renderHook(() => useDeployTest())
    await act(async () => {
      await result.current.start("ex", "ver", "var")
    })

    await waitFor(() => expect(result.current.status?.Ready).toBe(true))
    expect(result.current.deployId).toBe("g1")
    expect(result.current.busy).toBe(false)
    expect(mocked.deployVariant).toHaveBeenCalledWith("ex", "ver", "var")
  })

  it("attaches to a running deploy without creating another", async () => {
    mocked.deployStatus.mockResolvedValue({ Phase: "Ready", Ready: true })
    const { result } = renderHook(() => useDeployTest())
    act(() => result.current.attach("g9", [{ TaskID: "t", Name: "Login" }]))

    await waitFor(() => expect(result.current.status?.Ready).toBe(true))
    expect(mocked.deployVariant).not.toHaveBeenCalled()
    expect(mocked.deployStatus).toHaveBeenCalledWith("g9")
    expect(result.current.deployId).toBe("g9")
    expect(result.current.tasks).toEqual([{ TaskID: "t", Name: "Login" }])
  })

  it("surfaces a deploy error without a deploy id", async () => {
    mocked.deployVariant.mockRejectedValue(new Error("no infra"))

    const { result } = renderHook(() => useDeployTest())
    await act(async () => {
      await result.current.start("ex", "ver", "var")
    })

    await waitFor(() => expect(result.current.error).toBe("no infra"))
    expect(result.current.deployId).toBeNull()
    expect(result.current.busy).toBe(false)
  })

  it("tears the deploy down on close", async () => {
    mocked.deployVariant.mockResolvedValue({ DeployID: "g1", Lab: "lab" })
    mocked.deployStatus.mockResolvedValue({ Phase: "Ready", Ready: true })
    mocked.destroyDeploy.mockResolvedValue(undefined)

    const { result } = renderHook(() => useDeployTest())
    await act(async () => {
      await result.current.start("ex", "ver", "var")
    })
    await waitFor(() => expect(result.current.deployId).toBe("g1"))

    act(() => {
      result.current.close()
    })
    expect(mocked.destroyDeploy).toHaveBeenCalledWith("g1")
    expect(result.current.deployId).toBeNull()
  })

  it("tears down a deploy whose start request finishes after close", async () => {
    let finishStart!: (value: deployApi.DeployResponse) => void
    mocked.deployVariant.mockReturnValue(new Promise((resolve) => { finishStart = resolve }))

    const { result } = renderHook(() => useDeployTest())
    let start!: Promise<void>
    act(() => { start = result.current.start("ex", "ver", "var") })
    act(() => { result.current.close() })
    await act(async () => { finishStart({ DeployID: "late-deploy", Lab: "lab" }); await start })

    expect(mocked.destroyDeploy).toHaveBeenCalledOnce()
    expect(mocked.destroyDeploy).toHaveBeenCalledWith("late-deploy")
    expect(mocked.deployStatus).not.toHaveBeenCalled()
    expect(result.current.deployId).toBeNull()
  })

  it("tears down a deploy whose start request finishes after unmount", async () => {
    let finishStart!: (value: deployApi.DeployResponse) => void
    mocked.deployVariant.mockReturnValue(new Promise((resolve) => { finishStart = resolve }))

    const { result, unmount } = renderHook(() => useDeployTest())
    let start!: Promise<void>
    act(() => { start = result.current.start("ex", "ver", "var") })
    unmount()
    await act(async () => { finishStart({ DeployID: "unmounted-deploy", Lab: "lab" }); await start })

    expect(mocked.destroyDeploy).toHaveBeenCalledOnce()
    expect(mocked.destroyDeploy).toHaveBeenCalledWith("unmounted-deploy")
    expect(mocked.deployStatus).not.toHaveBeenCalled()
  })

  it("keeps a known deploy running when the screen is left, so the author can come back", async () => {
    mocked.deployVariant.mockResolvedValue({ DeployID: "kept", Lab: "lab" })
    mocked.deployStatus.mockResolvedValue({ Phase: "Ready", Ready: true })
    const { result, unmount } = renderHook(() => useDeployTest())
    await act(async () => { await result.current.start("ex", "ver", "var") })
    await waitFor(() => expect(result.current.status?.Ready).toBe(true))

    unmount()
    expect(mocked.destroyDeploy).not.toHaveBeenCalled()
  })

  it("stops polling on a terminal Error phase like on Failed", async () => {
    mocked.deployStatus.mockResolvedValue({ Phase: "Error", Ready: false })
    const { result } = renderHook(() => useDeployTest())
    act(() => result.current.attach("g5", []))
    await waitFor(() => expect(result.current.status?.Phase).toBe("Error"))
    expect(result.current.busy).toBe(false)
  })

  it("tears down the previous deploy when testing another variant", async () => {
    mocked.deployVariant
      .mockResolvedValueOnce({ DeployID: "first-deploy", Lab: "lab" })
      .mockResolvedValueOnce({ DeployID: "second-deploy", Lab: "lab" })
    mocked.deployStatus.mockResolvedValue({ Phase: "Ready", Ready: true })

    const { result } = renderHook(() => useDeployTest())
    await act(async () => { await result.current.start("ex", "ver", "first") })
    await act(async () => { await result.current.start("ex", "ver", "second") })

    expect(mocked.destroyDeploy).toHaveBeenCalledWith("first-deploy")
    expect(result.current.deployId).toBe("second-deploy")
  })

  describe("web links", () => {
    const web = { Phase: "Ready", Ready: true, Access: [{ Device: "web", Port: 443, Protocol: "https", URL: "https://web-1x.example.com" }] }
    let tab: { location: { href: string }; close: ReturnType<typeof vi.fn>; opener: unknown }
    let windowOpen: ReturnType<typeof vi.fn>

    async function readyDeploy() {
      mocked.deployVariant.mockResolvedValue({ DeployID: "g1", Lab: "lab" })
      mocked.deployStatus.mockResolvedValue(web)
      const hook = renderHook(() => useDeployTest())
      await act(async () => {
        await hook.result.current.start("ex", "ver", "var")
      })
      await waitFor(() => expect(hook.result.current.status?.Ready).toBe(true))
      return hook
    }

    beforeEach(() => {
      tab = { location: { href: "about:blank" }, close: vi.fn(), opener: "self" }
      windowOpen = vi.fn(() => tab)
      vi.stubGlobal("open", windowOpen)
    })
    afterEach(() => vi.unstubAllGlobals())

    it("asks for nothing when the lab becomes ready: links are fetched on click", async () => {
      await readyDeploy()
      expect(mocked.openDeployLink).not.toHaveBeenCalled()
    })

    it("opens the tab in the click, then points it at the fresh link", async () => {
      let resolveLink!: (v: deployApi.DeployLink) => void
      mocked.openDeployLink.mockReturnValue(new Promise((r) => { resolveLink = r }))
      const { result } = await readyDeploy()

      act(() => result.current.openLink("web", 443))
      expect(windowOpen).toHaveBeenCalledWith("about:blank", "_blank")
      expect(tab.opener).toBeNull()
      expect(result.current.link).toBe("opening")
      expect(result.current.linkKey).toBe("web:443")
      expect(mocked.openDeployLink).toHaveBeenCalledWith("g1", "web", 443)

      await act(async () => resolveLink({ URL: "https://web-1x.example.com/_auth?t=x", ExpiresAt: "2026-10-01T00:00:00Z" }))
      expect(tab.location.href).toBe("https://web-1x.example.com/_auth?t=x")
      expect(result.current.link).toBe("idle")
    })

    it("navigates to a fresh auth URL carrying the composed destination and retains it on retry", async () => {
      mocked.openDeployLink.mockRejectedValueOnce(new Error("retry"))
        .mockResolvedValueOnce({ URL: "https://fresh-web.lab.test/_auth?t=fresh", ExpiresAt: "x" })
      const { result } = await readyDeploy()
      act(() => result.current.openLink("web", 443, "/panel?x=1#details"))
      await waitFor(() => expect(result.current.link).toBe("error"))
      act(() => result.current.retryLink())
      await waitFor(() => expect(result.current.link).toBe("idle"))
      const actual = new URL(tab.location.href)
      expect(actual.origin).toBe("https://fresh-web.lab.test")
      expect(actual.pathname).toBe("/_auth")
      expect(actual.searchParams.get("t")).toBe("fresh")
      expect(actual.searchParams.get("next")).toBe("/panel?x=1#details")
      // This is the destination the proxy's same-origin redirect must navigate to after authentication.
      expect(new URL(actual.searchParams.get("next")!, actual.origin).href).toBe("https://fresh-web.lab.test/panel?x=1#details")
    })

    it("closes the blank tab, keeps the error and retries on demand", async () => {
      mocked.openDeployLink.mockRejectedValueOnce(new Error("409")).mockResolvedValueOnce({ URL: "https://web-1x.example.com/_auth?t=y", ExpiresAt: "x" })
      const { result } = await readyDeploy()

      act(() => result.current.openLink("web", 443))
      await waitFor(() => expect(result.current.link).toBe("error"))
      expect(tab.close).toHaveBeenCalled()
      expect(result.current.linkError).toBeInstanceOf(Error)

      act(() => result.current.retryLink())
      await waitFor(() => expect(result.current.link).toBe("idle"))
      expect(mocked.openDeployLink).toHaveBeenCalledTimes(2)
      expect(tab.location.href).toBe("https://web-1x.example.com/_auth?t=y")
    })

    it("reports a blocked pop-up without asking the server", async () => {
      windowOpen.mockReturnValue(null)
      const { result } = await readyDeploy()
      act(() => result.current.openLink("web", 443))
      expect(result.current.link).toBe("error")
      expect(result.current.linkError).toBeInstanceOf(PopupBlockedError)
      expect(mocked.openDeployLink).not.toHaveBeenCalled()
    })
  })
  describe("polling", () => {
    const setHidden = (hidden: boolean) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden })
      document.dispatchEvent(new Event("visibilitychange"))
    }

    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => {
      setHidden(false)
      vi.useRealTimers()
    })

    it("stops polling and reports gone on a 404", async () => {
      mocked.deployStatus.mockResolvedValueOnce({ Phase: "Ready", Ready: true }).mockRejectedValue(new ApiError(404, "Test deployment not found"))
      const { result } = renderHook(() => useDeployTest())
      act(() => result.current.attach("g1", []))
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(result.current.gone).toBe(true)
      const calls = mocked.deployStatus.mock.calls.length
      await act(async () => { await vi.advanceTimersByTimeAsync(120000) })
      expect(mocked.deployStatus).toHaveBeenCalledTimes(calls)
    })

    it("backs off while a ready lab keeps failing", async () => {
      mocked.deployStatus.mockResolvedValueOnce({ Phase: "Ready", Ready: true }).mockRejectedValue(new Error("boom"))
      const { result } = renderHook(() => useDeployTest())
      act(() => result.current.attach("g1", []))
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
      // Fixed 3s pace would be 20 polls; backoff keeps it well below that.
      expect(mocked.deployStatus.mock.calls.length).toBeLessThan(8)
      expect(result.current.gone).toBe(false)
    })

    it("pauses while the tab is hidden and resumes when it is shown", async () => {
      mocked.deployStatus.mockResolvedValue({ Phase: "Ready", Ready: true })
      const { result } = renderHook(() => useDeployTest())
      act(() => result.current.attach("g1", []))
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(mocked.deployStatus).toHaveBeenCalledTimes(1)

      act(() => setHidden(true))
      await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
      expect(mocked.deployStatus).toHaveBeenCalledTimes(1)

      await act(async () => { setHidden(false) })
      expect(mocked.deployStatus).toHaveBeenCalledTimes(2)
    })

    it("static attach polls slowly and merges Expired", async () => {
      mocked.deployStatus
        .mockResolvedValueOnce({ Phase: "", Ready: true })
        .mockResolvedValue({ Phase: "", Ready: true, Expired: true, SolvedTaskIDs: ["t1"] })
      const { result } = renderHook(() => useDeployTest())
      act(() => result.current.attach("s1", [{ TaskID: "t1", Name: "A" }], "static"))
      expect(result.current.status?.Ready).toBe(true)
      expect(result.current.busy).toBe(false)
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(mocked.deployStatus).toHaveBeenCalledTimes(1)
      await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
      expect(mocked.deployStatus).toHaveBeenCalledTimes(1)
      await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
      expect(mocked.deployStatus).toHaveBeenCalledTimes(2)
      expect(result.current.status?.Expired).toBe(true)
      expect(result.current.status?.SolvedTaskIDs).toEqual(["t1"])
      expect(result.current.kind).toBe("static")
    })

    it("static keeps the last status when a poll fails", async () => {
      mocked.deployStatus.mockRejectedValue(new Error("boom"))
      const { result } = renderHook(() => useDeployTest())
      act(() => result.current.attach("s1", [], "static"))
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(result.current.status?.Ready).toBe(true)
      expect(result.current.error).toBeNull()
    })
  })

  it("static start is ready before any status answer", async () => {
    mocked.deployVariant.mockResolvedValue({ DeployID: "d1", Lab: "", Kind: "static", Tasks: [{ TaskID: "t1", Name: "A" }] })
    mocked.deployStatus.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useDeployTest())
    await act(async () => {
      await result.current.start("ex", "ver", "var")
    })
    expect(result.current.status?.Ready).toBe(true)
    expect(result.current.kind).toBe("static")
    expect(result.current.busy).toBe(false)
  })

  it("lab start unchanged", async () => {
    mocked.deployVariant.mockResolvedValue({ DeployID: "d1", Lab: "lab" })
    mocked.deployStatus.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useDeployTest())
    await act(async () => {
      await result.current.start("ex", "ver", "var")
    })
    expect(result.current.status).toBeNull()
    expect(result.current.kind).toBe("lab")
    expect(result.current.busy).toBe(true)
  })
})
