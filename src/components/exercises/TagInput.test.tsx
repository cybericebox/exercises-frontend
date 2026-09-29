import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { TagInput } from "./TagInput"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

describe("TagInput suggestions", () => {
  it("does not offer already selected tags, even with different casing", () => {
    render(<TagInput value={["WEB"]} onChange={vi.fn()} draftValue="we" onDraftValueChange={vi.fn()}
      suggestions={[{ Tag: "web", Count: 8 }, { Tag: "web-security", Count: 3 }]} />)
    expect(screen.queryByRole("option", { name: /web · 8/ })).not.toBeInTheDocument()
    expect(screen.getByRole("option", { name: /web-security\s*·\s*3/ })).toBeInTheDocument()
  })

  it("selects a suggestion with Enter instead of committing the typed prefix", () => {
    const onChange = vi.fn()
    render(<TagInput value={[]} onChange={onChange} draftValue="cr" onDraftValueChange={vi.fn()}
      suggestions={[{ Tag: "crypto", Count: 2 }]} />)
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" })
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" })
    expect(onChange).toHaveBeenCalledWith(["crypto"])
    expect(onChange).not.toHaveBeenCalledWith(["cr"])
  })

  it("selects a suggestion by pointer without the blur committing the prefix", () => {
    const onChange = vi.fn()
    render(<TagInput value={[]} onChange={onChange} draftValue="cr" onDraftValueChange={vi.fn()}
      suggestions={[{ Tag: "crypto", Count: 2 }]} />)
    fireEvent.pointerDown(screen.getByRole("option", { name: /crypto\s*·\s*2/ }))
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(["crypto"])
  })
})
