import { describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"
import { Analytics } from "./Analytics"

// next/script stands in as a marker element carrying the id and src
vi.mock("next/script", () => ({ default: (p: { id: string; src?: string }) => <i data-script={p.id} data-src={p.src} /> }))

describe("Analytics", () => {
  it("without GA mounts only the consent panel: no gtag script", () => {
    const { container } = render(<Analytics />)
    expect(container.querySelector("[data-script]")).toBeNull()
  })

  it("with GA loads the boot script and gtag.js", () => {
    const { container } = render(<Analytics gaId="G-TEST" />)
    expect(container.querySelector('[data-src*="googletagmanager"]')).not.toBeNull()
  })
})
