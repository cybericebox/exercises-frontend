import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))
vi.mock("@/lib/useExerciseNames", () => ({ useExerciseNames: () => ({ ex1: "Exercise one" }), useVariantNumbers: () => ({}) }))
vi.mock("@/api/exercises/deploy", () => ({ destroyDeploy: vi.fn(), listDeploys: vi.fn().mockResolvedValue([]) }))

import { RunningLabsDialog } from "./RunningLabsDialog"

const START = Date.parse("2026-10-19T10:00:00Z")
const lab = (secondsLeft: number) => ({ DeployID: "d1", Lab: "", ExerciseID: "ex1", VersionID: "v", VariantID: "var", CreatedAt: "", ExpiresAt: new Date(START + secondsLeft * 1000).toISOString(), Tasks: [] })
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(START) })
afterEach(() => { vi.useRealTimers() })

describe("RunningLabsDialog live countdown", () => {
  it("counts down without any refetch, h:mm over 10 minutes and m:ss under", () => {
    const onExpired = vi.fn()
    render(<RunningLabsDialog open items={[lab(10 * 60 + 90)]} onClose={vi.fn()} onEnded={vi.fn()} onExpired={onExpired} />)
    expect(screen.getByText("admin.exTest.left 0:12")).toBeInTheDocument()
    tick(31000)
    expect(screen.getByText("admin.exTest.left 0:11")).toBeInTheDocument()
    tick(60000)
    expect(screen.getByText(/admin\.exTest\.left 9:\d\d/)).toBeInTheDocument()
    tick(1000)
    expect(screen.getByText(/admin\.exTest\.left 9:\d\d/)).toBeInTheDocument()
    const before = screen.getByText(/admin\.exTest\.left/).textContent
    tick(1000)
    expect(screen.getByText(/admin\.exTest\.left/).textContent).not.toBe(before)
    expect(onExpired).not.toHaveBeenCalled()
  })

  it("shows the ending text and asks for one refetch at zero", () => {
    const onExpired = vi.fn()
    render(<RunningLabsDialog open items={[lab(3)]} onClose={vi.fn()} onEnded={vi.fn()} onExpired={onExpired} />)
    expect(screen.getByText("admin.exTest.left 0:03")).toBeInTheDocument()
    tick(3000)
    expect(screen.getByText("admin.exTest.expiredMark")).toBeInTheDocument()
    expect(onExpired).toHaveBeenCalledTimes(1)
    tick(60000)
    expect(onExpired).toHaveBeenCalledTimes(1)
  })
})
