import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { NormalizedHint } from "@/api/exercises/versions"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))

import { HintList, formatCountdown } from "./LabWorkbench"

const hint = (ID: string, Level: NormalizedHint["Level"]): NormalizedHint => ({ ID, Text: "x", Level })
const rows = [{ hint: hint("h1", "nudge"), index: 0 }, { hint: hint("h2", "steps"), index: 1 }]

describe("formatCountdown", () => {
  it("writes h:mm:ss and never goes negative", () => {
    expect(formatCountdown(6130_000)).toBe("1:42:10")
    expect(formatCountdown(59_999)).toBe("0:00:59")
    expect(formatCountdown(-5000)).toBe("0:00:00")
  })
})

describe("HintList", () => {
  it("lists hints in catalog order collapsed, with their level, and reveals one on click", () => {
    const onReveal = vi.fn()
    render(<HintList hints={rows} revealed={new Set()} onReveal={onReveal} render={(text) => <p>{`text ${text}`}</p>} />)
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("exercises.hints.level.nudge"), expect.stringContaining("exercises.hints.level.steps")])
    expect(screen.queryByText("text x")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exTest.hintShowNamed 2" }))
    expect(onReveal).toHaveBeenCalledWith("h2")
  })

  it("shows the text of a revealed hint and no button", () => {
    render(<HintList hints={rows} revealed={new Set(["h1"])} onReveal={vi.fn()} render={(text) => <p>{`text ${text}`}</p>} />)
    expect(screen.getByText("text x")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "admin.exTest.hintShowNamed 1" })).not.toBeInTheDocument()
  })

  it("lets a paid mode gate the reveal and label the price", async () => {
    const onReveal = vi.fn()
    const onUnlock = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    render(<HintList hints={rows} revealed={new Set()} onReveal={onReveal} render={() => null} onUnlock={onUnlock} cost={(h) => h.ID === "h1" ? "5 pts" : null} />)
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("5 pts")
    const show = screen.getByRole("button", { name: "admin.exTest.hintShowNamed 1" })
    fireEvent.click(show)
    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1))
    expect(onReveal).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole("button", { name: "admin.exTest.hintShowNamed 1" }))
    await waitFor(() => expect(onReveal).toHaveBeenCalledWith("h1"))
  })
})
