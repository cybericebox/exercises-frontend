import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

import { Field } from "./form-field"
import { SelectMenu } from "./select-menu"

describe("Field", () => {
  it("binds the label, marks required and links only the ids that exist", () => {
    const { rerender } = render(<Field label="Name" required>{(control) => <input {...control} />}</Field>)
    const input = screen.getByLabelText(/^Name/)
    expect(input).toHaveAttribute("aria-required", "true")
    expect(input).not.toHaveAttribute("aria-describedby")
    expect(input).not.toHaveAttribute("aria-invalid")
    rerender(<Field label="Name" required hint="Hint" error="Broken">{(control) => <input {...control} />}</Field>)
    expect(input).toHaveAttribute("aria-invalid", "true")
    const described = input.getAttribute("aria-describedby")!.split(" ")
    expect(described.map((id) => document.getElementById(id)?.textContent)).toEqual(["Hint", "Broken"])
    expect(screen.getByRole("alert")).toHaveTextContent("Broken")
  })

  it("forwards the control props to SelectMenu and announces the chosen value", () => {
    render(<Field label="Level" error="Pick one">{(control) => <SelectMenu {...control} value="b" onChange={vi.fn()} options={[{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }]} />}</Field>)
    const trigger = screen.getByRole("button", { name: "Level" })
    expect(trigger).toHaveAttribute("aria-invalid", "true")
    expect(trigger).toHaveAccessibleDescription("Pick one Beta")
  })
})
