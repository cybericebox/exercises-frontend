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
