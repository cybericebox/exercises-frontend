import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { DeployDeviceStatus } from "@/api/exercises/deploy"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))
vi.mock("@/api/exercises/deploy", () => ({ resetDeployDevice: vi.fn(), setDeployDeviceRescue: vi.fn() }))

import { resetDeployDevice, setDeployDeviceRescue } from "@/api/exercises/deploy"
import { DeviceLiveInfo } from "./DeviceLiveInfo"

const device = (extra: Partial<DeployDeviceStatus> = {}): DeployDeviceStatus => ({
  Name: "db", Ready: true, Reason: "", Scheduling: null,
  Snapshot: { LastSnapshotAt: new Date(Date.now() - 300_000).toISOString(), RestoredAt: null, SizeBytes: 2048, Warning: "", Rescue: false },
  ...extra,
})

beforeEach(() => vi.resetAllMocks())

describe("DeviceLiveInfo", () => {
  it("shows the failure with reason, restarts and message", () => {
    render(<DeviceLiveInfo deployId="d1" device={device({ Snapshot: null, Scheduling: { State: "Failed", QueuedAt: null, DispatchedAt: null, StartedAt: null,
      Failure: { Reason: "CrashLoop", Message: "exit 1", RestartCount: 4, At: null } } })} />)
    expect(screen.getByRole("alert").textContent).toContain("admin.exLive.failure.CrashLoop")
    expect(screen.getByText(/admin.exLive.failure.restarts 4/)).toBeTruthy()
    expect(screen.getByText(/exit 1/)).toBeTruthy()
    expect(screen.queryByText("admin.exLive.reset")).toBeNull()
  })

  it("rescue switch shows the choice before the server answers and does not block the next change", async () => {
    let finish: () => void = () => {}
    vi.mocked(setDeployDeviceRescue).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve })).mockResolvedValue(undefined)
    render(<DeviceLiveInfo deployId="d1" device={device()} />)
    const toggle = screen.getByRole("switch", { name: "admin.exLive.rescue" })
    fireEvent.click(toggle)
    expect(toggle.getAttribute("aria-checked")).toBe("true")
    expect(screen.getByText("admin.exLive.rescueBanner")).toBeTruthy()
    expect(toggle.hasAttribute("disabled")).toBe(false)
    fireEvent.click(toggle)
    expect(toggle.getAttribute("aria-checked")).toBe("false")
    await waitFor(() => expect(setDeployDeviceRescue).toHaveBeenCalledTimes(1))
    finish()
    await waitFor(() => expect(setDeployDeviceRescue).toHaveBeenCalledTimes(2))
    expect(vi.mocked(setDeployDeviceRescue).mock.calls.map((call) => call[2])).toEqual([true, false])
  })

  it("rolls the switch back when saving fails", async () => {
    vi.mocked(setDeployDeviceRescue).mockRejectedValue(new Error("boom"))
    render(<DeviceLiveInfo deployId="d1" device={device()} />)
    const toggle = screen.getByRole("switch", { name: "admin.exLive.rescue" })
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"))
  })

  it("resets only after the danger confirmation", async () => {
    vi.mocked(resetDeployDevice).mockResolvedValue(undefined)
    render(<DeviceLiveInfo deployId="d1" device={device()} />)
    fireEvent.click(screen.getByRole("button", { name: "admin.exLive.reset" }))
    expect(resetDeployDevice).not.toHaveBeenCalled()
    expect(screen.getByText("admin.exLive.resetTitle")).toBeTruthy()
    fireEvent.click(screen.getAllByRole("button", { name: "admin.exLive.reset" }).at(-1)!)
    await waitFor(() => expect(resetDeployDevice).toHaveBeenCalledWith("d1", "db"))
  })
})
