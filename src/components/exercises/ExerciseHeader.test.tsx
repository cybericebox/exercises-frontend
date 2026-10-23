import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({
  t: (key: string, vars?: { events?: string; name?: string }) => key === "admin.exPage.action.deleteInUse" ? `In use: ${vars?.events}` : key === "admin.exPage.action.eventName" ? `«${vars?.name}»` : key,
}))
// Plain anchor: the test has no app router to navigate with.
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...rest }: { href: string; children: React.ReactNode; onClick?: (e: React.MouseEvent) => void }) =>
    <a href={href} {...rest} onClick={(event) => { onClick?.(event); event.preventDefault() }}>{children}</a>,
}))

import { ExerciseHeader, type ExerciseHeaderProps } from "./ExerciseHeader"

function makeProps(overrides: Partial<ExerciseHeaderProps> = {}): ExerciseHeaderProps {
  return {
    mode: "view", title: "Web 101", badge: { kind: "changes" }, saveStatus: "saved",
    permissions: { write: true, publish: true, delete: true, export: true },
    archived: false, publishable: true, revertable: true, busy: false, testAvailable: true,
    getTestVariants: () => [{ index: 0, label: "Variant 1", disabled: false }, { index: 1, label: "Variant 2", disabled: true }],
    usageEvents: [],
    onRetrySave: vi.fn(), onCancelNew: vi.fn(), onTest: vi.fn(), onHistory: vi.fn(), onEdit: vi.fn(), onDone: vi.fn(),
    onPublish: vi.fn(), onSnapshot: vi.fn(), onRevert: vi.fn(), onExport: vi.fn(), onArchive: vi.fn(),
    onUnarchive: vi.fn(), onDelete: vi.fn(),
    ...overrides,
  }
}

function openMenu(name: string) {
  fireEvent.keyDown(screen.getByRole("button", { name }), { key: "ArrowDown" })
}

