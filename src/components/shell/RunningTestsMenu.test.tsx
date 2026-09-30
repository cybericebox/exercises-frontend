import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { DeployListItem } from "@/api/exercises/deploy"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))
const h = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: h.push }) }))
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))
vi.mock("@/api/exercises/deploy", () => ({ listDeploys: vi.fn(), destroyDeploy: vi.fn() }))
vi.mock("@/api/exercises/versions", () => ({ getVersion: vi.fn() }))
vi.mock("@/api/exercises/catalog", () => ({ getExercise: vi.fn() }))

import { getExercise } from "@/api/exercises/catalog"
import { destroyDeploy, listDeploys } from "@/api/exercises/deploy"
import { getVersion } from "@/api/exercises/versions"
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

  it("opens a modal listing each running lab with its exercise, variant and time left, and opens a lab's page", async () => {
    vi.mocked(listDeploys).mockResolvedValue([lab("run-1", "ex-1", 102), lab("run-2", "ex-2", 30)])
    vi.mocked(getVersion).mockResolvedValue({ Variants: [{ ID: "x" }, { ID: "y" }] } as never)
    render(<RunningTestsMenu />)
    fireEvent.click(await screen.findByRole("button", { name: /admin\.exTest\.running 2/ }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(2)
    expect(await within(dialog).findByText("Exercise ex-1")).toBeInTheDocument()
    expect(within(dialog).getAllByText(/admin\.exTest\.left/)[0]).toHaveTextContent("admin.exTest.left 1:42")
    await waitFor(() => expect(within(dialog).getAllByText(/admin\.exDraft\.variant 1/).length).toBe(2))
    fireEvent.click(within(dialog).getByRole("button", { name: "admin.exTest.openLabNamed Exercise ex-2" }))
    expect(h.push).toHaveBeenCalledWith("/test?exercise=ex-2&deploy=run-2")
  })

  it("ends a lab from the modal only after a danger confirmation and then drops it from the list", async () => {
    vi.mocked(listDeploys).mockResolvedValue([lab("run-1", "ex-1", 60), lab("run-2", "ex-2", 60)])
    vi.mocked(destroyDeploy).mockResolvedValue(undefined)
    render(<RunningTestsMenu />)
    fireEvent.click(await screen.findByRole("button", { name: /admin\.exTest\.running 2/ }))
    const dialog = await screen.findByRole("dialog")
    await within(dialog).findByText("Exercise ex-1")
    fireEvent.click(within(dialog).getByRole("button", { name: "admin.exTest.endLabNamed Exercise ex-1" }))
    expect(destroyDeploy).not.toHaveBeenCalled()
    const confirm = (await screen.findAllByRole("dialog")).find((d) => within(d).queryByText("admin.exTest.endTitle"))!
    fireEvent.click(within(confirm).getByRole("button", { name: "admin.exTest.endConfirm" }))
    await waitFor(() => expect(destroyDeploy).toHaveBeenCalledWith("run-1"))
    await waitFor(() => expect(within(dialog).getAllByRole("listitem")).toHaveLength(1))
    expect(within(dialog).queryByText("Exercise ex-1")).not.toBeInTheDocument()
  })

  it("tells whether the end of a lab also ends the VPN: only for the author's last lab", async () => {
    vi.mocked(listDeploys).mockResolvedValue([lab("run-1", "ex-1", 60), lab("run-2", "ex-2", 60)])
    const { unmount } = render(<RunningTestsMenu />)
    fireEvent.click(await screen.findByRole("button", { name: /admin\.exTest\.running 2/ }))
    const dialog = await screen.findByRole("dialog")
    await within(dialog).findByText("Exercise ex-1")
    fireEvent.click(within(dialog).getByRole("button", { name: "admin.exTest.endLabNamed Exercise ex-1" }))
    expect(await screen.findByText("admin.exTest.endDescriptionOthers")).toBeInTheDocument()
    unmount()

    vi.mocked(listDeploys).mockResolvedValue([lab("run-1", "ex-1", 60)])
    render(<RunningTestsMenu />)
    fireEvent.click(await screen.findByRole("button", { name: /admin\.exTest\.running 1/ }))
    const single = await screen.findByRole("dialog")
    await within(single).findByText("Exercise ex-1")
    fireEvent.click(within(single).getByRole("button", { name: "admin.exTest.endLabNamed Exercise ex-1" }))
    expect(await screen.findByText("admin.exTest.endDescription")).toBeInTheDocument()
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
