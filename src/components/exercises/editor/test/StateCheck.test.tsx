import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/api/exercises/deploy", () => ({ runDeployChecks: vi.fn() }))

import { ApiError } from "@/api/client"
import { runDeployChecks } from "@/api/exercises/deploy"
import type { NormalizedTask } from "@/api/exercises/versions"
import { t } from "@/i18n/t"
import type { StateTaskView } from "@/lib/testLab"
import { intervalText, StateCheck } from "./StateCheck"

const task = { ID: "t2", Key: "ospf", Check: { State: { Mode: "once", Interval: "30s", Manual: true, Conditions: [] } } } as unknown as NormalizedTask
const view = (extra: Partial<StateTaskView> = {}): StateTaskView => ({ status: "unknown", checks: [], blockedBy: [], solvedAt: null, firstSolvedAt: null, ...extra })

describe("StateCheck", () => {
  beforeEach(() => { vi.mocked(runDeployChecks).mockReset() })

  it("shows only the verdict to the participant: no conditions, no raw output", () => {
    render(<StateCheck deployId="d1" task={task} view={view({ status: "notSolved", checks: [{ id: "ospf:1", device: "r1", conditions: [{ kind: "process", subject: "ospfd" }], known: true, passed: false, changedAt: null, detail: "raw output" }] })} />)
    expect(screen.getByText(t("ed.d.state.notSolved"))).toBeTruthy()
    expect(screen.queryByText("ospfd")).toBeNull()
    expect(screen.queryByText("raw output")).toBeNull()
    expect(screen.getByText(t("ed.d.state.autoLine", { time: "30 с" }))).toBeTruthy()
  })

  it("«Перевірити зараз» asks the lab, names the operation while it runs and confirms the request", async () => {
    let finish: (value: { Asked: boolean }) => void = () => {}
    vi.mocked(runDeployChecks).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    render(<StateCheck deployId="d1" task={task} view={view()} />)
    fireEvent.click(screen.getByRole("button", { name: t("ed.d.state.now") }))
    expect(screen.getAllByText(t("ed.d.state.asking")).length).toBeGreaterThan(0)
    expect(runDeployChecks).toHaveBeenCalledWith("d1", "t2")
    await act(async () => { finish({ Asked: true }) })
    expect(await screen.findByText(t("ed.d.state.asked"))).toBeTruthy()
  })

  it("429 disables the button with a countdown that honours Retry-After", async () => {
    vi.mocked(runDeployChecks).mockRejectedValue(new ApiError(429, null, "too often", undefined, 73516, 20))
    render(<StateCheck deployId="d1" task={task} view={view()} />)
    fireEvent.click(screen.getByRole("button", { name: t("ed.d.state.now") }))
    expect(await screen.findByText(t("ed.d.state.waitSeconds", { n: 20 }))).toBeTruthy()
    expect(screen.getByRole("button", { name: t("ed.d.state.now") })).toBeDisabled()
  })

  it("another failure is shown beside the button and the button stays usable", async () => {
    vi.mocked(runDeployChecks).mockRejectedValue(new ApiError(500, null, "boom"))
    render(<StateCheck deployId="d1" task={task} view={view()} />)
    fireEvent.click(screen.getByRole("button", { name: t("ed.d.state.now") }))
    await waitFor(() => expect(screen.getAllByRole("alert").some((node) => node.textContent !== "")).toBe(true))
    expect(screen.getByRole("button", { name: t("ed.d.state.now") })).not.toBeDisabled()
  })

  it("solved: the time, and no manual button for a task that stays solved", () => {
    render(<StateCheck deployId="d1" task={task} view={view({ status: "solved", solvedAt: "2026-11-12T10:05:07Z" })} />)
    expect(screen.getByText(t("ed.d.state.solved"))).toBeTruthy()
    expect(screen.getByText(/^Виконано о /)).toBeTruthy()
    expect(screen.queryByRole("button", { name: t("ed.d.state.now") })).toBeNull()
  })

  it("a device that is not ready explains why the check cannot run", () => {
    render(<StateCheck deployId="d1" task={task} view={view({ blockedBy: ["r2"] })} />)
    expect(screen.getByText(t("ed.d.state.deviceNotReady", { device: "r2" }))).toBeTruthy()
  })

  it("words the interval", () => {
    expect(intervalText(30)).toBe("30 с")
    expect(intervalText(300)).toBe("5 хв")
    expect(intervalText(7200)).toBe("2 год")
  })
})