describe("ExerciseHeader", () => {
  it("disables publishing while resources wait for an approval", () => {
    const onPublish = vi.fn()
    render(<ExerciseHeader {...makeProps({ onPublish, publishBlockedReason: "Needs approval" })} />)
    const publish = screen.getByRole("button", { name: "admin.exPage.action.publish" })
    expect(publish).toBeDisabled()
    fireEvent.click(publish)
    expect(onPublish).not.toHaveBeenCalled()
  })

  it("shows the viewing actions without the save indicator", () => {
    render(<ExerciseHeader {...makeProps()} />)
    expect(screen.getByRole("heading", { name: "Web 101" })).toBeInTheDocument()
    expect(screen.getByText("admin.exPage.badge.changes")).toBeInTheDocument()
    for (const name of ["admin.exPage.action.test", "admin.exPage.action.edit", "admin.exPage.action.publish", "admin.exPage.action.more"]) {
      expect(screen.getByRole("button", { name })).toBeEnabled()
    }
    expect(screen.queryByText("admin.exPage.save.saved")).not.toBeInTheDocument()
  })

  it("shows the running test lab next to Test and reopens it", () => {
    const props = makeProps({ activeTestUntil: "2026-09-30T12:00:00Z", onOpenTest: vi.fn() })
    render(<ExerciseHeader {...props} />)
    expect(screen.getByText("admin.exPage.test.running")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.test.open" }))
    expect(props.onOpenTest).toHaveBeenCalled()
  })

  it("shows no running-test chip without an active deploy", () => {
    render(<ExerciseHeader {...makeProps()} />)
    expect(screen.queryByText("admin.exPage.test.running")).not.toBeInTheDocument()
  })

  it("shows Done and the save indicator while editing", () => {
    const props = makeProps({ mode: "edit" })
    render(<ExerciseHeader {...props} />)
    expect(screen.getByText("admin.exPage.save.saved")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.action.done" }))
    expect(props.onDone).toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "admin.exPage.action.edit" })).not.toBeInTheDocument()
  })

  it("offers retry when saving failed", () => {
    const props = makeProps({ mode: "edit", saveStatus: "error" })
    render(<ExerciseHeader {...props} />)
    expect(screen.getByText("admin.exPage.save.error")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.save.retry" }))
    expect(props.onRetrySave).toHaveBeenCalled()
  })

  it("disables the test action when blocked, keeping the reason", () => {
    render(<ExerciseHeader {...makeProps({ testBlocked: true, testBlockedReason: "admin.exPage.action.testNoPlatform" })} />)
    expect(screen.getByRole("button", { name: /admin.exPage.action.test/ })).toBeDisabled()
  })

  it("keeps static variants selectable while a lab variant is disabled with its reason", () => {
    const props = makeProps({
      getTestVariants: () => [
        { index: 0, label: "V1", disabled: false },
        { index: 1, label: "V2", disabled: true, reason: "admin.exPage.action.testNoPlatform" },
      ],
    })
    render(<ExerciseHeader {...props} />)
    openMenu("admin.exPage.action.test")
    expect(screen.getByRole("menuitem", { name: "V2" })).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(screen.getByRole("menuitem", { name: "V1" }))
    expect(props.onTest).toHaveBeenCalledWith(0)
  })

  it("keeps historical History reachable as an icon utility without a primary action row", () => {
    const props = makeProps({ mode:"version", badge:{ kind:"version", label:"Version of 12.09.2026" } })
    const { container } = render(<ExerciseHeader {...props} />)
    expect(screen.getByText("Version of 12.09.2026")).toBeInTheDocument()
    const history = screen.getByRole("button", { name:"admin.exPage.action.history" })
    expect(history.textContent).toBe("")
    expect(history.closest(".general-utilities")).toContainElement(screen.getByRole("link", { name:"admin.exGuide.zavdannia" }))
    expect(container.querySelector(".general-primary-actions")).not.toBeInTheDocument()
    fireEvent.focus(history)
    expect(history).toHaveAccessibleDescription("admin.exPage.action.history")
    fireEvent.click(history)
    expect(props.onHistory).toHaveBeenCalledOnce()
    expect(screen.queryByRole("button", { name:"admin.exPage.action.edit" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name:"admin.exPage.action.publish" })).not.toBeInTheDocument()
  })

  it("hides creation-only actions on a new exercise and links Cancel to the catalog", () => {
    const props = makeProps({ mode: "new", badge: null, saveStatus: "idle" })
    render(<ExerciseHeader {...props} />)
    expect(screen.queryByRole("button", { name: "admin.exPage.action.test" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "admin.exPage.action.history" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "admin.exPage.action.publish" })).toBeDisabled()
    const cancel = screen.getByRole("link", { name: "admin.ex.create.cancel" })
    expect(cancel).toHaveAttribute("href", "/")
    fireEvent.click(cancel)
    expect(props.onCancelNew).toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "admin.exPage.action.more" })).not.toBeInTheDocument()
  })

  it("hides every action the user has no permission for", () => {
    render(<ExerciseHeader {...makeProps({ permissions: { write: false, publish: false, delete: false, export: false } })} />)
    expect(screen.queryByRole("button", { name: "admin.exPage.action.edit" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "admin.exPage.action.publish" })).not.toBeInTheDocument()
  })

  it("lists only permitted items in the more menu", async () => {
    render(<ExerciseHeader {...makeProps({ permissions: { write: false, publish: true, delete: false, export: true } })} />)
    openMenu("admin.exPage.action.more")
    expect(await screen.findByRole("menuitem", { name: "admin.exPage.action.export" })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "admin.exPage.action.revert" })).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "admin.exPage.action.snapshot" })).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "admin.exPage.action.archive" })).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "admin.exPage.action.delete" })).not.toBeInTheDocument()
  })

  it("offers Discard changes with write permission even without publish", async () => {
    render(<ExerciseHeader {...makeProps({ permissions: { write: true, publish: false, delete: false, export: false } })} />)
    expect(screen.queryByRole("button", { name: "admin.exPage.action.publish" })).not.toBeInTheDocument()
    openMenu("admin.exPage.action.more")
    expect(await screen.findByRole("menuitem", { name: "admin.exPage.action.revert" })).toBeInTheDocument()
  })

  it("omits Publish without changes and hides Revert then", async () => {
    render(<ExerciseHeader {...makeProps({ publishable: false, revertable: false, badge: { kind: "published" } })} />)
    expect(screen.queryByRole("button", { name: "admin.exPage.action.publish" })).not.toBeInTheDocument()
    openMenu("admin.exPage.action.more")
    await screen.findByRole("menuitem", { name: "admin.exPage.action.snapshot" })
    expect(screen.queryByRole("menuitem", { name: "admin.exPage.action.revert" })).not.toBeInTheDocument()
  })

  it("disables Delete and names the events that use the exercise", async () => {
    render(<ExerciseHeader {...makeProps({ usageEvents: ["Cybershield 2026", "CTF school"] })} />)
    openMenu("admin.exPage.action.more")
    expect(await screen.findByRole("menuitem", { name: "admin.exPage.action.delete" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText("In use: «Cybershield 2026», «CTF school»")).toBeInTheDocument()
  })

  it("offers Unarchive for an archived exercise and no Edit", async () => {
    const props = makeProps({ archived: true, badge: { kind: "archived" } })
    render(<ExerciseHeader {...props} />)
    expect(screen.queryByRole("button", { name: "admin.exPage.action.edit" })).not.toBeInTheDocument()
    openMenu("admin.exPage.action.more")
    fireEvent.click(await screen.findByRole("menuitem", { name: "admin.exPage.action.unarchive" }))
    expect(props.onUnarchive).toHaveBeenCalled()
  })

  it("starts a test deploy for the chosen variant", async () => {
    const props = makeProps()
    render(<ExerciseHeader {...props} />)
    openMenu("admin.exPage.action.test")
    expect(await screen.findByRole("menuitem", { name: "Variant 2" })).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(screen.getByRole("menuitem", { name: "Variant 1" }))
    expect(props.onTest).toHaveBeenCalledWith(0)
  })

  it("names the publication on the busy Publish button", () => {
    render(<ExerciseHeader {...makeProps({ busy: true, running: "publish" })} />)
    const publish = screen.getByRole("button", { name: /admin\.exPage\.action\.publishing/ })
    expect(publish).toHaveAttribute("aria-busy", "true")
    expect(publish).toBeDisabled()
  })

  it("groups phone Test first, then History/Snapshot, Access, and the destructive actions last", async () => {
    render(<ExerciseHeader {...makeProps({ onAccess: vi.fn() })} />)
    expect(screen.queryByRole("button", { name: "admin.exPage.action.history" })).not.toBeInTheDocument()
    openMenu("admin.exPage.action.more")
    const groups = await screen.findAllByRole("group")
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
      "admin.exPage.action.test", "admin.exGeneral.versions", "admin.exGeneral.access", "admin.exGeneral.transfer", "admin.exGeneral.lifecycle",
    ])
    expect(Array.from(groups[1].querySelectorAll('[role="menuitem"]')).map((item) => item.textContent)).toEqual([
      "admin.exPage.action.history", "admin.exPage.action.snapshot",
    ])
    // Discarding the changes is destructive: it sits with archive and delete at the bottom.
    expect(Array.from(groups[4].querySelectorAll('[role="menuitem"]')).map((item) => item.textContent)).toContain("admin.exPage.action.revert")
    expect(screen.getByRole("menuitem", { name: "exercises.access.button" })).toBeInTheDocument()
    expect(screen.queryByText("admin.exGeneral.importUpdate")).not.toBeInTheDocument()
  })

  it("retains History in More when no other permission exists", async () => {
    render(<ExerciseHeader {...makeProps({ permissions: { write: false, publish: false, delete: false, export: false }, testAvailable: false })} />)
    openMenu("admin.exPage.action.more")
    expect(await screen.findByRole("menuitem", { name: "admin.exPage.action.history" })).toBeInTheDocument()
    expect(screen.getAllByRole("group")).toHaveLength(1)
  })

  it("keeps busy publication visible after publishable becomes false", () => {
    render(<ExerciseHeader {...makeProps({ publishable: false, running: "publish", busy: true })} />)
    expect(screen.getByRole("button", { name: /admin.exPage.action.publishing/ })).toHaveAttribute("aria-busy", "true")
  })
})
