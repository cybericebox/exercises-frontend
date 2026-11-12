import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key}${JSON.stringify(vars)}` : key }))

import type { ImportReport } from "@/api/exercises/archiveImport"
import { ImportReportView, ReportVerdict, warningText } from "./ImportReportView"

const report = (over: Partial<ImportReport> = {}): ImportReport => ({
  Diff: { Variants: [] }, Issues: [], Publishable: true, Warnings: [], ...over,
})

describe("ImportReportView", () => {
  it("renders the diff per variant: status, how it was matched, added / removed / kept tasks and devices", () => {
    render(<ImportReportView report={report({ Diff: { Variants: [
      { Status: "kept", Position: 1, StoredPosition: 1, MatchedBy: "id",
        Tasks: { Kept: [{ Name: "Web", PreviousName: "Web task", Key: "web", KeyChanged: true }], Added: [{ Name: "New task", Key: "fresh" }], Removed: [{ Name: "Old task", Key: "old" }] },
        Devices: { Kept: [{ Name: "srv" }], Added: [{ Name: "database" }], Removed: [{ Name: "db" }] } },
      { Status: "removed", Position: 0, StoredPosition: 2, Tasks: { Kept: [], Added: [], Removed: [{ Name: "Gone", Key: "g" }] }, Devices: { Kept: [], Added: [], Removed: [] } },
    ] } })} />)
    const kept = screen.getByRole("region", { name: 'ed.a.import.variantN{"n":1}' })
    expect(within(kept).getByText("ed.a.import.status.kept")).toBeInTheDocument()
    expect(within(kept).getByText('ed.a.import.matched.id{"n":1}')).toBeInTheDocument()
    expect(within(kept).getByText("New task")).toBeInTheDocument()
    expect(within(kept).getByText("Old task")).toBeInTheDocument()
    expect(kept).toHaveTextContent('ed.a.import.renamed{"name":"Web task"}')
    expect(kept).toHaveTextContent("ed.a.import.keyChanged")
    expect(within(kept).getByText("database")).toBeInTheDocument()
    expect(within(kept).getByText("db")).toBeInTheDocument()
    const removed = screen.getByRole("region", { name: 'ed.a.import.variantStored{"n":2}' })
    expect(removed).toHaveAttribute("data-diff-variant", "removed")
    expect(within(removed).getByText("Gone")).toBeInTheDocument()
  })

  it("says it can be published, or lists what blocks publishing", () => {
    const { rerender } = render(<ReportVerdict report={report()} />)
    expect(screen.getByText("ed.a.import.publishable")).toBeInTheDocument()
    rerender(<ReportVerdict report={report({ Publishable: false, Issues: [{ Code: 23504, Message: "x", Path: "p" }, { Code: 23505, Message: "y", Path: "" }] })} />)
    expect(screen.getByText('ed.a.import.issuesCount.few{"count":2}')).toBeInTheDocument()
  })

  it("lists the issues with their document path and the warnings in words", () => {
    render(<ImportReportView report={report({ Publishable: false,
      Issues: [{ Code: 23504, Message: "The port is not valid", Path: "variants[2].topology.devices[1]" }],
      Warnings: [{ Code: "no_exercise_id" }, { Code: "task_key_conflict", Context: { task: "Web", key: "web" } }, { Code: "something_new" }] })} />)
    expect(screen.getByText("ed.a.import.blocks")).toBeInTheDocument()
    expect(screen.getByText("The port is not valid")).toBeInTheDocument()
    expect(screen.getByText("variants[2].topology.devices[1]")).toBeInTheDocument()
    expect(screen.getByText("ed.a.import.warn.noExerciseId")).toBeInTheDocument()
    expect(screen.getByText('ed.a.import.warn.keyConflict{"task":"Web","key":"web"}')).toBeInTheDocument()
    expect(screen.getByText('ed.a.import.warn.other{"code":"something_new"}')).toBeInTheDocument()
  })

  it("shows what the events that use the exercise lose", () => {
    render(<ImportReportView report={report({ Usage: { TestDeploys: 2, Events: [
      { EventID: "e1", Name: "Spring CTF", Archived: true, VersionPublished: false, RunningLabs: 3, Removed: [{ Name: "Old task", Attempts: 12, Solves: 4 }], Added: [{ Name: "New task" }], VariantMissing: false, Blocked: true },
      { EventID: "e2", Name: "Autumn", Archived: false, VersionPublished: true, RunningLabs: 0, Removed: [], Added: [], VariantMissing: true, Blocked: true },
    ] } })} />)
    const events = screen.getAllByText(/Spring CTF|Autumn/).map((node) => node.closest("[data-usage-event]") as HTMLElement)
    expect(within(events[0]).getByText("ed.a.import.eventArchived")).toBeInTheDocument()
    expect(within(events[0]).getByText("ed.a.import.blocked")).toBeInTheDocument()
    expect(within(events[0]).getByText(/Old task/)).toHaveTextContent('ed.a.import.attempts{"attempts":12,"solves":4}')
    expect(within(events[0]).getByText("New task")).toBeInTheDocument()
    expect(within(events[0]).getByText("ed.a.import.eventOldVersion")).toBeInTheDocument()
    expect(within(events[1]).getByText("ed.a.import.blockedVariant")).toBeInTheDocument()
    expect(screen.getByText('ed.a.import.testDeploys.few{"count":2}')).toBeInTheDocument()
  })

  it("words every warning code", () => {
    expect(warningText({ Code: "used_by_events", Context: { events: 2 } })).toBe('ed.a.import.warn.usedByEvents.few{"count":2}')
    expect(warningText({ Code: "running_labs", Context: { labs: 1 } })).toBe('ed.a.import.warn.runningLabs.one{"count":1}')
    expect(warningText({ Code: "removed_task_has_attempts", Context: { event: "E", task: "T", attempts: 5, solves: 1 } })).toBe('ed.a.import.warn.removedHasAttempts{"event":"E","task":"T","attempts":5,"solves":1}')
  })
})
