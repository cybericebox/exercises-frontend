import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

import { FileInput } from "./file-input"

const zip = new File(["zip"], "web.zip", { type: "application/zip" })

describe("FileInput", () => {
  it("shows the empty text, then the chosen file name", () => {
    const { rerender } = render(<FileInput id="f" file={null} onFile={vi.fn()} />)
    expect(screen.getByText("admin.exImport.noFile")).toBeInTheDocument()
    rerender(<FileInput id="f" file={zip} onFile={vi.fn()} />)
    expect(screen.getByText("web.zip")).toBeInTheDocument()
  })

  it("reports a file chosen through the hidden input", () => {
    const onFile = vi.fn()
    render(<FileInput id="f" file={null} onFile={onFile} />)
    fireEvent.change(document.getElementById("f")!, { target: { files: [zip] } })
    expect(onFile).toHaveBeenCalledWith(zip)
  })

  it("accepts a dropped file and ignores it when disabled", () => {
    const onFile = vi.fn()
    const { container, rerender } = render(<FileInput id="f" file={null} onFile={onFile} />)
    fireEvent.drop(container.firstElementChild!, { dataTransfer: { files: [zip] } })
    expect(onFile).toHaveBeenCalledWith(zip)
    onFile.mockClear()
    rerender(<FileInput id="f" file={null} onFile={onFile} disabled />)
    fireEvent.drop(container.firstElementChild!, { dataTransfer: { files: [zip] } })
    expect(onFile).not.toHaveBeenCalled()
  })

  it("labels the button with the input, so the picker opens from it", () => {
    render(<FileInput id="f" file={null} onFile={vi.fn()} />)
    expect(screen.getByText("admin.exImport.chooseFile")).toHaveAttribute("for", "f")
  })
})
