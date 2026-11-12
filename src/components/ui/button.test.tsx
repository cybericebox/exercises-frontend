import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Button } from "./button"

describe("Button busy", () => {
  it("disables the button and shows the crest loader before the label", () => {
    const { container } = render(<Button busy>Save</Button>)
    const button = screen.getByRole("button", { name: /Save/ })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
    expect(container.querySelector(".crest-loader")).toBeInTheDocument()
  })

  it("renders no loader when idle", () => {
    const { container } = render(<Button>Save</Button>)
    expect(screen.getByRole("button")).toBeEnabled()
    expect(container.querySelector(".crest-loader")).not.toBeInTheDocument()
  })
})

it("reserves both labels while showing only the current operation to assistive tech", () => {
 const { rerender } = render(<Button busyLabel="Saving a long operation…">Save</Button>)
 const button = screen.getByRole("button", { name: "Save" })
 expect(button.querySelector('[data-busy-size]')).toHaveTextContent("Saving a long operation…")
 rerender(<Button busy busyLabel="Saving a long operation…">Save</Button>)
 expect(screen.getByRole("button", { name: /Saving a long operation…/ })).toBe(button)
 expect(button.querySelector('[data-busy-size]')).toHaveAttribute("aria-hidden", "true")
})

describe("Button keeps one size", () => {
  it("a busy-capable button without an operation label reserves loader + label in both states", () => {
    const { container, rerender } = render(<Button busy={false}>Continue</Button>)
    const sizer = container.querySelector("[data-busy-size]")
    expect(sizer).toHaveTextContent("Continue")
    expect(sizer?.querySelector(".crest-loader")).toBeInTheDocument()
    rerender(<Button busy>Continue</Button>)
    expect(container.querySelector("[data-busy-size]")).toBeInTheDocument()
    expect(container.querySelectorAll(".crest-loader")).toHaveLength(2)
  })

  it("a button that is never busy stays plain", () => {
    const { container } = render(<Button>Continue</Button>)
    expect(container.querySelector("[data-busy-size]")).not.toBeInTheDocument()
  })
})
