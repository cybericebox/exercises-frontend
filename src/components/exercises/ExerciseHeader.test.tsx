import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({
  t: (key: string) => key === "admin.exPage.action.deleteInUse" ? "In use: {events}" : key,
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
  it("shows the viewing actions without the save indicator", () => {
    render(<ExerciseHeader {...makeProps()} />)
    expect(screen.getByRole("heading", { name: "Web 101" })).toBeInTheDocument()
    expect(screen.getByText("admin.exPage.badge.changes")).toBeInTheDocument()
    for (const name of ["admin.exPage.action.test", "admin.exPage.action.history", "admin.exPage.action.edit", "admin.exPage.action.publish", "admin.exPage.action.more"]) {
      expect(screen.getByRole("button", { name })).toBeEnabled()
    }
    expect(screen.queryByText("admin.exPage.save.saved")).not.toBeInTheDocument()
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
    render(<ExerciseHeader {...makeProps({ testBlocked: true, testBlockedReason: "admin.exPage.action.testNoDevices" })} />)
    expect(screen.getByRole("button", { name: /admin.exPage.action.test/ })).toBeDisabled()
  })

  it("keeps only History in version view", () => {
    render(<ExerciseHeader {...makeProps({ mode: "version", badge: { kind: "version", label: "Version of 12.09.2026" } })} />)
    expect(screen.getByText("Version of 12.09.2026")).toBeInTheDocument()
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["admin.exPage.action.history"])
  })

  it("disables creation-only actions on a new exercise and links Cancel to the catalog", () => {
    const props = makeProps({ mode: "new", badge: null, saveStatus: "idle" })
    render(<ExerciseHeader {...props} />)
    expect(screen.getByRole("button", { name: "admin.exPage.action.test" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "admin.exPage.action.history" })).toBeDisabled()
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
    expect(screen.queryByRole("button", { name: "admin.exPage.action.more" })).not.toBeInTheDocument()
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

  it("disables Publish without changes and hides Revert then", async () => {
    render(<ExerciseHeader {...makeProps({ publishable: false, revertable: false, badge: { kind: "published" } })} />)
    expect(screen.getByRole("button", { name: "admin.exPage.action.publish" })).toBeDisabled()
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
})
