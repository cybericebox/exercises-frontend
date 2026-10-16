import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/lib/useExerciseNames", () => ({
  useExerciseNames: () => ({ ex1: "Exercise one", ex2: "Exercise two" }),
  useVariantNumbers: () => ({}),
}))
vi.mock("@/api/exercises/deploy", () => ({ destroyDeploy: vi.fn(), listDeploys: vi.fn() }))

import { testLabHref } from "@/lib/exerciseRoutes"
import { listDeploys, type DeployListItem } from "@/api/exercises/deploy"
import { RunningLabsDialog } from "./RunningLabsDialog"

function item(id: string, exerciseId: string, kind?: "lab" | "static"): DeployListItem {
  return { DeployID: id, Lab: "", Kind: kind, ExerciseID: exerciseId, VersionID: "v", VariantID: "var", CreatedAt: "2026-10-17T10:00:00Z", ExpiresAt: "2026-10-17T12:00:00Z", Tasks: [] }
}

describe("RunningLabsDialog", () => {
  beforeEach(() => { vi.mocked(listDeploys).mockResolvedValue([]) })

  it("marks only the static test and keeps open and end for both rows", () => {
    render(<RunningLabsDialog open items={[item("d1", "ex1", "lab"), item("d2", "ex2", "static")]} now={Date.parse("2026-10-17T10:30:00Z")} onClose={vi.fn()} onEnded={vi.fn()} />)
    expect(screen.getAllByText("admin.exTest.kindStatic")).toHaveLength(1)
    const rows = screen.getAllByRole("listitem")
    expect(rows[0]).not.toHaveTextContent("admin.exTest.kindStatic")
    expect(rows[1]).toHaveTextContent("admin.exTest.kindStatic")
    expect(screen.getAllByRole("button", { name: /admin\.exTest\.endLabNamed/ })).toHaveLength(2)
    fireEvent.click(screen.getAllByRole("button", { name: /admin\.exTest\.openLabNamed/ })[1])
    expect(push).toHaveBeenCalledWith(testLabHref("ex2", "d2"))
  })

  it("ends a static test with the text that has no lab wording", () => {
    render(<RunningLabsDialog open items={[item("d2", "ex2", "static")]} now={0} onClose={vi.fn()} onEnded={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: /admin\.exTest\.endLabNamed/ }))
    expect(screen.getByText("admin.exTest.endDescriptionStatic")).toBeInTheDocument()
  })

  it("promises the VPN stops when the only other running test is a static one", async () => {
    const items = [item("d1", "ex1", "lab"), item("d2", "ex2", "static")]
    vi.mocked(listDeploys).mockResolvedValue(items)
    render(<RunningLabsDialog open items={items} now={0} onClose={vi.fn()} onEnded={vi.fn()} />)
    fireEvent.click(screen.getAllByRole("button", { name: /admin\.exTest\.endLabNamed/ })[0])
    expect(await screen.findByText("admin.exTest.endDescription")).toBeInTheDocument()
    expect(screen.queryByText("admin.exTest.endDescriptionOthers")).not.toBeInTheDocument()
  })

  it("says the VPN stays when another lab still runs", async () => {
    const items = [item("d1", "ex1", "lab"), item("d3", "ex2", "lab")]
    vi.mocked(listDeploys).mockResolvedValue(items)
    render(<RunningLabsDialog open items={items} now={0} onClose={vi.fn()} onEnded={vi.fn()} />)
    fireEvent.click(screen.getAllByRole("button", { name: /admin\.exTest\.endLabNamed/ })[0])
    expect(await screen.findByText("admin.exTest.endDescriptionOthers")).toBeInTheDocument()
  })
})
