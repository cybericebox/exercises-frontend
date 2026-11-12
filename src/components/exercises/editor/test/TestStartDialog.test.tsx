import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/api/exercises/deploy", () => ({ getTestRunLengths: vi.fn() }))

import { getTestRunLengths } from "@/api/exercises/deploy"
import { t } from "@/i18n/t"
import { initialLength, TestStartDialog } from "./TestStartDialog"

const variants = [
  { index: 0, label: "Варіант 1", disabled: false },
  { index: 1, label: "Варіант 2", disabled: true, reason: "Немає лабораторій" },
]

describe("TestStartDialog", () => {
  beforeEach(() => { vi.mocked(getTestRunLengths).mockReset() })

  it("offers the variant and the length, and starts with both", async () => {
    vi.mocked(getTestRunLengths).mockResolvedValue({ AllowedMinutes: [30, 60, 120], DefaultMinutes: 60 })
    const onStart = vi.fn()
    render(<TestStartDialog variants={variants} busy={false} onStart={onStart} onClose={vi.fn()} />)
    expect(screen.getByRole("button", { name: t("ed.d.start.go") })).toBeDisabled()
    await waitFor(() => expect(screen.getByRole("button", { name: t("ed.d.start.go") })).toBeEnabled())
    expect(screen.getByText("Варіант 1")).toBeTruthy()
    expect(screen.getByText("1 год")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: t("ed.d.start.go") }))
    expect(onStart).toHaveBeenCalledWith(0, 60)
  })

  it("the variant that cannot start shows its reason and blocks the start", async () => {
    vi.mocked(getTestRunLengths).mockResolvedValue({ AllowedMinutes: [60], DefaultMinutes: 60 })
    render(<TestStartDialog variants={[variants[1]]} busy={false} onStart={vi.fn()} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText("Немає лабораторій")).toBeTruthy())
    expect(screen.getByRole("button", { name: t("ed.d.start.go") })).toBeDisabled()
  })

  it("a failed read of the lengths says so with a retry and still lets the test start with the server default", async () => {
    vi.mocked(getTestRunLengths).mockRejectedValueOnce(new Error("down")).mockResolvedValue({ AllowedMinutes: [60], DefaultMinutes: 60 })
    const onStart = vi.fn()
    render(<TestStartDialog variants={variants} busy={false} onStart={onStart} onClose={vi.fn()} />)
    await screen.findByText(t("ed.d.start.lengthsFailed"))
    fireEvent.click(screen.getByRole("button", { name: t("ed.d.start.go") }))
    expect(onStart).toHaveBeenCalledWith(0, undefined)
    fireEvent.click(screen.getByRole("button", { name: t("error.load.retry") }))
    await waitFor(() => expect(screen.queryByText(t("ed.d.start.lengthsFailed"))).toBeNull())
  })

  it("names the operation while starting and cannot be closed", async () => {
    vi.mocked(getTestRunLengths).mockResolvedValue({ AllowedMinutes: [60], DefaultMinutes: 60 })
    const onClose = vi.fn()
    render(<TestStartDialog variants={variants} busy onStart={vi.fn()} onClose={onClose} />)
    expect((await screen.findAllByText(t("ed.d.start.busy"))).length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: t("ed.d.cancel") })).toBeDisabled()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    expect(onClose).not.toHaveBeenCalled()
  })

  it("initialLength takes the default, else one hour, else the shortest", () => {
    expect(initialLength({ AllowedMinutes: [30, 60, 120], DefaultMinutes: 120 })).toBe(120)
    expect(initialLength({ AllowedMinutes: [30, 60], DefaultMinutes: 90 })).toBe(60)
    expect(initialLength({ AllowedMinutes: [30, 45], DefaultMinutes: 90 })).toBe(30)
  })
})
