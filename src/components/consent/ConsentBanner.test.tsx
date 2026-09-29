import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { openConsentSettings } from "@/lib/consent"
import { ConsentBanner } from "./ConsentBanner"

const clear = () => { document.cookie = "cib_consent=; path=/; max-age=0" }

describe("ConsentBanner", () => {
  afterEach(clear)

  it("asks when no choice exists", () => {
    render(<ConsentBanner gaId="G-TEST" policyHref="https://cybericebox.com/cookies" />)
    expect(screen.getByRole("region", { name: "Аналітичні cookie" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Політиці cookie" })).toHaveAttribute("href", "https://cybericebox.com/cookies")
  })

  it("is hidden once a choice exists", () => {
    document.cookie = "cib_consent=denied; path=/"
    render(<ConsentBanner gaId="G-TEST" policyHref="/cookies" />)
    expect(screen.queryByRole("region")).toBeNull()
  })

  it("is hidden when GA is not configured", () => {
    render(<ConsentBanner gaId="" policyHref="/cookies" />)
    expect(screen.queryByRole("region")).toBeNull()
  })

  it("stores the choice and hides; Esc on first ask is not consent", () => {
    render(<ConsentBanner gaId="G-TEST" policyHref="/cookies" />)
    fireEvent.keyDown(screen.getByRole("region"), { key: "Escape" })
    expect(screen.getByRole("region")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Прийняти аналітику" }))
    expect(document.cookie).toContain("cib_consent=granted")
    expect(screen.queryByRole("region")).toBeNull()
  })

  it("reopens from «Налаштування cookie» with focus inside; Esc closes it unchanged", () => {
    document.cookie = "cib_consent=granted; path=/"
    render(<ConsentBanner gaId="G-TEST" policyHref="/cookies" />)
    act(() => openConsentSettings())
    const region = screen.getByRole("region")
    expect(region).toHaveFocus()
    fireEvent.keyDown(region, { key: "Escape" })
    expect(screen.queryByRole("region")).toBeNull()
    expect(document.cookie).toContain("cib_consent=granted")
  })
})
