import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key}${JSON.stringify(vars)}` : key }))

import { FieldLabel } from "./field-label"
import { SwitchBlock } from "./switch-block"
import { ExpandableRow } from "./expandable-row"
import { MaskedInput, MaskedText } from "./masked-value"

describe("FieldLabel", () => {
  it("binds the label to its control and keeps help outside the label", () => {
    render(<><FieldLabel text="Big field name" required htmlFor="f" helpText="why" /><input id="f" /></>)
    expect(screen.getByRole("textbox", { name: /Big field name/ })).toBeInTheDocument()
    const help = screen.getByRole("button", { name: "ui.help" })
    expect(help.closest("label")).toBeNull()
  })

  it("glues the last word, the asterisk and the help with a word joiner", () => {
    const { container } = render(<FieldLabel text="Two words" required helpText="why" />)
    expect(container.textContent).toContain("⁠")
    expect(container.querySelector("span.whitespace-nowrap")).toHaveTextContent("words*")
  })

  it("shows no help button without help", () => {
    render(<FieldLabel text="Plain" />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})

describe("SwitchBlock", () => {
  function Harness({ unavailable }: { unavailable?: string }) {
    const [on, setOn] = useState(false)
    return <SwitchBlock label="Feature" checked={on} onCheckedChange={setOn} unavailable={unavailable}><input aria-label="dep" /></SwitchBlock>
  }

  it("shows dependent fields only while on", () => {
    render(<Harness />)
    expect(screen.queryByLabelText("dep")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("switch", { name: "Feature" }))
    expect(screen.getByLabelText("dep")).toBeInTheDocument()
  })

  it("is disabled with a reason when unavailable", () => {
    render(<Harness unavailable="no way" />)
    expect(screen.getByRole("switch", { name: "Feature" })).toBeDisabled()
    expect(screen.getByText("no way")).toBeInTheDocument()
  })
})

describe("ExpandableRow", () => {
  function Harness() {
    const [open, setOpen] = useState(false)
    return <ExpandableRow open={open} onOpenChange={setOpen} summary={<span>closed text</span>} ariaLabel="row"><p>form</p></ExpandableRow>
  }

  it("opens by the chevron and by a click on the row", () => {
    render(<Harness />)
    expect(screen.queryByText("form")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "ed.ui.expand: row" }))
    expect(screen.getByText("form")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "ed.ui.collapse: row" }))
    expect(screen.queryByText("form")).not.toBeInTheDocument()
    fireEvent.click(screen.getByText("closed text"))
    expect(screen.getByText("form")).toBeInTheDocument()
  })

  it("does not open when disabled", () => {
    render(<ExpandableRow open={false} onOpenChange={vi.fn()} summary="x" ariaLabel="row" disabled />)
    expect(screen.getByRole("button", { name: "ed.ui.expand: row" })).toBeDisabled()
  })
})

describe("masked values", () => {
  it("MaskedInput hides the value until the eye is pressed", () => {
    render(<MaskedInput aria-label="v" defaultValue="secret" />)
    const input = screen.getByLabelText("v")
    expect(input).toHaveAttribute("type", "password")
    fireEvent.click(screen.getByRole("button", { name: "ed.ui.showValue" }))
    expect(input).toHaveAttribute("type", "text")
    fireEvent.click(screen.getByRole("button", { name: "ed.ui.hideValue" }))
    expect(input).toHaveAttribute("type", "password")
  })

  it("MaskedText shows dots and then the value; empty has no eye", () => {
    const { rerender } = render(<MaskedText value="abc" />)
    expect(screen.queryByText("abc")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "ed.ui.showValue" }))
    expect(screen.getByText("abc")).toBeInTheDocument()
    rerender(<MaskedText value="" />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
