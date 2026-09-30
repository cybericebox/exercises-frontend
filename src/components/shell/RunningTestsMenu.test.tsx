import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { DeployListItem } from "@/api/exercises/deploy"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))
vi.mock("next/navigation", () => ({ usePathname: () => "/" }))
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))
vi.mock("@/api/exercises/deploy", () => ({ listDeploys: vi.fn() }))
vi.mock("@/api/exercises/catalog", () => ({ getExercise: vi.fn() }))

import { getExercise } from "@/api/exercises/catalog"
import { listDeploys } from "@/api/exercises/deploy"
import { RunningTestsMenu, timeLeft } from "./RunningTestsMenu"

const lab = (id: string, exercise: string, minutes: number): DeployListItem => ({
  DeployID: id, Lab: "lab", ExerciseID: exercise, VersionID: "v", VariantID: "x", CreatedAt: "", ExpiresAt: new Date(Date.now() + minutes * 60000 - 5000).toISOString(), Tasks: [],
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getExercise).mockImplementation(async (id: string) => ({ ID: id, Name: `Exercise ${id}` }) as never)
})

describe("timeLeft", () => {
  it("writes hours:minutes rounded up and stops at zero", () => {
    const now = Date.now()
    expect(timeLeft(new Date(now + 102 * 60000 - 1000).toISOString(), now)).toBe("1:42")
    expect(timeLeft(new Date(now - 1000).toISOString(), now)).toBe("0:00")
  })
})

describe("RunningTestsMenu", () => {
  it("shows nothing while no lab runs", async () => {
    vi.mocked(listDeploys).mockResolvedValue([])
    const { container } = render(<RunningTestsMenu />)
    await waitFor(() => expect(listDeploys).toHaveBeenCalledWith(undefined))
    expect(container).toBeEmptyDOMElement()
  })

  it("shows the count of running labs and lists each with its exercise, time left and a link to its test page", async () => {
    vi.mocked(listDeploys).mockResolvedValue([lab("run-1", "ex-1", 102), lab("run-2", "ex-2", 30)])
    render(<RunningTestsMenu />)
    const button = await screen.findByRole("button", { name: /admin\.exTest\.running 2/ })
    fireEvent.pointerDown(button, { button: 0, ctrlKey: false })
    const first = await screen.findByRole("menuitem", { name: /Exercise ex-1/ })
    expect(first).toHaveAttribute("href", "/test?exercise=ex-1&deploy=run-1")
    expect(first).toHaveTextContent("admin.exTest.left 1:42")
    expect(screen.getByRole("menuitem", { name: /Exercise ex-2/ })).toHaveAttribute("href", "/test?exercise=ex-2&deploy=run-2")
  })

  it("keeps the previous list while a refresh fails, so the indicator does not flicker", async () => {
    vi.mocked(listDeploys).mockResolvedValue([lab("run-1", "ex-1", 60)])
    render(<RunningTestsMenu />)
    await screen.findByRole("button", { name: /admin\.exTest\.running 1/ })
    const before = vi.mocked(listDeploys).mock.calls.length
    vi.mocked(listDeploys).mockRejectedValue(new Error("offline"))
    window.dispatchEvent(new Event("focus"))
    await waitFor(() => expect(vi.mocked(listDeploys).mock.calls.length).toBeGreaterThan(before))
    expect(screen.getByRole("button", { name: /admin\.exTest\.running 1/ })).toBeInTheDocument()
  })
})
