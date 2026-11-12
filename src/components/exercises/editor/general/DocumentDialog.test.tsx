import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
const getDocument = vi.fn()
vi.mock("@/api/exercises/draftDocument", () => ({ getDraftDocument: (...args: unknown[]) => getDocument(...args) }))
const success = vi.fn()
vi.mock("@/components/ui/toast", () => ({ toast: { success: (...args: unknown[]) => success(...args), warning: vi.fn() } }))

import { DocumentDialog } from "./DocumentDialog"
import { EditorHarness } from "./testHarness"
import { baseVariant } from "./testkit"

const open = (exerciseId: string | null = "ex1") => render(<EditorHarness variants={[baseVariant()]} exerciseId={exerciseId}><DocumentDialog onClose={vi.fn()} /></EditorHarness>)

describe("DocumentDialog", () => {
  it("shows the crest loader, then the YAML read from the server, read-only", async () => {
    getDocument.mockResolvedValue("schema: cib-exercise/1.0\nexercise:\n  name: Web\n")
    open()
    expect(screen.getByRole("status")).toBeInTheDocument()
    const pre = await screen.findByLabelText("ed.a.document.aria")
    expect(pre.tagName).toBe("PRE")
    expect(pre.textContent).toContain("schema: cib-exercise/1.0")
    expect(getDocument).toHaveBeenCalledWith("ex1")
  })

  it("copies the document", async () => {
    getDocument.mockResolvedValue("a: 1\n")
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    open()
    await screen.findByLabelText("ed.a.document.aria")
    fireEvent.click(screen.getByRole("button", { name: /ed\.a\.document\.copy/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("a: 1\n"))
    expect(success).toHaveBeenCalledWith("ed.a.document.copied")
  })

  it("shows a load error with a retry that loads again", async () => {
    getDocument.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("b: 2\n")
    open()
    expect(await screen.findByText("ed.a.document.loadError")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "error.load.retry" }))
    expect((await screen.findByLabelText("ed.a.document.aria")).textContent).toContain("b: 2")
  })

  it("says there is no document for an unsaved task and does not call the server", () => {
    getDocument.mockClear()
    open(null)
    expect(screen.getByText("ed.a.document.unsaved")).toBeInTheDocument()
    expect(getDocument).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: /ed\.a\.document\.copy/ })).toBeDisabled()
  })
})
