/**
 * spinner.test.tsx — the crest Spinner renders an accessible status,
 * honors size, and PageLoader wraps a large one.
 */
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Spinner, LoadingArea, PageLoader } from "./spinner"

describe("Spinner", () => {
  it("renders a status role containing the original crest", () => {
    const { container } = render(<Spinner />)
    expect(screen.getByRole("status")).toBeInTheDocument()
    expect(container.querySelector(".crest-loader img")).toBeInTheDocument()
  })

  it("defaults to the sm size class", () => {
    render(<Spinner />)
    expect(document.querySelector(".crest-loader-sm")).toBeInTheDocument()
  })

  it("applies the requested size class", () => {
    render(<Spinner size="lg" />)
    expect(document.querySelector(".crest-loader-lg")).toBeInTheDocument()
  })

  it("exposes label as sr-only text (and no aria-label when labelled)", () => {
    render(<Spinner label="Loading exercises" />)
    const status = screen.getByRole("status")
    expect(status).not.toHaveAttribute("aria-label")
    expect(screen.getByText("Loading exercises")).toHaveClass("sr-only")
  })

  it("falls back to aria-label when no label is given", () => {
    render(<Spinner />)
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "loading")
  })

  it("merges a caller className", () => {
    render(<Spinner className="text-white" />)
    expect(screen.getByRole("status").className).toContain("text-white")
  })
})

describe("PageLoader", () => {
  it("renders a centered spinner sized by the screen", () => {
    const { container } = render(<PageLoader label="Loading" />)
    expect(container.querySelector(".loading-area-page .crest-loader-auto")).toBeInTheDocument()
    expect(container.querySelector(".fixed.inset-0")).toBeInTheDocument()
    expect(container.querySelector(".loading-area-label")).not.toBeInTheDocument()
  })
})

describe("LoadingArea", () => {
  it("centers the crest in its own panel and uses responsive sizing", () => {
    const { container } = render(<LoadingArea label="Loading this panel" />)
    expect(container.querySelector(".loading-area-panel .crest-loader-auto")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Loading this panel")
    expect(container.querySelector(".loading-area-label")).not.toBeInTheDocument()
  })

  it("shows a caption only for an explicit progress message", () => {
    const { container } = render(<LoadingArea label="Loading" message="Step 2 of 3" />)
    expect(container.querySelector(".loading-area-label")).toHaveTextContent("Step 2 of 3")
  })
})
